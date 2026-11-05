import type { Object3D } from "three";
import type { ThreeApp } from "./three-app.ts";
import { prepareObjectFrame } from "./camera-frame.ts";
import type { FitObjectOptions, ObjectFrame } from "./camera-frame.ts";
import {
  assertCameraWriteAvailable,
  beginCameraWrite,
  cancelCameraMotion,
} from "./camera-runtime.ts";

export { computeObjectFrame } from "./camera-frame.ts";
export type { ObjectFrameOptions, FitObjectOptions, ObjectFrame } from "./camera-frame.ts";
export { transitionToObject } from "./camera-transition.ts";
export type {
  CameraTransitionOptions,
  CameraTransitionHandle,
  CameraTransitionResult,
  CameraTransitionState,
} from "./camera-transition.ts";

/** Instantaneous fit; no RAF, render, auto-start or resource ownership. */
export function fitObject(
  app: ThreeApp,
  object: Object3D,
  options: FitObjectOptions = {},
): ObjectFrame {
  assertCameraWriteAvailable(app.camera);
  const { camera, frame, controls, adjustClipping, active, ownedCamera } = prepareObjectFrame(
    app,
    object,
    options,
  );
  cancelCameraMotion(camera);
  const endWrite = beginCameraWrite(camera);
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
    endWrite();
  }
}
