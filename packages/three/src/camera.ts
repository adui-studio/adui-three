import type { Object3D } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ThreeApp } from "./three-app.ts";
import { prepareObjectFrame } from "./camera-frame.ts";
import type { FitObjectOptions, ObjectFrame } from "./camera-frame.ts";
import { beginCameraWrite, cancelCameraMotion } from "./camera-runtime.ts";
export type { TransitionEasing } from "./easing.ts";

export { computeObjectFrame } from "./camera-frame.ts";
export { captureCameraView, restoreCameraView } from "./camera-view.ts";
export { transitionToCameraView } from "./camera-view-transition.ts";
export type {
  CameraViewTransitionOptions,
  CameraViewTransitionHandle,
  CameraViewTransitionResult,
} from "./camera-view-transition.ts";
export type {
  CameraView,
  PerspectiveCameraView,
  OrthographicCameraView,
  CameraViewOptions,
} from "./camera-view.ts";
export { computeOrthographicFrame, fitOrthographicObject } from "./camera-orthographic.ts";
export type { OrthographicObjectFrame } from "./camera-orthographic.ts";
export type { ObjectFrameOptions, FitObjectOptions, ObjectFrame } from "./camera-frame.ts";
export { transitionToObject, transitionOrthographicToObject } from "./camera-transition.ts";
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
  const endWrite = beginCameraWrite(app.camera);
  let controls: OrbitControls | undefined;
  let damping = false,
    autoRotate = false,
    controlsChanged = false;
  try {
    const prepared = prepareObjectFrame(app, object, options);
    controls = prepared.controls;
    const { camera, frame, adjustClipping, active, ownedCamera } = prepared;
    cancelCameraMotion(camera);
    damping = controls?.enableDamping ?? false;
    autoRotate = controls?.autoRotate ?? false;
    if (controls) {
      controlsChanged = true;
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
