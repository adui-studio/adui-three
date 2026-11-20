import type { WebGLRendererParameters } from "three";
import type { WebGPURendererParameters } from "three/webgpu";
import type { SceneHostOptions } from "./scene-host.ts";
import type { PerspectiveCameraOptions } from "./perspective-camera.ts";
import type { OrthographicCameraOptions } from "./orthographic-camera.ts";

export type RendererType = "webgl" | "webgpu";

export interface WebGLRendererOptions extends Omit<WebGLRendererParameters, "canvas" | "context"> {
  type?: "webgl";
}

export interface WebGPURendererOptions extends Pick<
  WebGPURendererParameters,
  | "antialias"
  | "alpha"
  | "depth"
  | "stencil"
  | "samples"
  | "reversedDepthBuffer"
  | "logarithmicDepthBuffer"
  | "powerPreference"
  | "outputBufferType"
> {
  type: "webgpu";
  /** Permit the native node renderer's WebGL 2 fallback. Default true. */
  allowFallback?: boolean;
}

interface CreateOptions extends SceneHostOptions {
  camera?: PerspectiveCameraOptions;
  /** Cancels creation only. Destroy a delivered instance to end its lifetime. */
  signal?: AbortSignal;
}

export interface WebGLCreateOptions extends CreateOptions {
  renderer?: WebGLRendererOptions;
}

export interface WebGPUCreateOptions extends CreateOptions {
  renderer: WebGPURendererOptions;
  /** Reports late cleanup failures after creation was cancelled or failed. */
  onCleanupError?: (error: unknown) => void;
}

export type ThreeAppCreateOptions = WebGLCreateOptions | WebGPUCreateOptions;

export interface OrthographicWebGLCreateOptions extends Omit<WebGLCreateOptions, "camera"> {
  camera?: OrthographicCameraOptions;
}
export interface OrthographicWebGPUCreateOptions extends Omit<WebGPUCreateOptions, "camera"> {
  camera?: OrthographicCameraOptions;
}
export type OrthographicThreeAppCreateOptions =
  | OrthographicWebGLCreateOptions
  | OrthographicWebGPUCreateOptions;
