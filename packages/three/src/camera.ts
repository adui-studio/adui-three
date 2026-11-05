import { Box3, MathUtils, Vector3 } from "three";
import type { Object3D, PerspectiveCamera } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ThreeApp } from "./three-app.ts";

export interface ObjectFrameOptions {
  /** Bounding-sphere margin, >= 1. Default 1.2. */
  padding?: number;
  /** World-space direction from center toward camera; defaults to the current view's reverse. */
  direction?: readonly [number, number, number];
  /** Nonnegative camera-to-center distance floor. Default 0. */
  minimumDistance?: number;
}

export interface ObjectFrame {
  readonly bounds: Box3;
  readonly center: Vector3;
  readonly position: Vector3;
  readonly radius: number;
  readonly distance: number;
  readonly near: number;
  readonly far: number;
}

export interface FitObjectOptions extends ObjectFrameOptions {
  /** Borrowed controls for this camera. Constraints stay application-owned. */
  controls?: OrbitControls;
  /** Set near/far to the recommended range. Default true. */
  adjustClipping?: boolean;
}

function finite(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}

/** Conservative world AABB sphere fit, accounting for zoom and both axes of a centered frustum. */
export function computeObjectFrame(
  camera: PerspectiveCamera,
  object: Object3D,
  options: ObjectFrameOptions = {},
): ObjectFrame {
  if (!camera?.isPerspectiveCamera || !object?.isObject3D)
    throw new TypeError("A PerspectiveCamera and Object3D are required");
  if (
    camera.parent ||
    !camera.matrixAutoUpdate ||
    !camera.matrixWorldAutoUpdate ||
    !camera.scale.equals(new Vector3(1, 1, 1)) ||
    camera.view?.enabled ||
    camera.filmOffset !== 0
  )
    throw new RangeError("Framing requires an unparented, unscaled, automatic, centered camera");
  const { padding = 1.2, minimumDistance = 0, direction } = options;
  if (!finite([padding, minimumDistance]) || padding < 1 || minimumDistance < 0)
    throw new RangeError("padding must be >= 1 and minimumDistance must be nonnegative and finite");
  if (
    !finite([camera.fov, camera.zoom, camera.aspect, ...camera.up.toArray()]) ||
    camera.fov <= 0 ||
    camera.fov >= 180 ||
    camera.zoom <= 0 ||
    camera.aspect <= 0 ||
    !Number.isFinite(camera.up.lengthSq()) ||
    camera.up.lengthSq() === 0
  )
    throw new RangeError("Invalid camera frustum or up vector");
  const outward = new Vector3();
  if (direction) {
    if (direction.length !== 3 || !finite(direction))
      throw new RangeError("Invalid view direction");
    outward.set(...direction);
  } else camera.getWorldDirection(outward).negate();
  const magnitude = Math.max(...outward.toArray().map(Math.abs));
  if (!Number.isFinite(magnitude) || magnitude === 0)
    throw new RangeError("Invalid view direction");
  outward.divideScalar(magnitude).normalize();
  object.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(object, true);
  if (bounds.isEmpty() || !finite([...bounds.min.toArray(), ...bounds.max.toArray()]))
    throw new RangeError("Object has no finite bounds");
  const size = bounds.getSize(new Vector3());
  const radius = Math.hypot(size.x, size.y, size.z) / 2;
  const center = bounds.getCenter(new Vector3());
  const vertical = MathUtils.degToRad(camera.getEffectiveFOV()) / 2;
  const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
  const angle = Math.min(vertical, horizontal);
  const distance = Math.max((radius * padding) / Math.sin(angle), minimumDistance);
  const near = Math.max((distance - radius) / 2, Number.MIN_VALUE);
  const far = distance + radius * 2;
  const position = center.clone().addScaledVector(outward, distance);
  const representedDistance = Math.hypot(
    position.x - center.x,
    position.y - center.y,
    position.z - center.z,
  );
  if (
    radius <= 0 ||
    angle <= 0 ||
    !finite([radius, angle, distance, near, far, ...center.toArray(), ...position.toArray()]) ||
    near <= 0 ||
    near >= distance - radius ||
    far <= distance + radius ||
    Math.abs(representedDistance - distance) > distance * 1e-6
  )
    throw new RangeError("Object frame exceeds the supported numeric range");
  return { bounds, center, position, radius, distance, near, far };
}

const fitting = new WeakSet<PerspectiveCamera>();

/** Apply an instantaneous fit. No RAF, render, auto-start, resource ownership or following behavior. */
export function fitObject(
  app: ThreeApp,
  object: Object3D,
  options: FitObjectOptions = {},
): ObjectFrame {
  const active = (): void => {
    if (app.state === "disposed" || app.resources.disposed)
      throw new Error("ThreeApp has been disposed");
    if (app.size.width <= 0 || app.size.height <= 0)
      throw new Error("A nonzero viewport is required");
  };
  active();
  const camera = app.camera;
  if (fitting.has(camera)) throw new Error("Camera framing is already in progress");
  const { controls, adjustClipping = true } = options;
  if (typeof adjustClipping !== "boolean") throw new TypeError("adjustClipping must be boolean");
  const ownedCamera = (): void => {
    if (controls && controls.object !== camera)
      throw new Error("Controls belong to a different camera");
  };
  ownedCamera();
  let minimumDistance = options.minimumDistance ?? 0;
  if (!Number.isFinite(minimumDistance) || minimumDistance < 0)
    throw new RangeError("minimumDistance must be nonnegative and finite");
  if (controls) {
    if (!Number.isFinite(controls.minDistance) || controls.minDistance < 0)
      throw new RangeError("Invalid OrbitControls distance constraints");
    minimumDistance = Math.max(minimumDistance, controls.minDistance);
  }
  const frame = computeObjectFrame(camera, object, { ...options, minimumDistance });
  if (controls) {
    const targetRadius = frame.center.distanceTo(controls.cursor);
    if (
      Number.isNaN(controls.maxDistance) ||
      controls.maxDistance < frame.distance ||
      !Number.isFinite(targetRadius) ||
      !finite([
        ...controls.cursor.toArray(),
        controls.minTargetRadius,
        controls.minPolarAngle,
        controls.maxPolarAngle,
      ]) ||
      controls.minTargetRadius < 0 ||
      Number.isNaN(controls.maxTargetRadius) ||
      targetRadius < controls.minTargetRadius ||
      targetRadius > controls.maxTargetRadius ||
      controls.minPolarAngle < 0 ||
      controls.maxPolarAngle > Math.PI ||
      controls.minPolarAngle > controls.maxPolarAngle ||
      Number.isNaN(controls.minAzimuthAngle) ||
      Number.isNaN(controls.maxAzimuthAngle)
    )
      throw new RangeError("OrbitControls constraints cannot contain the requested frame");
  }
  if (
    !adjustClipping &&
    (!finite([camera.near, camera.far]) ||
      camera.near <= 0 ||
      camera.near >= frame.distance - frame.radius ||
      camera.far <= frame.distance + frame.radius)
  )
    throw new RangeError("Existing clipping planes cannot contain the requested frame");

  fitting.add(camera);
  const damping = controls?.enableDamping;
  const autoRotate = controls?.autoRotate;
  try {
    if (controls) {
      controls.enableDamping = false;
      controls.autoRotate = false;
      // Use the public update path to consume residual pan/dolly/rotation before assigning the fit.
      controls.update(0);
      active();
      ownedCamera();
      controls.target.copy(frame.center);
    }
    camera.position.copy(frame.position);
    if (adjustClipping) {
      camera.near = frame.near;
      camera.far = frame.far;
    }
    camera.updateProjectionMatrix();
    camera.lookAt(frame.center);
    controls?.update(0);
    active();
    camera.updateWorldMatrix(true, false);
    frame.position.copy(camera.position);
    return frame;
  } finally {
    if (controls) {
      controls.enableDamping = damping!;
      controls.autoRotate = autoRotate!;
    }
    fitting.delete(camera);
  }
}
