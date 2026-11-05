import type { PerspectiveCamera } from "three";

interface CameraMotion {
  cancel(): void;
}
const writing = new WeakSet<PerspectiveCamera>();
const motions = new WeakMap<PerspectiveCamera, CameraMotion>();

export function assertCameraWriteAvailable(camera: PerspectiveCamera): void {
  if (writing.has(camera)) throw new Error("Camera framing is already in progress");
}

export function beginCameraWrite(camera: PerspectiveCamera): () => void {
  assertCameraWriteAvailable(camera);
  writing.add(camera);
  return () => {
    writing.delete(camera);
  };
}

export function cancelCameraMotion(camera: PerspectiveCamera): void {
  motions.get(camera)?.cancel();
}

export function registerCameraMotion(camera: PerspectiveCamera, motion: CameraMotion): void {
  motions.set(camera, motion);
}

export function removeCameraMotion(camera: PerspectiveCamera, motion: CameraMotion): void {
  if (motions.get(camera) === motion) motions.delete(camera);
}
