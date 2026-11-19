import type { WebGPUCanvasRenderer } from "./core/scene-host.ts";
import { retireAfterRender } from "./core/render-retirement.ts";
import { normalizePostprocessing } from "./postprocessing/options.ts";
import { getWebGPUFeatures, isNodeRenderer } from "./core/webgpu-features.ts";
import type BloomNode from "three/addons/tsl/display/BloomNode.js";
import type OutlineNode from "three/addons/tsl/display/OutlineNode.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { BrightnessContrastShader } from "three/addons/shaders/BrightnessContrastShader.js";
import { HueSaturationShader } from "three/addons/shaders/HueSaturationShader.js";
import { Color, HalfFloatType, Vector2, WebGLRenderTarget } from "three";
import type { Object3D } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import type { Pass } from "three/addons/postprocessing/Pass.js";
import type { AnyThreeApp, SceneApp, ViewportSize } from "./core/three-app.ts";
import { ResourceScope } from "./core/resources.ts";

export interface BloomOptions {
  /** Nonnegative finite intensity. Default 1. */
  strength?: number;
  /** Blur radius in [0, 1]. Default 0.4. */
  radius?: number;
  /** Nonnegative finite luminance threshold. Default 0.85; HDR values above 1 are allowed. */
  threshold?: number;
  /** Default true. Disabled effects retain their allocated resources. */
  enabled?: boolean;
}

export interface BloomHandle {
  /** Native parameters may be adjusted directly; do not dispose the owned pass yourself. */
  readonly pass: UnrealBloomPass;
  configure(this: void, options: BloomOptions): void;
  readonly disposed: boolean;
  dispose(this: void): void;
}

export interface OutlineOptions {
  selectedObjects?: readonly Object3D[];
  /** Nonnegative finite value. Default 3. */
  edgeStrength?: number;
  /** Native blur kernel range [1, 4]. Default 1. */
  edgeThickness?: number;
  /** Nonnegative finite value. Default 0. */
  edgeGlow?: number;
  /** Optional integer RGB hex values; otherwise use native defaults. */
  visibleEdgeColor?: number;
  hiddenEdgeColor?: number;
  enabled?: boolean;
}

export interface ColorAdjustmentOptions {
  brightness?: number;
  /** [-1,1). Native shader divides by 1-contrast at positive values. */
  contrast?: number;
  hue?: number;
  /** [-1,1). Native shader divides by 1-saturation at positive values. */
  saturation?: number;
  enabled?: boolean;
}
export interface ColorAdjustmentPasses {
  readonly brightnessContrast: ShaderPass;
  readonly hueSaturation: ShaderPass;
}
export interface PostprocessingOptions {
  colorAdjustment?: ColorAdjustmentOptions;
  bloom?: BloomOptions;
  outline?: OutlineOptions;
}

export interface NodePostprocessingHandle {
  readonly bloom: BloomNode | undefined;
  readonly outline: OutlineNode | undefined;
  readonly disposed: boolean;
  configure(this: void, options: PostprocessingOptions): void;
  dispose(this: void): void;
}
export interface NodeBloomHandle {
  readonly pass: BloomNode;
  readonly disposed: boolean;
  configure(this: void, options: BloomOptions): void;
  dispose(this: void): void;
}
export interface PostprocessingHandle {
  configure(this: void, options: PostprocessingOptions): void;
  readonly colorAdjustment: ColorAdjustmentPasses | undefined;
  readonly bloom: UnrealBloomPass | undefined;
  readonly outline: OutlinePass | undefined;
  readonly disposed: boolean;
  dispose(this: void): void;
}

/** Owned RenderPass → UnrealBloomPass → OutputPass pipeline; no extra scheduler or renderer replacement. */
export function attachBloom(app: AnyThreeApp, options?: BloomOptions): BloomHandle;
export function attachBloom(
  app: SceneApp & { readonly renderer: WebGPUCanvasRenderer },
  options?: BloomOptions,
): NodeBloomHandle;
export function attachBloom(app: SceneApp, options?: BloomOptions): BloomHandle | NodeBloomHandle;
export function attachBloom(
  app: SceneApp,
  options: BloomOptions = {},
): BloomHandle | NodeBloomHandle {
  const effects = attachPostprocessing(app, { bloom: options });
  return {
    pass: effects.bloom!,
    configure: (value: BloomOptions) => effects.configure({ bloom: value }),
    get disposed() {
      return effects.disposed;
    },
    dispose: effects.dispose,
  } as BloomHandle | NodeBloomHandle;
}

/** One owned linear-space effect chain. At least one effect must be requested. */
export function attachPostprocessing(
  app: AnyThreeApp,
  options: PostprocessingOptions,
): PostprocessingHandle;
export function attachPostprocessing(
  app: SceneApp & { readonly renderer: WebGPUCanvasRenderer },
  options: PostprocessingOptions,
): NodePostprocessingHandle;
export function attachPostprocessing(
  app: SceneApp,
  options: PostprocessingOptions,
): PostprocessingHandle | NodePostprocessingHandle;
export function attachPostprocessing(
  app: SceneApp,
  options: PostprocessingOptions,
): PostprocessingHandle | NodePostprocessingHandle {
  if (app.state === "disposed" || app.resources.disposed)
    throw new Error("ThreeApp has been disposed");
  const config = normalizePostprocessing(options);
  const { requestedBloom, outlineConfig, grade, strength, radius, threshold, enabled } = config;
  if (isNodeRenderer(app.renderer)) return getWebGPUFeatures().postprocessing(app, config);
  const glApp = app as AnyThreeApp;
  const owned = new ResourceScope();
  let disposed = false;
  let executing = false;
  let detach = (): void => {};
  const renderer = glApp.renderer;
  let renderPass: RenderPass | undefined;
  let bloom: UnrealBloomPass | undefined;
  let outline: OutlinePass | undefined;
  let output: OutputPass | undefined;
  let colorAdjustment: ColorAdjustmentPasses | undefined;
  let handle: PostprocessingHandle | undefined;
  const passes: Pass[] = [];
  const release = (): void => {
    owned.dispose();
  };
  const settle = (errors: unknown[]): void => {
    executing = false;
    if (disposed) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length)
      throw new AggregateError(errors, "Postprocessing operation and cleanup failed");
  };
  try {
    // Avoid zero-sized targets when attached before the container acquires a size.
    const target = owned.track(new WebGLRenderTarget(1, 1, { type: HalfFloatType }));
    const composer = owned.track(new EffectComposer(renderer, target));
    owned.untrack(target); // The composer now owns the input target and its clone.
    renderPass = owned.track(new RenderPass(app.scene, app.camera));
    passes.push(renderPass);
    if (outlineConfig) {
      outline = owned.track(
        new OutlinePass(new Vector2(1, 1), app.scene, app.camera, outlineConfig.selectedObjects),
      );
      outline.edgeStrength = outlineConfig.edgeStrength;
      outline.edgeThickness = outlineConfig.edgeThickness;
      outline.edgeGlow = outlineConfig.edgeGlow;
      outline.enabled = outlineConfig.enabled;
      if (outlineConfig.visibleEdgeColor !== undefined)
        outline.visibleEdgeColor.setHex(outlineConfig.visibleEdgeColor);
      if (outlineConfig.hiddenEdgeColor !== undefined)
        outline.hiddenEdgeColor.setHex(outlineConfig.hiddenEdgeColor);
      passes.push(outline);
    }
    if (requestedBloom) {
      bloom = owned.track(new UnrealBloomPass(new Vector2(1, 1), strength, radius, threshold));
      bloom.enabled = enabled;
      passes.push(bloom);
    }
    if (grade) {
      const brightnessContrast = owned.track(new ShaderPass(BrightnessContrastShader));
      const hueSaturation = owned.track(new ShaderPass(HueSaturationShader));
      brightnessContrast.uniforms.brightness!.value = grade.brightness;
      brightnessContrast.uniforms.contrast!.value = grade.contrast;
      hueSaturation.uniforms.hue!.value = grade.hue;
      hueSaturation.uniforms.saturation!.value = grade.saturation;
      brightnessContrast.enabled = hueSaturation.enabled = grade.enabled;
      passes.push(brightnessContrast, hueSaturation);
      colorAdjustment = { brightnessContrast, hueSaturation };
    }
    output = owned.track(new OutputPass());
    passes.push(output);
    for (const pass of passes) composer.addPass(pass);
    handle = {
      configure(value) {
        if (disposed || app.state === "disposed")
          throw new Error("Postprocessing has been disposed");
        const config = normalizePostprocessing(value);
        if (
          (config.requestedBloom && !bloom) ||
          (config.outlineConfig && !outline) ||
          (config.grade && !colorAdjustment)
        )
          throw new Error("Configure only effects requested at attachment");
        retireAfterRender(renderer, () => {
          if (disposed) return;
          if (config.requestedBloom && bloom) {
            bloom.strength = config.strength;
            bloom.radius = config.radius;
            bloom.threshold = config.threshold;
            bloom.enabled = config.enabled;
          }
          if (config.outlineConfig && outline) {
            const c = config.outlineConfig;
            outline.selectedObjects = [...c.selectedObjects];
            outline.edgeStrength = c.edgeStrength;
            outline.edgeThickness = c.edgeThickness;
            outline.edgeGlow = c.edgeGlow;
            outline.enabled = c.enabled;
            if (c.visibleEdgeColor !== undefined)
              outline.visibleEdgeColor.setHex(c.visibleEdgeColor);
            if (c.hiddenEdgeColor !== undefined) outline.hiddenEdgeColor.setHex(c.hiddenEdgeColor);
          }
          if (config.grade && colorAdjustment) {
            const c = config.grade;
            colorAdjustment.brightnessContrast.uniforms.brightness!.value = c.brightness;
            colorAdjustment.brightnessContrast.uniforms.contrast!.value = c.contrast;
            colorAdjustment.hueSaturation.uniforms.hue!.value = c.hue;
            colorAdjustment.hueSaturation.uniforms.saturation!.value = c.saturation;
            colorAdjustment.brightnessContrast.enabled = colorAdjustment.hueSaturation.enabled =
              c.enabled;
          }
        });
      },
      colorAdjustment,
      bloom,
      outline,
      get disposed() {
        return disposed;
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        // During a native scene callback, suppress the remaining passes and defer GPU disposal.
        for (const pass of passes) pass.enabled = false;
        if (outline) outline.selectedObjects = [];
        detach();
        app.resources.untrack(handle!);
        if (!executing) release();
      },
    };
    let previous: ViewportSize | undefined;
    let ratio = renderer.getPixelRatio();
    const color = new Color();
    detach = app.setRenderPipeline({
      resize(size): void {
        if (disposed) return;
        if (
          previous &&
          size.width === previous.width &&
          size.height === previous.height &&
          size.pixelRatio === previous.pixelRatio
        )
          return;
        if (!size.width || !size.height) {
          previous = { ...size };
          return;
        }
        if (executing) throw new Error("Postprocessing operations cannot reenter");
        executing = true;
        const errors: unknown[] = [];
        try {
          if (ratio !== size.pixelRatio) {
            composer.setPixelRatio(size.pixelRatio);
            ratio = size.pixelRatio;
          }
          composer.setSize(size.width, size.height);
          previous = { ...size };
        } catch (error) {
          errors.push(error);
        } finally {
          settle(errors);
        }
      },
      render({ delta }): void {
        if (disposed) return;
        if (executing) throw new Error("Postprocessing operations cannot reenter");
        const target = renderer.getRenderTarget();
        const autoClear = renderer.autoClear;
        const toneMapping = renderer.toneMapping;
        const alpha = renderer.getClearAlpha();
        renderer.getClearColor(color);
        const visibility = new Map<Object3D, boolean>();
        const background = app.scene.background;
        const overrideMaterial = app.scene.overrideMaterial;
        if (outline?.enabled && outline.selectedObjects.length) {
          const save = (object: Object3D): void => {
            visibility.set(object, object.visible);
          };
          app.scene.traverse(save);
          for (const object of outline.selectedObjects) object.traverse(save);
        }
        executing = true;
        const errors: unknown[] = [];
        try {
          composer.render(delta);
        } catch (error) {
          errors.push(error);
          // Native OutlinePass temporarily hides objects and overrides scene state during its draws.
          for (const [object, visible] of visibility) object.visible = visible;
          app.scene.background = background;
          app.scene.overrideMaterial = overrideMaterial;
        } finally {
          const attempt = (callback: () => void): void => {
            try {
              callback();
            } catch (error) {
              errors.push(error);
            }
          };
          if (app.state !== "disposed") {
            attempt(() => {
              renderer.autoClear = autoClear;
              renderer.toneMapping = toneMapping;
            });
            attempt(() => renderer.setClearColor(color, alpha));
            attempt(() => renderer.setRenderTarget(target));
          }
          settle(errors);
        }
      },
    });
    app.resources.track(handle);
    return handle;
  } catch (error) {
    disposed = true;
    detach();
    try {
      release();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Postprocessing initialization and rollback failed",
      );
    }
    throw error;
  }
}
