import { Cache, LoadingManager } from "three";
import type { Group } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { ThreeApp } from "./three-app.ts";
import { collectGLTFResources } from "./gltf-resources.ts";
import { ResourceScope } from "./resources.ts";

export interface ModelProgress {
  /** Bytes of the primary GLTF/GLB request, not total dependency/decode progress. */
  readonly loaded: number;
  readonly total: number | null;
  readonly ratio: number | null;
}

export interface LoadGLTFOptions {
  signal?: AbortSignal;
  /** Defaults to true; false keeps the model detached but owned by the app. */
  addToScene?: boolean;
  onProgress?: (progress: ModelProgress) => void;
  /** Defaults to true for uncached loads. Set false for externally shared image data. */
  closeImageBitmaps?: boolean;
  /** Reports errors disposing a late result after the returned promise already rejected. */
  onCleanupError?: (error: unknown) => void;
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
  } = options;
  if (typeof url !== "string" || !url.trim())
    return Promise.reject(new TypeError("A non-empty GLTF/GLB URL is required"));
  if (app.signal.aborted || app.resources.disposed || signal?.aborted)
    return Promise.reject(aborted());
  const cacheEnabledAtStart = Cache.enabled;
  const loader = new GLTFLoader(new LoadingManager());
  // No manager.abort(): FileLoader coalesces equal URLs globally, so transport abort could cancel another task.
  return new Promise<GLTFModel>((resolve, reject) => {
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
    const reportCleanup = (error: unknown): void => {
      try {
        if (onCleanupError) onCleanupError(error);
        else console.error("Late GLTF resource cleanup failed", error);
      } catch (reporterError) {
        console.error(
          "GLTF cleanup error reporter failed",
          new AggregateError([error, reporterError]),
        );
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
        if (settled) {
          model.dispose();
          return;
        }
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
      void loader.loadAsync(url, progress).then(loaded, fail);
    } catch (error) {
      fail(error);
    }
  });
}
