import { PerspectiveCamera } from "three";
import { positive } from "./scene-host.ts";

export interface PerspectiveCameraOptions {
  fov?: number;
  near?: number;
  far?: number;
  position?: readonly [number, number, number];
}

export function createPerspectiveCamera(options: PerspectiveCameraOptions = {}): PerspectiveCamera {
  const { fov = 50, near = 0.1, far = 1000, position = [3, 2, 5] } = options;
  positive(fov, "camera.fov");
  positive(near, "camera.near");
  positive(far, "camera.far");
  if (fov >= 180 || far <= near || position.length !== 3 || !position.every(Number.isFinite))
    throw new RangeError("Invalid camera frustum or position");
  const camera = new PerspectiveCamera(fov, 1, near, far);
  camera.position.set(...position);
  camera.lookAt(0, 0, 0);
  return camera;
}
