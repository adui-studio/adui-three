import { Color, PMREMGenerator } from "three";
import type { Texture, WebGLCubeRenderTarget } from "three";
import { RoomEnvironment as NativeRoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  isRendererDrawing,
  renderWithRetirement,
  retireAfterRender,
} from "./core/render-retirement.ts";
import {
  EquirectangularReflectionMapping,
  FileLoader,
  HalfFloatType,
  LoadingManager,
  RGBAFormat,
} from "three";
import type { DataTexture } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import type { AnyThreeApp } from "./core/three-app.ts";
import { ResourceScope } from "./core/resources.ts";

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

export interface EnvironmentAsset<T extends Texture = Texture> {
  /** Owned native texture. Do not call texture.dispose() separately. */
  readonly texture: T;
  /** Bindings and consumer hooks are released before the texture. */
  readonly resources: ResourceScope;
  readonly disposed: boolean;
  dispose(this: void): void;
}

export type HDREnvironment = EnvironmentAsset<DataTexture>;
export type RoomEnvironmentAsset = EnvironmentAsset<Texture>;
export interface RoomEnvironmentOptions {
  sigma?: number;
  size?: number;
}
export interface EnvironmentOptions {
  /** Also use the owned texture as the scene background. Default false. */
  background?: boolean;
  /** Finite nonnegative lighting intensity. Default 1. */
  intensity?: number;
}

export interface EnvironmentBinding {
  readonly disposed: boolean;
  dispose(this: void): void;
}

const owners = new WeakMap<EnvironmentAsset, AnyThreeApp>();
const bindings = new WeakMap<AnyThreeApp, EnvironmentBinding>();

function aborted(): DOMException {
  return new DOMException("HDR loading was cancelled", "AbortError");
}

function asset<T extends Texture>(
  app: AnyThreeApp,
  texture: T,
  release: () => void = () => texture.dispose(),
): EnvironmentAsset<T> {
  const resources = new ResourceScope();
  let disposed = false;
  const environment: EnvironmentAsset<T> = {
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
        release();
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
  return loadEnvironment(app, url, options, (buffer) => new HDRLoader().createDataTexture(buffer));
}

/** Load the native first EXR part as a linear half-float equirectangular environment. */
export function loadEXR(
  app: AnyThreeApp,
  url: string,
  options: LoadHDROptions = {},
): Promise<HDREnvironment> {
  return loadEnvironment(
    app,
    url,
    options,
    // FileLoader bytes can be shared by unrelated tasks; native decompression owns its input.
    (buffer) =>
      new EXRLoader()
        .setDataType(HalfFloatType)
        .setOutputFormat(RGBAFormat)
        .setPart(0)
        .createDataTexture(buffer.slice(0)),
  );
}

function loadEnvironment(
  app: AnyThreeApp,
  url: string,
  options: LoadHDROptions,
  decode: (buffer: ArrayBuffer) => DataTexture,
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
            texture = decode(buffer);
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

/** Borrow an owned environment asset for this app. One explicit binding at a time; no draw or scheduler. */
export function attachEnvironment(
  app: AnyThreeApp,
  environment: EnvironmentAsset,
  options: EnvironmentOptions = {},
): EnvironmentBinding {
  const assertAvailable = (): void => {
    if (app.signal.aborted || app.resources.disposed) throw new Error("ThreeApp has been disposed");
    if (owners.get(environment) !== app || environment.disposed || environment.resources.disposed)
      throw new Error("An active environment owned by this app is required");
    if (bindings.has(app)) throw new Error("An environment binding is already attached");
  };
  assertAvailable();
  const { background = false, intensity = 1 } = options;
  if (typeof background !== "boolean" || !Number.isFinite(intensity) || intensity < 0)
    throw new RangeError("Invalid environment options");
  // Option getters can synchronously end an owner or attach another exclusive binding.
  assertAvailable();
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

/** Generate Editor's Room IBL using native PMREM. Explicit GPU work; never binds or starts the host. */
export function createRoomEnvironment(
  app: AnyThreeApp,
  options: RoomEnvironmentOptions = {},
): RoomEnvironmentAsset {
  const renderer = app.renderer;
  const active = (): void => {
    if (app.state === "disposed" || app.resources.disposed || app.signal.aborted)
      throw new Error("Room environment owner has been disposed");
  };
  active();
  if (isRendererDrawing(renderer)) throw new Error("Create Room environment outside a draw");
  const { sigma = 0.04, size = 256 } = options;
  if (!Number.isFinite(sigma) || sigma < 0 || sigma > 1 || ![256, 512, 1024].includes(size))
    throw new RangeError("Invalid Room blur or cube size");
  active();
  const state = {
    target: renderer.getRenderTarget(),
    face: renderer.getActiveCubeFace(),
    mip: renderer.getActiveMipmapLevel(),
    autoClear: renderer.autoClear,
    color: renderer.autoClearColor,
    depth: renderer.autoClearDepth,
    stencil: renderer.autoClearStencil,
    xr: renderer.xr.enabled,
    tone: renderer.toneMapping,
    exposure: renderer.toneMappingExposure,
    clear: renderer.getClearColor(new Color()),
    alpha: renderer.getClearAlpha(),
  };
  const temporary = new ResourceScope();
  let output: WebGLCubeRenderTarget | undefined;
  const errors: unknown[] = [];
  try {
    const room = temporary.track(new NativeRoomEnvironment()),
      generator = temporary.track(new PMREMGenerator(renderer));
    renderWithRetirement(renderer, () => {
      let value: WebGLCubeRenderTarget | undefined;
      const failures: unknown[] = [];
      try {
        value = generator.fromScene(room, sigma, 0.1, 100, { size });
      } catch (error) {
        failures.push(error);
      } finally {
        if (app.state !== "disposed") {
          for (const restore of [
            () => {
              renderer.autoClear = state.autoClear;
              renderer.autoClearColor = state.color;
              renderer.autoClearDepth = state.depth;
              renderer.autoClearStencil = state.stencil;
              renderer.xr.enabled = state.xr;
              renderer.toneMapping = state.tone;
              renderer.toneMappingExposure = state.exposure;
            },
            () => renderer.setClearColor(state.clear, state.alpha),
            () => renderer.setRenderTarget(state.target, state.face, state.mip),
          ]) {
            try {
              restore();
            } catch (error) {
              failures.push(error);
            }
          }
        }
      }
      if (failures.length) {
        if (value) {
          try {
            value.dispose();
          } catch (error) {
            failures.push(error);
          }
        }
        throw new AggregateError(failures, "Room generation or renderer restoration failed");
      }
      output = value!;
    });
  } catch (error) {
    errors.push(error);
  } finally {
    try {
      temporary.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    active();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) {
    try {
      output?.dispose();
    } catch (error) {
      errors.push(error);
    }
    throw new AggregateError(errors, "Room environment preparation failed");
  }
  const target = output!;
  const environment = asset(app, target.texture, () =>
    retireAfterRender(renderer, () => target.dispose()),
  );
  try {
    app.resources.track(environment);
    return environment;
  } catch (error) {
    try {
      environment.dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Room environment ownership failed");
    }
    throw error;
  }
}
