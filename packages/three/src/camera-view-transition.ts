import { Matrix4, OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { AnyThreeApp } from "./three-app.ts";
import type { CameraView, CameraViewOptions } from "./camera-view.ts";
import type { CameraTransitionState } from "./camera-transition.ts";
import { captureCameraView, prepareCameraView, updateCameraViewProjection } from "./camera-view.ts";
import {
  assertCameraWriteAvailable,
  beginCameraWrite,
  cancelCameraMotion,
  registerCameraMotion,
  removeCameraMotion,
  mixCameraNumber,
  mixCameraVector,
  nearCameraVector,
} from "./camera-runtime.ts";

export interface CameraViewTransitionOptions extends CameraViewOptions {
  /** Positive finite host seconds. Default 0.8. */
  duration?: number;
  signal?: AbortSignal;
}
export type CameraViewTransitionResult =
  | { status: "completed"; view: CameraView }
  | { status: "cancelled" }
  | { status: "failed"; error: unknown };
export interface CameraViewTransitionHandle {
  readonly state: CameraTransitionState;
  /** Uneased host progress [0,1]. */
  readonly progress: number;
  readonly finished: Promise<CameraViewTransitionResult>;
  cancel(this: void): void;
  dispose(this: void): void;
}

type ViewCamera = PerspectiveCamera | OrthographicCamera;
const lens = (camera: ViewCamera): number[] =>
  camera instanceof PerspectiveCamera
    ? [camera.fov, camera.aspect]
    : [camera.left, camera.right, camera.top, camera.bottom];
const equalNumbers = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);
function nearRotation(a: Quaternion, b: Quaternion): boolean {
  const first = a.lengthSq(),
    second = b.lengthSq();
  const dot = Math.abs(a.dot(b)) / Math.sqrt(first * second);
  return Number.isFinite(dot) && Math.abs(first - second) <= 1e-10 && Math.abs(1 - dot) <= 1e-10;
}

/** Smooth same-kind bookmark restoration. Borrows the camera/controls; never starts or draws the host. */
export function transitionToCameraView(
  app: AnyThreeApp,
  input: CameraView,
  options: CameraViewTransitionOptions = {},
): CameraViewTransitionHandle {
  assertCameraWriteAvailable(app.camera);
  const { duration = 0.8, signal, controls } = options;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new RangeError("duration must be positive and finite");
  if (app.state === "disposed" || app.resources.disposed)
    throw new Error("ThreeApp has been disposed");
  if (signal?.aborted)
    return {
      state: "cancelled",
      progress: 0,
      finished: Promise.resolve({ status: "cancelled" }),
      cancel(): void {},
      dispose(): void {},
    };
  const endPreparation = beginCameraWrite(app.camera);
  let fail: ((result: CameraViewTransitionResult) => CameraViewTransitionResult) | undefined;
  try {
    const prepared = prepareCameraView(app, input, { controls });
    const { camera, candidate, view, owned } = prepared;
    // Both source and destination must be coherent orbit views before replacing an existing motion.
    prepareCameraView(app, captureCameraView(app, { controls }), { controls });
    owned();
    cancelCameraMotion(camera);
    owned();
    let state: CameraTransitionState = "running",
      progress = 0,
      elapsed = 0;
    let outcome: CameraViewTransitionResult | undefined;
    let resolve!: (result: CameraViewTransitionResult) => void;
    const finished = new Promise<CameraViewTransitionResult>((complete) => {
      resolve = complete;
    });
    const cleanup: Array<() => void> = [];
    const finish = (result: CameraViewTransitionResult): CameraViewTransitionResult => {
      if (outcome) return outcome;
      outcome = result;
      state = result.status;
      removeCameraMotion(camera, handle);
      const errors: unknown[] = [];
      for (const release of [() => app.resources.untrack(handle), ...cleanup.splice(0).reverse()]) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        if (result.status === "failed") errors.unshift(result.error);
        outcome = {
          status: "failed",
          error: new AggregateError(errors, "Camera view transition cleanup failed"),
        };
        state = "failed";
      }
      resolve(outcome);
      return outcome;
    };
    const handle: CameraViewTransitionHandle = {
      get state() {
        return state;
      },
      get progress() {
        return progress;
      },
      finished,
      cancel(): void {
        finish({ status: "cancelled" });
      },
      dispose(): void {
        finish({ status: "cancelled" });
      },
    };
    fail = finish;
    app.resources.track(handle);
    registerCameraMotion(camera, handle);
    if (signal) {
      cleanup.push(() => signal.removeEventListener("abort", handle.cancel));
      signal.addEventListener("abort", handle.cancel, { once: true });
      if (signal.aborted) {
        handle.cancel();
        return handle;
      }
    }
    if (controls) {
      const original = {
        enabled: controls.enabled,
        enableDamping: controls.enableDamping,
        autoRotate: controls.autoRotate,
      };
      cleanup.push(() => {
        for (const key of ["enabled", "enableDamping", "autoRotate"] as const)
          if (controls[key] === false) controls[key] = original[key];
      });
      controls.enabled = controls.enableDamping = controls.autoRotate = false;
      controls.update(0);
      if (state !== "running") return handle;
      owned();
      const canvas = app.renderer.domElement;
      for (const event of ["pointerdown", "wheel"] as const) {
        cleanup.push(() => canvas.removeEventListener(event, handle.cancel, true));
        canvas.addEventListener(event, handle.cancel, { capture: true, passive: true });
      }
    }
    captureCameraView(app, { controls });
    const startPosition = camera.position.clone(),
      startRotation = camera.quaternion.clone();
    const startUp = camera.up.clone(),
      startZoom = camera.zoom,
      startLens = lens(camera);
    const endLens = lens(candidate),
      viewport = { ...app.size };
    const near = Math.min(camera.near, candidate.near),
      far = Math.max(camera.far, candidate.far);
    const stage = candidate.clone();
    const startTarget = controls?.target.clone(),
      endTarget = view.target ? new Vector3().fromArray(view.target) : undefined;
    const offset = startTarget ? startPosition.clone().sub(startTarget) : new Vector3();
    const startRadius = Math.hypot(...offset.toArray());
    const endOffset = endTarget ? candidate.position.clone().sub(endTarget) : new Vector3();
    const endRadius = Math.hypot(...endOffset.toArray());
    const direction = controls ? offset.divideScalar(startRadius) : new Vector3();
    const orbitRotation = controls
      ? new Quaternion().setFromUnitVectors(direction, endOffset.divideScalar(endRadius))
      : new Quaternion();
    const interpolated = new Quaternion(),
      nextDirection = new Vector3(),
      nextTarget = new Vector3();
    const nextPosition = new Vector3(),
      nextRotation = new Quaternion(),
      look = new Matrix4();
    const lastPosition = camera.position.clone(),
      lastRotation = camera.quaternion.clone(),
      lastTarget = controls?.target.clone();
    const unitScale = new Vector3(1, 1, 1);
    const constraints = (): number[] =>
      controls
        ? [
            controls.minDistance,
            controls.maxDistance,
            controls.minZoom,
            controls.maxZoom,
            controls.minTargetRadius,
            controls.maxTargetRadius,
            controls.minPolarAngle,
            controls.maxPolarAngle,
            controls.minAzimuthAngle,
            controls.maxAzimuthAngle,
            ...controls.cursor.toArray(),
          ]
        : [];
    const initialConstraints = constraints();
    const projectionState = (): number[] => [camera.zoom, camera.near, camera.far, ...lens(camera)];
    const project = (t: number, position: Vector3, rotation: Quaternion, final = false): void => {
      stage.position.copy(position);
      stage.quaternion.copy(rotation);
      stage.zoom = mixCameraNumber(startZoom, candidate.zoom, t);
      stage.near = final ? candidate.near : near;
      stage.far = final ? candidate.far : far;
      if (stage instanceof PerspectiveCamera) {
        stage.fov = mixCameraNumber(startLens[0]!, endLens[0]!, t);
        stage.aspect = mixCameraNumber(startLens[1]!, endLens[1]!, t);
      } else {
        stage.left = mixCameraNumber(startLens[0]!, endLens[0]!, t);
        stage.right = mixCameraNumber(startLens[1]!, endLens[1]!, t);
        stage.top = mixCameraNumber(startLens[2]!, endLens[2]!, t);
        stage.bottom = mixCameraNumber(startLens[3]!, endLens[3]!, t);
      }
      updateCameraViewProjection(stage, camera);
      camera.zoom = stage.zoom;
      camera.near = stage.near;
      camera.far = stage.far;
      if (camera instanceof PerspectiveCamera && stage instanceof PerspectiveCamera) {
        camera.fov = stage.fov;
        camera.aspect = stage.aspect;
      } else if (camera instanceof OrthographicCamera && stage instanceof OrthographicCamera) {
        camera.left = stage.left;
        camera.right = stage.right;
        camera.top = stage.top;
        camera.bottom = stage.bottom;
      }
      camera.updateProjectionMatrix();
    };
    project(0, startPosition, startRotation);
    if (state !== "running") return handle;
    owned();
    let expectedProjection = projectionState();
    const unsubscribe = app.onUpdate(({ delta }) => {
      if (state !== "running") return;
      if (
        app.camera !== camera ||
        app.size.width !== viewport.width ||
        app.size.height !== viewport.height ||
        camera.parent ||
        camera.view?.enabled ||
        !camera.matrixAutoUpdate ||
        !camera.matrixWorldAutoUpdate ||
        !camera.scale.equals(unitScale) ||
        !camera.up.equals(startUp) ||
        (camera instanceof PerspectiveCamera && camera.filmOffset !== 0) ||
        !nearCameraVector(camera.position, lastPosition) ||
        !nearRotation(camera.quaternion, lastRotation) ||
        !equalNumbers(projectionState(), expectedProjection) ||
        (controls &&
          (controls.object !== camera ||
            controls.enabled ||
            controls.enableDamping ||
            controls.autoRotate ||
            !nearCameraVector(controls.target, lastTarget!) ||
            !equalNumbers(constraints(), initialConstraints)))
      ) {
        handle.cancel();
        return;
      }
      const endWrite = beginCameraWrite(camera);
      try {
        if (!Number.isFinite(delta) || delta < 0) throw new RangeError("Invalid transition delta");
        elapsed = Math.min(duration, elapsed + delta);
        progress = elapsed / duration;
        const t = progress * progress * (3 - 2 * progress);
        if (controls) {
          mixCameraVector(startTarget!, endTarget!, t, nextTarget);
          interpolated.identity().slerp(orbitRotation, t);
          nextDirection.copy(direction).applyQuaternion(interpolated);
          const radius = mixCameraNumber(startRadius, endRadius, t);
          nextPosition.copy(nextTarget).addScaledVector(nextDirection, radius);
          if (!Number.isFinite(radius) || radius <= 0 || nextPosition.equals(nextTarget))
            throw new RangeError("Camera view orbit exceeds the supported numeric range");
          nextRotation.setFromRotationMatrix(look.lookAt(nextPosition, nextTarget, startUp));
        } else {
          mixCameraVector(startPosition, candidate.position, t, nextPosition);
          nextRotation.slerpQuaternions(startRotation, candidate.quaternion, t);
        }
        project(t, nextPosition, nextRotation);
        if (state !== "running") return;
        owned();
        expectedProjection = projectionState();
        if (controls) controls.target.copy(nextTarget);
        camera.position.copy(nextPosition);
        if (state !== "running") return;
        owned();
        camera.quaternion.copy(nextRotation);
        if (state !== "running") return;
        controls?.update(0);
        if (state !== "running") return;
        owned();
        if (
          !equalNumbers(projectionState(), expectedProjection) ||
          !equalNumbers(constraints(), initialConstraints) ||
          !camera.up.equals(startUp)
        ) {
          handle.cancel();
          return;
        }
        camera.updateWorldMatrix(true, false);
        if (state !== "running") return;
        owned();
        if (
          ![...camera.matrixWorld.elements, ...camera.matrixWorldInverse.elements].every(
            Number.isFinite,
          )
        )
          throw new RangeError("Camera view pose exceeds the supported numeric range");
        lastPosition.copy(camera.position);
        lastRotation.copy(camera.quaternion);
        if (controls) lastTarget!.copy(controls.target);
        if (progress === 1) {
          project(1, camera.position, camera.quaternion, true);
          if (state !== "running") return;
          owned();
          camera.up.copy(candidate.up);
          const actual = captureCameraView(app, { controls });
          finish({ status: "completed", view: actual });
        }
      } catch (error) {
        const result = finish({ status: "failed", error });
        throw result.status === "failed" ? result.error : error;
      } finally {
        endWrite();
      }
    });
    if (state !== "running") unsubscribe();
    else cleanup.push(unsubscribe);
    return handle;
  } catch (error) {
    const result = fail?.({ status: "failed", error });
    throw result?.status === "failed" ? result.error : error;
  } finally {
    endPreparation();
  }
}
