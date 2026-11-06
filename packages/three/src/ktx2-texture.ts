import { FileLoader, LoadingManager } from "three";
import type { CompressedTexture, Texture } from "three";
import { TaskKTX2Loader } from "./ktx2-task.ts";
import type { TranscoderPath } from "./ktx2-task.ts";
import { ResourceScope } from "./resources.ts";
import type { AnyThreeApp } from "./three-app.ts";
import type { TextureProgress } from "./textures.ts";

export interface LoadKTX2Options {
  /** Explicit r187 transcoder folder ending in /, or JS/WASM URLs. No implicit CDN. */
  transcoderPath: TranscoderPath;
  /** Integer 1–32. Default 1 per load task. */
  workerLimit?: number;
  signal?: AbortSignal;
  onProgress?: (progress: TextureProgress) => void;
  onCleanupError?: (error: unknown) => void;
}

export interface KTX2TextureAsset {
  /** Owned native 2D Basis texture. Color space and mipmaps come from the file. */
  readonly texture: CompressedTexture;
  readonly resources: ResourceScope;
  readonly disposed: boolean;
  dispose(this: void): void;
}

function aborted(): DOMException {
  return new DOMException("KTX2 texture loading was cancelled", "AbortError");
}

function is2DBasis(texture: Texture): texture is CompressedTexture {
  const value = texture as Texture & {
    isCompressedTexture?: boolean;
    isCompressedArrayTexture?: boolean;
    isCompressedCubeTexture?: boolean;
  };
  return (
    value.isCompressedTexture === true &&
    !value.isCompressedArrayTexture &&
    !value.isCompressedCubeTexture
  );
}

function owned(app: AnyThreeApp, texture: CompressedTexture): KTX2TextureAsset {
  const resources = new ResourceScope();
  let disposed = false;
  const handle: KTX2TextureAsset = {
    texture,
    resources,
    get disposed() {
      return disposed;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      app.resources.untrack(handle);
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
      if (errors.length) throw new AggregateError(errors, "KTX2 texture cleanup failed");
    },
  };
  return handle;
}

/** Load an independent 2D Basis KTX2 map. Borrow the renderer only for format detection. */
export function loadKTX2(
  app: AnyThreeApp,
  url: string,
  options: LoadKTX2Options,
): Promise<KTX2TextureAsset> {
  if (typeof url !== "string" || !url.trim())
    return Promise.reject(new TypeError("A non-empty KTX2 URL is required"));
  const path = options?.transcoderPath;
  const limit = options?.workerLimit ?? 1;
  const nonempty = (value: unknown): value is string => typeof value === "string" && !!value.trim();
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 32 ||
    !(typeof path === "string"
      ? nonempty(path) && path.endsWith("/")
      : path && nonempty(path.js) && nonempty(path.wasm))
  )
    return Promise.reject(
      new TypeError("KTX2 requires explicit transcoder URLs and workerLimit 1–32"),
    );
  const snapshot = typeof path === "string" ? path : { js: path.js, wasm: path.wasm };
  const { signal, onProgress, onCleanupError } = options;
  if (app.signal.aborted || app.resources.disposed || signal?.aborted)
    return Promise.reject(aborted());
  return new Promise<KTX2TextureAsset>((resolve, reject) => {
    let settled = false;
    let loader: TaskKTX2Loader | undefined;
    const pending = { dispose: (): void => fail(aborted()) };
    const finish = (): void => {
      settled = true;
      app.signal.removeEventListener("abort", cancel);
      signal?.removeEventListener("abort", cancel);
      app.resources.untrack(pending);
    };
    const fail = (error: unknown): void => {
      if (!settled) {
        finish();
        reject(error);
      }
    };
    const cancel = (): void => fail(aborted());
    const report = (error: unknown): void => {
      try {
        if (onCleanupError) onCleanupError(error);
        else console.error("KTX2 texture cleanup failed", error);
      } catch (reporterError) {
        console.error("KTX2 cleanup reporter failed", new AggregateError([error, reporterError]));
      }
    };
    const release = (): void => {
      loader?.finish();
    };
    const failed = (error: unknown): void => {
      fail(error);
      release();
    };
    const loaded = (texture: CompressedTexture): void => {
      let handle: KTX2TextureAsset | undefined;
      try {
        if (settled) return; // The adapter still owns this late texture and releases it below.
        if (!is2DBasis(texture)) throw new TypeError("Only 2D Basis KTX2 textures are supported");
        handle = owned(app, texture);
        loader!.adopt(); // Transfer before tracking so rollback has exactly one owner.
        if (app.signal.aborted || signal?.aborted || app.resources.disposed) throw aborted();
        app.resources.track(handle);
        finish();
        resolve(handle);
      } catch (error) {
        let failure = error;
        try {
          handle?.dispose();
        } catch (cleanupError) {
          failure = new AggregateError([error, cleanupError], "KTX2 texture load rollback failed");
        }
        if (settled) report(failure);
        else fail(failure);
      } finally {
        release();
      }
    };
    app.resources.track(pending);
    app.signal.addEventListener("abort", cancel, { once: true });
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      loader = new TaskKTX2Loader(snapshot, report);
      loader.setWorkerLimit(limit).detectSupport(app.renderer);
      if (settled || app.signal.aborted || app.resources.disposed || signal?.aborted) {
        failed(aborted());
        return;
      }
      new FileLoader(new LoadingManager()).setResponseType("arraybuffer").load(
        url,
        (buffer): void => {
          if (settled) {
            release();
            return;
          }
          if (!(buffer instanceof ArrayBuffer)) {
            failed(new TypeError("KTX2 requires binary data"));
            return;
          }
          loader!.parse(buffer, loaded, failed);
        },
        (event): void => {
          if (settled || !onProgress) return;
          const total = event.lengthComputable && event.total > 0 ? event.total : null;
          try {
            onProgress({
              loaded: event.loaded,
              total,
              ratio: total ? Math.min(event.loaded / total, 1) : null,
            });
          } catch (error) {
            fail(error);
          }
        },
        failed,
      );
    } catch (error) {
      failed(error);
    }
  });
}
