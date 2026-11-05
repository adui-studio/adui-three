import { Color, HalfFloatType, Vector2, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
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

/** Owned RenderPass → UnrealBloomPass → OutputPass pipeline; no extra scheduler or renderer replacement. */
export function attachBloom(app: ThreeApp, options: BloomOptions = {}): BloomHandle {
  if (app.state === "disposed" || app.resources.disposed)
    throw new Error("ThreeApp has been disposed");
  const { strength = 1, radius = 0.4, threshold = 0.85, enabled = true } = options;
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
  const owned = new ResourceScope();
  let disposed = false;
  let rendering = false;
  let detach = (): void => {};
  const renderer = app.renderer;
  let renderPass: RenderPass | undefined;
  let bloom: UnrealBloomPass | undefined;
  let output: OutputPass | undefined;
  let handle: BloomHandle | undefined;
  const release = (): void => {
    owned.dispose();
  };
  try {
    // Avoid zero-sized targets when attached before the container acquires a size.
    const target = owned.track(new WebGLRenderTarget(1, 1, { type: HalfFloatType }));
    const composer = owned.track(new EffectComposer(renderer, target));
    owned.untrack(target); // The composer now owns the input target and its clone.
    renderPass = owned.track(new RenderPass(app.scene, app.camera));
    bloom = owned.track(new UnrealBloomPass(new Vector2(1, 1), strength, radius, threshold));
    output = owned.track(new OutputPass());
    bloom.enabled = enabled;
    composer.addPass(renderPass);
    composer.addPass(bloom);
    composer.addPass(output);
    handle = {
      pass: bloom,
      get disposed() {
        return disposed;
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        // During a native scene callback, suppress the remaining passes and defer GPU disposal.
        for (const pass of [renderPass!, bloom!, output!]) pass.enabled = false;
        detach();
        app.resources.untrack(handle!);
        if (!rendering) release();
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
        previous = { ...size };
        if (!size.width || !size.height) return;
        if (ratio !== size.pixelRatio) {
          composer.setPixelRatio(size.pixelRatio);
          ratio = size.pixelRatio;
        }
        composer.setSize(size.width, size.height);
      },
      render({ delta }): void {
        if (disposed) return;
        const target = renderer.getRenderTarget();
        const autoClear = renderer.autoClear;
        const toneMapping = renderer.toneMapping;
        const alpha = renderer.getClearAlpha();
        renderer.getClearColor(color);
        rendering = true;
        const errors: unknown[] = [];
        try {
          composer.render(delta);
        } catch (error) {
          errors.push(error);
        } finally {
          rendering = false;
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
          if (disposed) attempt(release);
        }
        if (errors.length === 1) throw errors[0];
        if (errors.length) throw new AggregateError(errors, "Bloom render and cleanup failed");
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
      throw new AggregateError([error, cleanupError], "Bloom initialization and rollback failed");
    }
    throw error;
  }
}
