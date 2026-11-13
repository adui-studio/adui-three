import { OrthographicCamera, Vector3 } from "three";
import type { Object3D } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { OrthographicThreeApp } from "./three-app.ts";
import { computeObjectBounds } from "./object-bounds.ts";
import type { FitObjectOptions, ObjectFrame, ObjectFrameOptions } from "./camera-frame.ts";
import { beginCameraWrite, cancelCameraMotion } from "./camera-runtime.ts";

export interface OrthographicObjectFrame extends ObjectFrame {
  /** Recommended native zoom. Unzoomed frustum dimensions stay unchanged. */
  readonly zoom: number;
}

/** Conservative world AABB sphere fit for a centered orthographic camera. No camera writes. */
export function computeOrthographicFrame(
  camera: OrthographicCamera,
  object: Object3D,
  options: ObjectFrameOptions = {},
): OrthographicObjectFrame {
  if (!camera?.isOrthographicCamera || !object?.isObject3D)
    throw new TypeError("An OrthographicCamera and Object3D are required");
  if (
    camera.parent ||
    !camera.matrixAutoUpdate ||
    !camera.matrixWorldAutoUpdate ||
    !camera.scale.equals(new Vector3(1, 1, 1)) ||
    camera.view?.enabled ||
    camera.left !== -camera.right ||
    camera.top !== -camera.bottom
  )
    throw new RangeError("Framing requires an unparented, unscaled, automatic, centered camera");
  const { padding = 1.2, minimumDistance = 0, direction } = options;
  const width = camera.right - camera.left,
    height = camera.top - camera.bottom;
  if (
    ![padding, minimumDistance, width, height, camera.zoom, ...camera.up.toArray()].every(
      Number.isFinite,
    ) ||
    padding < 1 ||
    minimumDistance < 0 ||
    width <= 0 ||
    height <= 0 ||
    camera.zoom <= 0 ||
    !Number.isFinite(camera.up.lengthSq()) ||
    camera.up.lengthSq() === 0
  )
    throw new RangeError("Invalid orthographic frustum, up vector or frame options");
  const outward = new Vector3();
  if (direction) {
    if (direction.length !== 3 || !direction.every(Number.isFinite))
      throw new RangeError("Invalid view direction");
    outward.set(...direction);
  } else camera.getWorldDirection(outward).negate();
  const magnitude = Math.max(...outward.toArray().map(Math.abs));
  if (!Number.isFinite(magnitude) || magnitude === 0)
    throw new RangeError("Invalid view direction");
  outward.divideScalar(magnitude).normalize();
  const bounds = computeObjectBounds(object);
  const size = bounds.getSize(new Vector3()),
    center = bounds.getCenter(new Vector3());
  const radius = Math.hypot(size.x, size.y, size.z) / 2;
  const distance = Math.max(radius * padding * 2, minimumDistance);
  const zoom = Math.min(width, height) / (2 * radius * padding);
  const near = Math.max((distance - radius) / 2, Number.MIN_VALUE),
    far = distance + radius * 2;
  const position = center.clone().addScaledVector(outward, distance);
  const represented = position.distanceTo(center);
  if (
    radius <= 0 ||
    zoom <= 0 ||
    near <= 0 ||
    near >= distance - radius ||
    far <= distance + radius ||
    ![radius, distance, zoom, near, far, ...center.toArray(), ...position.toArray()].every(
      Number.isFinite,
    ) ||
    !Number.isFinite(represented) ||
    Math.abs(represented - distance) > distance * 1e-6
  )
    throw new RangeError("Object frame exceeds the supported numeric range");
  const projection = new OrthographicCamera(
    camera.left,
    camera.right,
    camera.top,
    camera.bottom,
    near,
    far,
  );
  projection.zoom = zoom;
  projection.updateProjectionMatrix();
  if (
    !projection.projectionMatrix.elements.every(Number.isFinite) ||
    !projection.projectionMatrixInverse.elements.every(Number.isFinite) ||
    projection.projectionMatrixInverse.elements.every((value) => value === 0)
  )
    throw new RangeError("Object frame projection exceeds the supported numeric range");
  return { bounds, center, position, radius, distance, near, far, zoom };
}

interface PreparedOrthographicFrame {
  camera: OrthographicCamera;
  frame: OrthographicObjectFrame;
  controls: OrbitControls | undefined;
  adjustClipping: boolean;
  active(this: void): void;
  ownedCamera(this: void): void;
}

/** Internal preparation shared by immediate fitting and host-driven transitions. */
export function prepareOrthographicFrame(
  app: OrthographicThreeApp,
  object: Object3D,
  options: FitObjectOptions = {},
): PreparedOrthographicFrame {
  const camera = app.camera;
  const { controls, adjustClipping = true } = options;
  const ownedCamera = (): void => {
    if (controls && controls.object !== camera)
      throw new Error("Controls belong to a different camera");
  };
  const active = (): void => {
    if (app.state === "disposed" || app.resources.disposed)
      throw new Error("ThreeApp has been disposed");
    if (app.size.width <= 0 || app.size.height <= 0)
      throw new Error("A nonzero viewport is required");
    ownedCamera();
  };
  active();
  if (typeof adjustClipping !== "boolean") throw new TypeError("adjustClipping must be boolean");
  let minimumDistance = options.minimumDistance ?? 0;
  if (!Number.isFinite(minimumDistance) || minimumDistance < 0)
    throw new RangeError("Invalid minimumDistance");
  if (controls) {
    if (!Number.isFinite(controls.minDistance) || controls.minDistance < 0)
      throw new RangeError("Invalid OrbitControls distance constraints");
    minimumDistance = Math.max(minimumDistance, controls.minDistance);
  }
  const frame = computeOrthographicFrame(camera, object, {
    padding: options.padding,
    direction: options.direction,
    minimumDistance,
  });
  if (controls) {
    const targetRadius = frame.center.distanceTo(controls.cursor);
    if (
      ![
        controls.minZoom,
        controls.minTargetRadius,
        controls.minPolarAngle,
        controls.maxPolarAngle,
        ...controls.cursor.toArray(),
      ].every(Number.isFinite) ||
      controls.minZoom < 0 ||
      Number.isNaN(controls.maxZoom) ||
      controls.maxZoom < controls.minZoom ||
      frame.zoom < controls.minZoom ||
      frame.zoom > controls.maxZoom ||
      Number.isNaN(controls.maxDistance) ||
      frame.distance > controls.maxDistance ||
      controls.minTargetRadius < 0 ||
      Number.isNaN(controls.maxTargetRadius) ||
      !Number.isFinite(targetRadius) ||
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
    (![camera.near, camera.far].every(Number.isFinite) ||
      camera.near < 0 ||
      camera.near >= frame.distance - frame.radius ||
      camera.far <= frame.distance + frame.radius)
  )
    throw new RangeError("Existing clipping planes cannot contain the requested frame");
  active();
  return { camera, frame, controls, adjustClipping, active, ownedCamera };
}

/** Apply a validated orthographic fit without rendering, starting or scheduling the host. */
export function fitOrthographicObject(
  app: OrthographicThreeApp,
  object: Object3D,
  options: FitObjectOptions = {},
): OrthographicObjectFrame {
  const endWrite = beginCameraWrite(app.camera);
  let controls: OrbitControls | undefined;
  let damping = false,
    autoRotate = false,
    controlsChanged = false;
  try {
    const prepared = prepareOrthographicFrame(app, object, options);
    controls = prepared.controls;
    const { camera, frame, adjustClipping, active } = prepared;
    cancelCameraMotion(camera);
    damping = controls?.enableDamping ?? false;
    autoRotate = controls?.autoRotate ?? false;
    if (controls) {
      controlsChanged = true;
      controls.enableDamping = false;
      controls.autoRotate = false;
      controls.update(0);
      active();
      controls.target.copy(frame.center);
    }
    camera.position.copy(frame.position);
    camera.zoom = frame.zoom;
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
    try {
      if (controls && controlsChanged) {
        controls.enableDamping = damping;
        controls.autoRotate = autoRotate;
      }
    } finally {
      endWrite();
    }
  }
}
