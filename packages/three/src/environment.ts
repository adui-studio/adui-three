import { EquirectangularReflectionMapping, FileLoader, LoadingManager } from "three";
import type { DataTexture } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import type { AnyThreeApp } from "./three-app.ts";
import { ResourceScope } from "./resources.ts";

export interface EnvironmentProgress {
  readonly loaded: number;
  readonly total: number | null;
  readonly ratio: number | null;
}

export interface LoadHDROptions {
  signal?: AbortSignal;
  onProgress?: (progress: EnvironmentProgress) => void;
  /** Reports cleanup errors after cancellation has already settled the promise. */
  onCleanupError?: (error: unknown) => void;
}

export interface HDREnvironment {
  /** Owned native texture. Do not call texture.dispose() separately. */
  readonly texture: DataTexture;
  /** Bindings and consumer hooks are released before the texture. */
  readonly resources: ResourceScope;
  readonly disposed: boolean;
  dispose(this: void): void;
}

export interface EnvironmentOptions {
  /** Also use the equirectangular texture as the scene background. Default false. */
  background?: boolean;
  /** Finite nonnegative lighting intensity. Default 1. */
  intensity?: number;
}

export interface EnvironmentBinding {
  readonly disposed: boolean;
  dispose(this: void): void;
}

const owners = new WeakMap<HDREnvironment, AnyThreeApp>();
const bindings = new WeakMap<AnyThreeApp, EnvironmentBinding>();

function aborted(): DOMException {
  return new DOMException("HDR loading was cancelled", "AbortError");
}

function asset(app: AnyThreeApp, texture: DataTexture): HDREnvironment {
  const resources = new ResourceScope();
  let disposed = false;
  const environment: HDREnvironment = {
    texture,
    resources,
    get disposed() {
      return disposed;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      app.resources.untrack(environment);
      const errors: unknown[] = [];
      try {
        resources.dispose();
      } catch (error) {
        errors.push(error);
      }
      try {
        texture.dispose();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) throw new AggregateError(errors, "HDR environment cleanup failed");
    },
  };
  owners.set(environment, app);
  return environment;
}

/** Load without mutating the scene. Cancellation is logical and skips late HDR parsing. */
export function loadHDR(
  app: AnyThreeApp,
  url: string,
  options: LoadHDROptions = {},
): Promise<HDREnvironment> {
  if (typeof url !== "string" || !url.trim())
    return Promise.reject(new TypeError("A non-empty HDR URL is required"));
  const { signal, onProgress, onCleanupError } = options;
  if (app.signal.aborted || app.resources.disposed || signal?.aborted)
    return Promise.reject(aborted());
  return new Promise<HDREnvironment>((resolve, reject) => {
    let settled = false;
    const pending = { dispose: (): void => fail(aborted()) };
    const finish = (): void => {
      settled = true;
      app.signal.removeEventListener("abort", cancel);
      signal?.removeEventListener("abort", cancel);
      app.resources.untrack(pending);
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      finish();
      reject(error);
    };
    const cancel = (): void => fail(aborted());
    const report = (error: unknown): void => {
      try {
        if (onCleanupError) onCleanupError(error);
        else console.error("HDR late cleanup failed", error);
      } catch (reporterError) {
        console.error("HDR cleanup reporter failed", new AggregateError([error, reporterError]));
      }
    };
    app.resources.track(pending);
    app.signal.addEventListener("abort", cancel, { once: true });
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      // FileLoader coalesces equal URLs. Never abort its shared transport or mutate its buffer.
      new FileLoader(new LoadingManager()).setResponseType("arraybuffer").load(
        url,
        (buffer): void => {
          if (settled) return;
          let texture: DataTexture | undefined;
          try {
            if (!(buffer instanceof ArrayBuffer)) throw new TypeError("HDR requires binary data");
            texture = new HDRLoader().createDataTexture(buffer);
            texture.mapping = EquirectangularReflectionMapping;
            if (settled || app.signal.aborted || signal?.aborted || app.resources.disposed) {
              const late = texture;
              texture = undefined;
              late.dispose();
              fail(aborted());
              return;
            }
            const environment = asset(app, texture);
            app.resources.track(environment);
            texture = undefined;
            finish();
            resolve(environment);
          } catch (error) {
            let failure = error;
            if (texture) {
              try {
                texture.dispose();
              } catch (cleanupError) {
                failure = new AggregateError([error, cleanupError], "HDR load rollback failed");
              }
            }
            if (settled) report(failure);
            else fail(failure);
          }
        },
        (event): void => {
          if (settled || !onProgress) return;
          try {
            const total = event.lengthComputable && event.total > 0 ? event.total : null;
            onProgress({ loaded: event.loaded, total, ratio: total ? event.loaded / total : null });
          } catch (error) {
            fail(error);
          }
        },
        fail,
      );
    } catch (error) {
      fail(error);
    }
  });
}

/** Borrow an owned HDR asset for this app. One explicit binding at a time; no draw or scheduler. */
export function attachEnvironment(
  app: AnyThreeApp,
  environment: HDREnvironment,
  options: EnvironmentOptions = {},
): EnvironmentBinding {
  if (app.signal.aborted || app.resources.disposed) throw new Error("ThreeApp has been disposed");
  if (owners.get(environment) !== app || environment.disposed || environment.resources.disposed)
    throw new Error("An active HDR environment owned by this app is required");
  if (bindings.has(app)) throw new Error("An environment binding is already attached");
  const { background = false, intensity = 1 } = options;
  if (typeof background !== "boolean" || !Number.isFinite(intensity) || intensity < 0)
    throw new RangeError("Invalid environment options");
  const scene = app.scene;
  const previous = {
    environment: scene.environment,
    background: scene.background,
    intensity: scene.environmentIntensity,
  };
  let disposed = false;
  const binding: EnvironmentBinding = {
    get disposed() {
      return disposed;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (bindings.get(app) === binding) bindings.delete(app);
      app.resources.untrack(binding);
      environment.resources.untrack(binding);
      if (scene.environment === environment.texture) {
        scene.environment = previous.environment;
        if (scene.environmentIntensity === intensity)
          scene.environmentIntensity = previous.intensity;
      }
      if (background && scene.background === environment.texture)
        scene.background = previous.background;
    },
  };
  scene.environment = environment.texture;
  scene.environmentIntensity = intensity;
  if (background) scene.background = environment.texture;
  bindings.set(app, binding);
  app.resources.track(binding);
  environment.resources.track(binding);
  return binding;
}
