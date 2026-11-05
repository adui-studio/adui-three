import { Color, HalfFloatType, Vector2, WebGLRenderTarget } from "three";
import type { Object3D } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import type { Pass } from "three/addons/postprocessing/Pass.js";
import type { ThreeApp, ViewportSize } from "./three-app.ts";
import { ResourceScope } from "./resources.ts";

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

export interface PostprocessingOptions {
  bloom?: BloomOptions;
  outline?: OutlineOptions;
}

export interface PostprocessingHandle {
  readonly bloom: UnrealBloomPass | undefined;
  readonly outline: OutlinePass | undefined;
  readonly disposed: boolean;
  dispose(this: void): void;
}

type OutlineConfiguration = Required<
  Omit<OutlineOptions, "selectedObjects" | "visibleEdgeColor" | "hiddenEdgeColor">
> & {
  selectedObjects: Object3D[];
  visibleEdgeColor: number | undefined;
  hiddenEdgeColor: number | undefined;
};

function outlineOptions(options: OutlineOptions): OutlineConfiguration {
  const {
    selectedObjects = [],
    edgeStrength = 3,
    edgeThickness = 1,
    edgeGlow = 0,
    enabled = true,
    visibleEdgeColor,
    hiddenEdgeColor,
  } = options;
  if (!Array.isArray(selectedObjects) || selectedObjects.some((object) => !object?.isObject3D))
    throw new TypeError("Outline selection requires Object3D objects");
  if (
    ![edgeStrength, edgeThickness, edgeGlow].every(Number.isFinite) ||
    edgeStrength < 0 ||
    edgeThickness < 1 ||
    edgeThickness > 4 ||
    edgeGlow < 0 ||
    typeof enabled !== "boolean"
  )
    throw new RangeError("Invalid outline options");
  for (const color of [visibleEdgeColor, hiddenEdgeColor])
    if (color !== undefined && (!Number.isInteger(color) || color < 0 || color > 0xffffff))
      throw new RangeError("Outline colors must be RGB hex integers");
  return {
    selectedObjects: [...selectedObjects],
    edgeStrength,
    edgeThickness,
    edgeGlow,
    enabled,
    visibleEdgeColor,
    hiddenEdgeColor,
  };
}

/** Owned RenderPass → UnrealBloomPass → OutputPass pipeline; no extra scheduler or renderer replacement. */
export function attachBloom(app: ThreeApp, options: BloomOptions = {}): BloomHandle {
  const effects = attachPostprocessing(app, { bloom: options });
  return {
    pass: effects.bloom!,
    get disposed() {
      return effects.disposed;
    },
    dispose: effects.dispose,
  };
}

/** One owned linear-space effect chain. At least one effect must be requested. */
export function attachPostprocessing(
  app: ThreeApp,
  options: PostprocessingOptions,
): PostprocessingHandle {
  if (app.state === "disposed" || app.resources.disposed)
    throw new Error("ThreeApp has been disposed");
  if (!options || (!options.bloom && !options.outline))
    throw new RangeError("At least one effect is required");
  for (const value of [options.bloom, options.outline])
    if (value !== undefined && (typeof value !== "object" || value === null))
      throw new TypeError("Effect options must be objects");
  const { strength = 1, radius = 0.4, threshold = 0.85, enabled = true } = options.bloom ?? {};
  if (
    !Number.isFinite(strength) ||
    strength < 0 ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    !Number.isFinite(radius) ||
    radius < 0 ||
    radius > 1 ||
    typeof enabled !== "boolean"
  )
    throw new RangeError("Invalid bloom options");
  const outlineConfig = options.outline ? outlineOptions(options.outline) : undefined;
  const owned = new ResourceScope();
  let disposed = false;
  let executing = false;
  let detach = (): void => {};
  const renderer = app.renderer;
  let renderPass: RenderPass | undefined;
  let bloom: UnrealBloomPass | undefined;
  let outline: OutlinePass | undefined;
  let output: OutputPass | undefined;
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
    if (options.bloom) {
      bloom = owned.track(new UnrealBloomPass(new Vector2(1, 1), strength, radius, threshold));
      bloom.enabled = enabled;
      passes.push(bloom);
    }
    output = owned.track(new OutputPass());
    passes.push(output);
    for (const pass of passes) composer.addPass(pass);
    handle = {
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
