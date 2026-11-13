import { Matrix4, OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { Camera } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { AnyThreeApp } from "./three-app.ts";
import { beginCameraWrite, cancelCameraMotion } from "./camera-runtime.ts";

type Point = readonly [number, number, number];
interface ViewPose {
  readonly version: 1;
  readonly position: Point;
  readonly quaternion: readonly [number, number, number, number];
  readonly up: Point;
  readonly zoom: number;
  readonly near: number;
  readonly far: number;
  /** Present only when captured with borrowed OrbitControls. */
  readonly target?: Point;
}
export interface PerspectiveCameraView extends ViewPose {
  readonly kind: "perspective";
  readonly fov: number;
}
export interface OrthographicCameraView extends ViewPose {
  readonly kind: "orthographic";
  readonly top: number;
  readonly bottom: number;
  readonly centerX: number;
}
export type CameraView = PerspectiveCameraView | OrthographicCameraView;
export interface CameraViewOptions {
  controls?: OrbitControls;
}

function tuple(value: unknown, length: number): number[] {
  if (!Array.isArray(value) || value.length !== length)
    throw new RangeError("Invalid camera view tuple");
  const copy: unknown[] = Array.from(value);
  if (!copy.every((item) => typeof item === "number" && Number.isFinite(item)))
    throw new RangeError("Camera view tuples must contain finite numbers");
  return copy as number[];
}
function point(value: unknown): Point {
  const numbers = tuple(value, 3);
  return [numbers[0]!, numbers[1]!, numbers[2]!];
}
function readView(input: CameraView): CameraView {
  if (!input || input.version !== 1 || !["perspective", "orthographic"].includes(input.kind))
    throw new TypeError("A version 1 camera view is required");
  const kind = input.kind;
  const rotation = tuple(input.quaternion, 4);
  const position = point(input.position),
    up = point(input.up);
  const target = input.target === undefined ? undefined : point(input.target);
  const { zoom, near, far } = input;
  if (
    ![zoom, near, far].every(Number.isFinite) ||
    zoom <= 0 ||
    near < 0 ||
    far <= near ||
    (kind === "perspective" && near === 0) ||
    Math.abs(Math.hypot(...rotation) - 1) > 1e-6 ||
    !Number.isFinite(Math.hypot(...up)) ||
    Math.hypot(...up) === 0
  )
    throw new RangeError("Invalid camera view pose or clipping range");
  const base: ViewPose = {
    version: 1,
    position,
    up,
    target,
    zoom,
    near,
    far,
    quaternion: [rotation[0]!, rotation[1]!, rotation[2]!, rotation[3]!],
  };
  if (kind === "perspective") {
    const fov = (input as PerspectiveCameraView).fov;
    if (!Number.isFinite(fov) || fov <= 0 || fov >= 180)
      throw new RangeError("Invalid camera view fov");
    return { ...base, kind, fov };
  }
  const { top, bottom, centerX } = input as OrthographicCameraView;
  if (![top, bottom, centerX, top - bottom].every(Number.isFinite) || top <= bottom)
    throw new RangeError("Invalid camera view orthographic span");
  return { ...base, kind, top, bottom, centerX };
}
function active(app: AnyThreeApp): void {
  if (app.state === "disposed" || app.resources.disposed)
    throw new Error("ThreeApp has been disposed");
}
function supported(camera: Camera): PerspectiveCamera | OrthographicCamera {
  if (!(camera instanceof PerspectiveCamera) && !(camera instanceof OrthographicCamera))
    throw new TypeError("A perspective or orthographic camera is required");
  if (
    camera.parent ||
    !camera.matrixAutoUpdate ||
    !camera.matrixWorldAutoUpdate ||
    !camera.scale.equals(new Vector3(1, 1, 1)) ||
    camera.view?.enabled ||
    (camera instanceof PerspectiveCamera && camera.filmOffset !== 0)
  )
    throw new RangeError(
      "Camera views require an unparented, unscaled, automatic camera without view offsets",
    );
  return camera;
}
function projection(
  view: CameraView,
  aspect: number,
  source: Camera,
): PerspectiveCamera | OrthographicCamera {
  if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError("Invalid camera view aspect");
  let camera: PerspectiveCamera | OrthographicCamera;
  if (view.kind === "perspective")
    camera = new PerspectiveCamera(view.fov, aspect, view.near, view.far);
  else {
    const half = ((view.top - view.bottom) / 2) * aspect;
    const left = view.centerX - half,
      right = view.centerX + half;
    if (![left, right].every(Number.isFinite) || right <= left)
      throw new RangeError("Camera view exceeds the supported numeric range");
    camera = new OrthographicCamera(left, right, view.top, view.bottom, view.near, view.far);
  }
  camera.zoom = view.zoom;
  camera.position.fromArray(view.position);
  camera.quaternion.fromArray(view.quaternion);
  camera.up.fromArray(view.up);
  updateCameraViewProjection(camera, source);
  return camera;
}

/** Internal CPU-only projection validation; preserves the host's readonly depth mode. */
export function updateCameraViewProjection(
  camera: PerspectiveCamera | OrthographicCamera,
  source: Camera,
): void {
  camera.coordinateSystem = source.coordinateSystem;
  camera.updateProjectionMatrix();
  if (source.reversedDepth) {
    // The native flag is readonly. Build only the temporary projection through public Matrix4 APIs.
    if (camera instanceof PerspectiveCamera) {
      const top = (camera.near * Math.tan((camera.fov * Math.PI) / 360)) / camera.zoom;
      const height = 2 * top,
        width = camera.aspect * height,
        left = -width / 2;
      camera.projectionMatrix.makePerspective(
        left,
        left + width,
        top,
        top - height,
        camera.near,
        camera.far,
        camera.coordinateSystem,
        true,
      );
    } else {
      const halfWidth = (camera.right - camera.left) / (2 * camera.zoom);
      const halfHeight = (camera.top - camera.bottom) / (2 * camera.zoom);
      const x = (camera.right + camera.left) / 2,
        y = (camera.top + camera.bottom) / 2;
      camera.projectionMatrix.makeOrthographic(
        x - halfWidth,
        x + halfWidth,
        y + halfHeight,
        y - halfHeight,
        camera.near,
        camera.far,
        camera.coordinateSystem,
        true,
      );
    }
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  camera.updateMatrixWorld(true);
  for (const matrix of [
    camera.projectionMatrix,
    camera.projectionMatrixInverse,
    camera.matrixWorld,
    camera.matrixWorldInverse,
  ])
    if (!matrix.elements.every(Number.isFinite) || matrix.elements.every((value) => value === 0))
      throw new RangeError("Camera view matrices must be finite and invertible");
}
function orbitPose(view: CameraView): void {
  if (Math.abs(Math.hypot(...view.up) - 1) > 1e-6)
    throw new RangeError("Orbit views require a unit up vector");
  if (!view.target) throw new Error("Capture an orbit target before restoring with controls");
  const position = new Vector3().fromArray(view.position),
    target = new Vector3().fromArray(view.target);
  if (!Number.isFinite(position.distanceTo(target)) || position.equals(target))
    throw new RangeError("Invalid orbit view distance");
  const expected = new Quaternion().setFromRotationMatrix(
    new Matrix4().lookAt(position, target, new Vector3().fromArray(view.up)),
  );
  if (Math.abs(1 - Math.abs(expected.dot(new Quaternion().fromArray(view.quaternion)))) > 1e-6)
    throw new RangeError("Orbit view rotation must look at its target without roll");
}

/** Copy current configuration into independent JSON-compatible numbers. Does not sample or draw. */
export function captureCameraView(app: AnyThreeApp, options: CameraViewOptions = {}): CameraView {
  active(app);
  const controls = options.controls,
    camera = supported(app.camera);
  if (controls && controls.object !== camera)
    throw new Error("Controls belong to a different camera");
  const base: ViewPose = {
    version: 1,
    position: [camera.position.x, camera.position.y, camera.position.z],
    quaternion: [
      camera.quaternion.x,
      camera.quaternion.y,
      camera.quaternion.z,
      camera.quaternion.w,
    ],
    up: [camera.up.x, camera.up.y, camera.up.z],
    zoom: camera.zoom,
    near: camera.near,
    far: camera.far,
    target: controls ? [controls.target.x, controls.target.y, controls.target.z] : undefined,
  };
  const view = readView(
    camera instanceof PerspectiveCamera
      ? { ...base, kind: "perspective", fov: camera.fov }
      : {
          ...base,
          kind: "orthographic",
          top: camera.top,
          bottom: camera.bottom,
          centerX: camera.left / 2 + camera.right / 2,
        },
  );
  const aspect =
    camera instanceof PerspectiveCamera
      ? camera.aspect
      : (camera.right - camera.left) / (camera.top - camera.bottom);
  projection(view, aspect, camera);
  if (controls) orbitPose(view);
  active(app);
  return view;
}

export interface PreparedCameraView {
  camera: PerspectiveCamera | OrthographicCamera;
  candidate: PerspectiveCamera | OrthographicCamera;
  view: CameraView;
  controls: OrbitControls | undefined;
  owned(this: void): void;
}

/** Internal common preflight. Call under the camera write lock; no host or control writes. */
export function prepareCameraView(
  app: AnyThreeApp,
  input: CameraView,
  options: CameraViewOptions = {},
): PreparedCameraView {
  active(app);
  const camera = supported(app.camera),
    view = readView(input);
  if (camera instanceof PerspectiveCamera !== (view.kind === "perspective"))
    throw new TypeError("Camera view kind does not match the host");
  if (app.size.width <= 0 || app.size.height <= 0)
    throw new Error("A nonzero viewport is required");
  const candidate = projection(view, app.size.width / app.size.height, camera);
  const controls = options.controls;
  const owned = (): void => {
    active(app);
    if (app.camera !== camera) throw new Error("ThreeApp camera changed during view preparation");
    if (controls && controls.object !== camera)
      throw new Error("Controls belong to a different camera");
  };
  owned();
  if (controls) {
    orbitPose(view);
    if (!camera.up.equals(candidate.up))
      throw new RangeError("Restore orbit views with the controls' current up vector");
    const distance = candidate.position.distanceTo(new Vector3().fromArray(view.target!));
    const radius = new Vector3().fromArray(view.target!).distanceTo(controls.cursor);
    if (
      ![
        controls.minDistance,
        controls.minTargetRadius,
        controls.minPolarAngle,
        controls.maxPolarAngle,
        ...controls.cursor.toArray(),
      ].every(Number.isFinite) ||
      controls.minDistance < 0 ||
      Number.isNaN(controls.maxDistance) ||
      controls.maxDistance < controls.minDistance ||
      distance < controls.minDistance ||
      distance > controls.maxDistance ||
      controls.minTargetRadius < 0 ||
      Number.isNaN(controls.maxTargetRadius) ||
      !Number.isFinite(radius) ||
      radius < controls.minTargetRadius ||
      radius > controls.maxTargetRadius ||
      controls.minPolarAngle < 0 ||
      controls.maxPolarAngle > Math.PI ||
      controls.minPolarAngle > controls.maxPolarAngle ||
      Number.isNaN(controls.minAzimuthAngle) ||
      Number.isNaN(controls.maxAzimuthAngle) ||
      (view.kind === "orthographic" &&
        (!Number.isFinite(controls.minZoom) ||
          controls.minZoom < 0 ||
          Number.isNaN(controls.maxZoom) ||
          view.zoom < controls.minZoom ||
          view.zoom > controls.maxZoom))
    )
      throw new RangeError("OrbitControls constraints cannot contain the camera view");
  }
  owned();
  return { camera, candidate, view, controls, owned };
}

/** Restore for the current CSS aspect. Native orbit angle limits may adjust the resulting pose. */
export function restoreCameraView(
  app: AnyThreeApp,
  input: CameraView,
  options: CameraViewOptions = {},
): CameraView {
  const endWrite = beginCameraWrite(app.camera);
  let controls: OrbitControls | undefined,
    damping = false,
    autoRotate = false,
    leased = false;
  try {
    const prepared = prepareCameraView(app, input, options);
    const { camera, candidate, view, owned } = prepared;
    controls = prepared.controls;
    cancelCameraMotion(camera);
    owned();
    damping = controls?.enableDamping ?? false;
    autoRotate = controls?.autoRotate ?? false;
    if (controls) {
      leased = true;
      controls.enableDamping = false;
      controls.autoRotate = false;
      controls.update(0);
      owned();
    }
    camera.position.copy(candidate.position);
    camera.quaternion.copy(candidate.quaternion);
    camera.up.copy(candidate.up);
    camera.zoom = candidate.zoom;
    camera.near = candidate.near;
    camera.far = candidate.far;
    if (camera instanceof PerspectiveCamera && candidate instanceof PerspectiveCamera) {
      camera.fov = candidate.fov;
      camera.aspect = candidate.aspect;
    } else if (camera instanceof OrthographicCamera && candidate instanceof OrthographicCamera) {
      camera.left = candidate.left;
      camera.right = candidate.right;
      camera.top = candidate.top;
      camera.bottom = candidate.bottom;
    }
    if (controls) controls.target.fromArray(view.target!);
    camera.updateProjectionMatrix();
    controls?.update(0);
    owned();
    camera.updateWorldMatrix(true, false);
    return captureCameraView(app, { controls });
  } finally {
    try {
      if (controls && leased) {
        controls.enableDamping = damping;
        controls.autoRotate = autoRotate;
      }
    } finally {
      endWrite();
    }
  }
}
