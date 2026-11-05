import { Cache, LoadingManager } from "three";
import type { Group } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import type { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { ThreeApp } from "./three-app.ts";
import { collectGLTFResources } from "./gltf-resources.ts";
import { ResourceScope } from "./resources.ts";
import { TaskKTX2Loader } from "./ktx2-task.ts";
import type { TranscoderPath } from "./ktx2-task.ts";

export interface ModelProgress {
  /** Bytes of the primary GLTF/GLB request, not total dependency/decode progress. */
  readonly loaded: number;
  readonly total: number | null;
  readonly ratio: number | null;
}

export interface DracoOptions {
  /** Explicit folder (ending in /), or r187 JS wrapper/WASM URLs. No implicit CDN. */
  decoderPath: string | { readonly js: string; readonly wasm: string };
  /** Positive integer; default 1 per load task. */
  workerLimit?: number;
}

export interface LoadGLTFOptions {
  signal?: AbortSignal;
  /** Defaults to true; false keeps the model detached but owned by the app. */
  addToScene?: boolean;
  onProgress?: (progress: ModelProgress) => void;
  /** Defaults to true for uncached loads. Set false for externally shared image data. */
  closeImageBitmaps?: boolean;
  /** Reports late-model or task-owned decoder cleanup errors after the promise is settled. */
  onCleanupError?: (error: unknown) => void;
  /** Task-owned Draco decoder, released after native loading settles, including late results. */
  draco?: DracoOptions;
  /** Borrowed decoder module; the application owns any configured Meshopt workers. */
  meshoptDecoder?: typeof MeshoptDecoder;
  /** Task-owned KTX2 transcoder, configured for this app's renderer. */
  ktx2?: KTX2Options;
}

export interface KTX2Options {
  /** Explicit folder ending in /, or JS wrapper/WASM URLs. No implicit CDN. */
  transcoderPath: TranscoderPath;
  /** Integer from 1 to 32 (r187 WorkerPool bitmask limit). Default 1 per task. */
  workerLimit?: number;
}

export interface GLTFModel {
  readonly scene: Group;
  readonly gltf: GLTF;
  readonly disposed: boolean;
  /** Model-scoped dispose hooks run before scene nodes and GPU assets. */
  readonly resources: ResourceScope;
  dispose(): void;
}

function aborted(): DOMException {
  return new DOMException("Model loading was cancelled", "AbortError");
}

function modelHandle(app: ThreeApp, gltf: GLTF, closeImages: boolean): GLTFModel {
  const resources = collectGLTFResources(gltf, closeImages);
  const extensions = new ResourceScope();
  const roots = new Set([gltf.scene, ...gltf.scenes]);
  let disposed = false;
  const model: GLTFModel = {
    scene: gltf.scene,
    gltf,
    resources: extensions,
    get disposed(): boolean {
      return disposed;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      app.resources.untrack(model);
      const errors: unknown[] = [];
      try {
        extensions.dispose();
      } catch (error) {
        errors.push(error);
      }
      for (const root of roots) {
        try {
          root.removeFromParent();
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        resources.dispose();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) throw new AggregateError(errors, "GLTF model cleanup failed");
    },
  };
  return model;
}

/** Logical cancellation is immediate; transport/decode may finish later and is cleaned up. */
export function loadGLTF(
  app: ThreeApp,
  url: string,
  options: LoadGLTFOptions = {},
): Promise<GLTFModel> {
  const {
    signal,
    onProgress,
    onCleanupError,
    addToScene = true,
    closeImageBitmaps = true,
    draco,
    meshoptDecoder,
    ktx2,
  } = options;
  if (typeof url !== "string" || !url.trim())
    return Promise.reject(new TypeError("A non-empty GLTF/GLB URL is required"));
  if (app.signal.aborted || app.resources.disposed || signal?.aborted)
    return Promise.reject(aborted());
  const path = draco?.decoderPath;
  const workerLimit = draco?.workerLimit ?? 1;
  const nonempty = (value: unknown): value is string => typeof value === "string" && !!value.trim();
  if (
    draco &&
    (!Number.isInteger(workerLimit) ||
      workerLimit <= 0 ||
      !(typeof path === "string"
        ? nonempty(path) && path.endsWith("/")
        : path && nonempty(path.js) && nonempty(path.wasm)))
  )
    return Promise.reject(
      new TypeError(
        "Draco requires an explicit decoder folder/URLs and a positive integer workerLimit",
      ),
    );
  // Snapshot URL fields before asynchronous work; callers may reuse their options object.
  const decoderPath =
    typeof path === "string" ? path : path ? { js: path.js, wasm: path.wasm } : undefined;
  const transcodePath = ktx2?.transcoderPath;
  const transcodeLimit = ktx2?.workerLimit ?? 1;
  if (
    ktx2 &&
    (!Number.isInteger(transcodeLimit) ||
      transcodeLimit < 1 ||
      transcodeLimit > 32 ||
      !(typeof transcodePath === "string"
        ? nonempty(transcodePath) && transcodePath.endsWith("/")
        : transcodePath && nonempty(transcodePath.js) && nonempty(transcodePath.wasm)))
  )
    return Promise.reject(
      new TypeError("KTX2 requires explicit transcoder URLs and workerLimit 1–32"),
    );
  const transcoderPath =
    typeof transcodePath === "string"
      ? transcodePath
      : transcodePath
        ? { js: transcodePath.js, wasm: transcodePath.wasm }
        : undefined;
  const cacheEnabledAtStart = Cache.enabled;
  const loader = new GLTFLoader(new LoadingManager());
  // No manager.abort(): FileLoader coalesces equal URLs globally, so transport abort could cancel another task.
  return new Promise<GLTFModel>((resolve, reject) => {
    let settled = false;
    let decoder: DRACOLoader | undefined;
    let transcoder: TaskKTX2Loader | undefined;
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
    const reportCleanup = (error: unknown): void => {
      try {
        if (onCleanupError) onCleanupError(error);
        else console.error("GLTF resource or decoder cleanup failed", error);
      } catch (reporterError) {
        console.error(
          "GLTF cleanup error reporter failed",
          new AggregateError([error, reporterError]),
        );
      }
    };
    const releaseDecoder = (): void => {
      const owned = decoder;
      decoder = undefined;
      const ownedTranscoder = transcoder;
      transcoder = undefined;
      ownedTranscoder?.finish();
      try {
        owned?.dispose();
      } catch (error) {
        reportCleanup(error);
      }
    };
    app.resources.track(pending);
    app.signal.addEventListener("abort", cancel, { once: true });
    signal?.addEventListener("abort", cancel, { once: true });
    const progress = (event: ProgressEvent): void => {
      if (settled || !onProgress) return;
      const total = event.lengthComputable && event.total > 0 ? event.total : null;
      try {
        onProgress({
          loaded: event.loaded,
          total,
          ratio: total === null ? null : Math.min(event.loaded / total, 1),
        });
      } catch (error) {
        fail(error);
      }
    };
    const loaded = (gltf: GLTF): void => {
      let model: GLTFModel | undefined;
      try {
        model = modelHandle(app, gltf, closeImageBitmaps && !cacheEnabledAtStart && !Cache.enabled);
        transcoder?.adopt();
        if (settled) {
          model.dispose();
          return;
        }
        // Native GLTFLoader may swallow texture errors and resolve an untextured model.
        if (transcoder?.failure) throw transcoder.failure.error;
        app.resources.untrack(pending);
        app.resources.track(model);
        if (addToScene) app.scene.add(model.scene);
        // Adding a scene fires synchronous native events; a consumer may dispose the app in one.
        if (app.signal.aborted || model.disposed || app.resources.disposed) {
          model.dispose();
          fail(aborted());
          return;
        }
        finish();
        resolve(model);
      } catch (error) {
        let failure = error;
        try {
          model?.dispose();
        } catch (cleanupError) {
          failure = new AggregateError([error, cleanupError], "Model loading and cleanup failed");
        }
        if (settled) reportCleanup(failure);
        else fail(failure);
      }
    };
    // Both continuations are attached even after cancellation, consuming late failures and results.
    try {
      if (settled || app.signal.aborted || app.resources.disposed || signal?.aborted) {
        fail(aborted());
        return;
      }
      if (decoderPath) {
        decoder = new DRACOLoader(loader.manager);
        decoder.setDecoderPath(decoderPath).setWorkerLimit(workerLimit);
        loader.setDRACOLoader(decoder);
      }
      if (meshoptDecoder) loader.setMeshoptDecoder(meshoptDecoder);
      if (transcoderPath) {
        transcoder = new TaskKTX2Loader(transcoderPath, reportCleanup);
        transcoder.setWorkerLimit(transcodeLimit).detectSupport(app.renderer);
        loader.setKTX2Loader(transcoder);
      }
      if (settled || app.signal.aborted || app.resources.disposed || signal?.aborted) {
        fail(aborted());
        releaseDecoder();
        return;
      }
      void loader.loadAsync(url, progress).then(
        (gltf) => {
          try {
            loaded(gltf);
          } finally {
            releaseDecoder();
          }
        },
        (error) => {
          try {
            fail(error);
          } finally {
            releaseDecoder();
          }
        },
      );
    } catch (error) {
      fail(error);
      releaseDecoder();
    }
  });
}
