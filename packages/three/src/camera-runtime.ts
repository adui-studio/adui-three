import type { Camera } from "three";

interface CameraMotion {
  cancel(): void;
}
const writing = new WeakSet<Camera>();
const motions = new WeakMap<Camera, CameraMotion>();

export function assertCameraWriteAvailable(camera: Camera): void {
  if (writing.has(camera)) throw new Error("Camera framing is already in progress");
}

export function beginCameraWrite(camera: Camera): () => void {
  assertCameraWriteAvailable(camera);
  writing.add(camera);
  return () => {
    writing.delete(camera);
  };
}

export function cancelCameraMotion(camera: Camera): void {
  motions.get(camera)?.cancel();
}

export function registerCameraMotion(camera: Camera, motion: CameraMotion): void {
  motions.set(camera, motion);
}

export function removeCameraMotion(camera: Camera, motion: CameraMotion): void {
  if (motions.get(camera) === motion) motions.delete(camera);
}
