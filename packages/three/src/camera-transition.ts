import { Matrix4, Quaternion, Vector3 } from "three";
import type { Object3D, PerspectiveCamera, OrthographicCamera } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { AnyThreeApp, ThreeApp, OrthographicThreeApp } from "./three-app.ts";
import { prepareObjectFrame } from "./camera-frame.ts";
import { prepareOrthographicFrame } from "./camera-orthographic.ts";
import type { OrthographicObjectFrame } from "./camera-orthographic.ts";
import type { FitObjectOptions, ObjectFrame } from "./camera-frame.ts";
import {
  assertCameraWriteAvailable,
  beginCameraWrite,
  cancelCameraMotion,
  registerCameraMotion,
  removeCameraMotion,
  mixCameraNumber,
  nearCameraVector,
} from "./camera-runtime.ts";

export type CameraTransitionState = "running" | "completed" | "cancelled" | "failed";
export type CameraTransitionResult<F extends ObjectFrame = ObjectFrame> =
  | { status: "completed"; frame: F }
  | { status: "cancelled" }
  | { status: "failed"; error: unknown };

export interface CameraTransitionOptions extends FitObjectOptions {
  /** Positive finite duration, in host delta seconds. Default 0.8. */
  duration?: number;
  signal?: AbortSignal;
}

export interface CameraTransitionHandle<F extends ObjectFrame = ObjectFrame> {
  readonly state: CameraTransitionState;
  /** Uneased progress in [0, 1]. */
  readonly progress: number;
  /** Always resolves, including cancellation and update/cleanup failure. */
  readonly finished: Promise<CameraTransitionResult<F>>;
  cancel(this: void): void;
  dispose(this: void): void;
}

/** Snapshot-based transition driven only by ThreeApp.onUpdate, with one motion per camera. */
export function transitionToObject(
  app: ThreeApp,
  object: Object3D,
  options: CameraTransitionOptions = {},
): CameraTransitionHandle {
  return transitionFrame(app, options, () => prepareObjectFrame(app, object, options));
}

/** Orthographic variant: interpolate native zoom alongside the shared camera motion. */
export function transitionOrthographicToObject(
  app: OrthographicThreeApp,
  object: Object3D,
  options: CameraTransitionOptions = {},
): CameraTransitionHandle<OrthographicObjectFrame> {
  return transitionFrame(
    app,
    options,
    () => prepareOrthographicFrame(app, object, options),
    (frame) => frame.zoom,
  );
}

interface PreparedFrame<F extends ObjectFrame> {
  camera: PerspectiveCamera | OrthographicCamera;
  frame: F;
  controls: OrbitControls | undefined;
  adjustClipping: boolean;
  active(this: void): void;
  ownedCamera(this: void): void;
}

function transitionFrame<F extends ObjectFrame>(
  app: AnyThreeApp,
  options: CameraTransitionOptions,
  prepare: () => PreparedFrame<F>,
  zoomTarget?: (frame: F) => number,
): CameraTransitionHandle<F> {
  assertCameraWriteAvailable(app.camera);
  const { duration = 0.8, signal } = options;
  if (!Number.isFinite(duration) || duration <= 0)
    throw new RangeError("duration must be positive and finite");
  if (app.state === "disposed" || app.resources.disposed)
    throw new Error("ThreeApp has been disposed");
  const cancelled = (): CameraTransitionHandle<F> => ({
    state: "cancelled",
    progress: 0,
    finished: Promise.resolve({ status: "cancelled" }),
    cancel(): void {},
    dispose(): void {},
  });
  if (signal?.aborted) return cancelled();
  const endPreparation = beginCameraWrite(app.camera);
  let prepared: PreparedFrame<F>;
  try {
    prepared = prepare();
  } finally {
    endPreparation();
  }
  const { camera, frame, controls, adjustClipping, active, ownedCamera } = prepared;
  const orthographic = "isOrthographicCamera" in camera;
  const validNear = (value: number): boolean =>
    Number.isFinite(value) && (orthographic ? value >= 0 : value > 0);
  if (signal?.aborted) return cancelled();
  if (
    !camera.position.toArray().every(Number.isFinite) ||
    !camera.quaternion.toArray().every(Number.isFinite) ||
    Math.abs(camera.quaternion.lengthSq() - 1) > 1e-6 ||
    !validNear(camera.near) ||
    !Number.isFinite(camera.far) ||
    camera.far <= camera.near
  )
    throw new RangeError("Invalid starting camera pose");
  if (
    controls &&
    (!controls.target.toArray().every(Number.isFinite) || controls.target.equals(camera.position))
  )
    throw new RangeError("Invalid starting orbit target");
  // Validate before ending an existing, otherwise valid request.
  cancelCameraMotion(camera);
  let state: CameraTransitionState = "running";
  let progress = 0;
  let elapsed = 0;
  let resolve!: (result: CameraTransitionResult<F>) => void;
  const finished = new Promise<CameraTransitionResult<F>>((complete) => {
    resolve = complete;
  });
  const cleanup: Array<() => void> = [];
  const finish = (result: CameraTransitionResult<F>): void => {
    if (state !== "running") return;
    state = result.status;
    removeCameraMotion(camera, handle);
    app.resources.untrack(handle);
    const errors: unknown[] = [];
    for (const release of cleanup.splice(0).reverse()) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      if (result.status === "failed") errors.unshift(result.error);
      state = "failed";
      resolve({
        status: "failed",
        error: new AggregateError(errors, "Camera transition cleanup failed"),
      });
    } else resolve(result);
  };
  const handle: CameraTransitionHandle<F> = {
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
  app.resources.track(handle);
  registerCameraMotion(camera, handle);
  const endWrite = beginCameraWrite(camera);
  try {
    if (signal) {
      signal.addEventListener("abort", handle.cancel, { once: true });
      cleanup.push(() => signal.removeEventListener("abort", handle.cancel));
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
      // Only restore properties which still hold the value leased by this operation.
      cleanup.push(() => {
        for (const key of ["enabled", "enableDamping", "autoRotate"] as const)
          if (controls[key] === false) controls[key] = original[key];
      });
      controls.enabled = false;
      controls.enableDamping = false;
      controls.autoRotate = false;
      controls.update(0);
      if (state !== "running") return handle;
      active();
      ownedCamera();
      const canvas = app.renderer.domElement;
      for (const event of ["pointerdown", "wheel"] as const) {
        canvas.addEventListener(event, handle.cancel, { capture: true, passive: true });
        cleanup.push(() => canvas.removeEventListener(event, handle.cancel, true));
      }
    }
    const startPosition = camera.position.clone();
    const startZoom = camera.zoom;
    const endZoom = zoomTarget?.(frame);
    let lastZoom = startZoom;
    const startRotation = camera.quaternion.clone();
    const endRotation = new Quaternion().setFromRotationMatrix(
      new Matrix4().lookAt(frame.position, frame.center, camera.up),
    );
    const startTarget = controls?.target.clone();
    const startOffset = startTarget ? startPosition.clone().sub(startTarget) : new Vector3();
    const startRadius = Math.hypot(...startOffset.toArray());
    if (controls && (!Number.isFinite(startRadius) || startRadius === 0))
      throw new RangeError("Invalid starting orbit distance");
    const startDirection = controls ? startOffset.divideScalar(startRadius) : new Vector3();
    const endDirection = frame.position.clone().sub(frame.center).divideScalar(frame.distance);
    const orbitRotation = controls
      ? new Quaternion().setFromUnitVectors(startDirection, endDirection)
      : new Quaternion();
    const interpolatedRotation = new Quaternion();
    const interpolatedDirection = new Vector3();
    const lastPosition = camera.position.clone();
    const lastRotation = camera.quaternion.clone();
    const lastTarget = controls?.target.clone();
    const up = camera.up.clone();
    const viewport = { ...app.size };
    const viewState = (): number[] =>
      "isOrthographicCamera" in camera
        ? [camera.left, camera.right, camera.top, camera.bottom]
        : [camera.aspect, camera.fov, camera.filmOffset];
    const view = viewState();
    const constraintState = (): number[] =>
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
    const constraints = constraintState();
    const near = adjustClipping ? Math.min(camera.near, frame.near) : camera.near;
    const far = adjustClipping
      ? Math.max(
          camera.far,
          frame.far,
          Math.hypot(
            startPosition.x - frame.center.x,
            startPosition.y - frame.center.y,
            startPosition.z - frame.center.z,
          ) +
            frame.radius * 2,
        )
      : camera.far;
    if (!validNear(near) || !Number.isFinite(far) || far <= near)
      throw new RangeError("Invalid transition clipping range");
    if (adjustClipping) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
    const unitScale = new Vector3(1, 1, 1);
    cleanup.push(
      app.onUpdate(({ delta }) => {
        if (state !== "running") return;
        const currentView = viewState();
        const rotationDot = Math.abs(camera.quaternion.dot(lastRotation));
        if (
          app.size.width !== viewport.width ||
          app.size.height !== viewport.height ||
          currentView.some((value, index) => value !== view[index]) ||
          camera.zoom !== lastZoom ||
          camera.view?.enabled ||
          camera.parent ||
          !camera.matrixAutoUpdate ||
          !camera.matrixWorldAutoUpdate ||
          !camera.scale.equals(unitScale) ||
          !camera.up.equals(up) ||
          camera.near !== near ||
          camera.far !== far ||
          !nearCameraVector(camera.position, lastPosition) ||
          !Number.isFinite(rotationDot) ||
          Math.abs(1 - rotationDot) > 1e-10 ||
          (controls &&
            (controls.object !== camera ||
              controls.enabled ||
              controls.enableDamping ||
              controls.autoRotate ||
              !nearCameraVector(controls.target, lastTarget!) ||
              constraintState().some((value, index) => value !== constraints[index])))
        ) {
          handle.cancel();
          return;
        }
        const releaseWrite = beginCameraWrite(camera);
        try {
          if (!Number.isFinite(delta) || delta < 0)
            throw new RangeError("Invalid transition delta");
          elapsed = Math.min(duration, elapsed + delta);
          progress = elapsed / duration;
          const t = progress * progress * (3 - 2 * progress);
          if (endZoom !== undefined) {
            camera.zoom = (1 - t) * startZoom + t * endZoom;
            camera.updateProjectionMatrix();
          }
          if (controls) {
            controls.target.lerpVectors(startTarget!, frame.center, t);
            interpolatedRotation.identity().slerp(orbitRotation, t);
            interpolatedDirection.copy(startDirection).applyQuaternion(interpolatedRotation);
            camera.position
              .copy(controls.target)
              .addScaledVector(
                interpolatedDirection,
                mixCameraNumber(startRadius, frame.distance, t),
              );
            camera.lookAt(controls.target);
            controls.update(0);
          } else {
            camera.position.lerpVectors(startPosition, frame.position, t);
            camera.quaternion.slerpQuaternions(startRotation, endRotation, t);
          }
          if (state !== "running") return;
          active();
          ownedCamera();
          camera.updateWorldMatrix(true, false);
          lastPosition.copy(camera.position);
          lastRotation.copy(camera.quaternion);
          lastZoom = camera.zoom;
          if (controls) lastTarget!.copy(controls.target);
          if (progress === 1) {
            if (adjustClipping) {
              camera.near = frame.near;
              camera.far = frame.far;
              camera.updateProjectionMatrix();
            }
            frame.position.copy(camera.position);
            finish({ status: "completed", frame });
          }
        } catch (error) {
          finish({ status: "failed", error });
          throw error;
        } finally {
          releaseWrite();
        }
      }),
    );
    return handle;
  } catch (error) {
    finish({ status: "failed", error });
    throw error;
  } finally {
    endWrite();
  }
}
