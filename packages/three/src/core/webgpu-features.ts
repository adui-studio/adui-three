import type { Color, Scene, Material } from "three";
import type { CubeRenderTarget } from "three/webgpu";
import type { SceneApp, WebGPUCanvasRenderer } from "./scene-host.ts";
import type { NodePostprocessingHandle } from "../postprocessing.ts";
import type { normalizePostprocessing } from "../postprocessing/options.ts";

export type EffectKind =
  | "fly"
  | "wall"
  | "radar"
  | "ripple"
  | "pillar"
  | "shield"
  | "points"
  | "flow";
export type EffectUniforms = Record<string, { value: number | Color }>;
export interface WebGPUFeatures {
  effectMaterial(kind: EffectKind, uniforms: EffectUniforms): Material;
  postprocessing(
    app: SceneApp,
    options: ReturnType<typeof normalizePostprocessing>,
  ): NodePostprocessingHandle;
  room(app: SceneApp, scene: Scene, sigma: number, size: number): CubeRenderTarget;
}
let features: WebGPUFeatures | undefined;
/** Installed by the private lazy renderer chunk, before a GPU host is delivered. */
export function installWebGPUFeatures(value: WebGPUFeatures): void {
  features = value;
}
export function getWebGPUFeatures(): WebGPUFeatures {
  if (!features) throw new Error("WebGPU extensions require an initialized ThreeApp");
  return features;
}
export function isNodeRenderer(renderer: object): renderer is WebGPUCanvasRenderer {
  return "isWebGPURenderer" in renderer && renderer.isWebGPURenderer === true;
}
