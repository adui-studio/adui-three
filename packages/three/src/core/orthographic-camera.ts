import { OrthographicCamera } from "three";
import { positive } from "./scene-host.ts";

export interface OrthographicCameraOptions {
  frustumHeight?: number;
  near?: number;
  far?: number;
  position?: readonly [number, number, number];
}
export function createOrthographicCamera(
  options: OrthographicCameraOptions = {},
): OrthographicCamera {
  const { frustumHeight = 10, near = 0, far = 1000, position = [0, 0, 10] } = options;
  positive(frustumHeight, "camera.frustumHeight");
  if (
    !Number.isFinite(near) ||
    near < 0 ||
    !Number.isFinite(far) ||
    far <= near ||
    position.length !== 3 ||
    !position.every(Number.isFinite)
  )
    throw new RangeError("Invalid orthographic frustum or position");
  const half = frustumHeight / 2;
  const camera = new OrthographicCamera(-half, half, half, -half, near, far);
  validOrthographicProjection(camera);
  camera.position.set(...position);
  camera.lookAt(0, 0, 0);
  return camera;
}
export function validOrthographicProjection(camera: OrthographicCamera): void {
  if (
    !camera.projectionMatrix.elements.every(Number.isFinite) ||
    !camera.projectionMatrixInverse.elements.every(Number.isFinite) ||
    camera.projectionMatrixInverse.elements.every((value) => value === 0)
  )
    throw new RangeError("Orthographic projection must be finite and invertible");
}
