import {
  FileLoader,
  LinearSRGBColorSpace,
  LoadingManager,
  NoColorSpace,
  SRGBColorSpace,
  Texture,
} from "three";
import type { AnyThreeApp } from "./three-app.ts";
import { ResourceScope } from "./resources.ts";

export { loadKTX2 } from "./ktx2-texture.ts";
export type { KTX2TextureAsset, LoadKTX2Options } from "./ktx2-texture.ts";

export interface TextureProgress {
  readonly loaded: number;
  readonly total: number | null;
  readonly ratio: number | null;
}

export interface LoadTextureOptions {
  signal?: AbortSignal;
  /** Default SRGBColorSpace for color images. Use NoColorSpace for scalar/normal maps. */
  colorSpace?: typeof SRGBColorSpace | typeof LinearSRGBColorSpace | typeof NoColorSpace;
  /** Applied during bitmap decoding; cannot be changed later via Texture.flipY. Default true. */
  flipY?: boolean;
  onProgress?: (progress: TextureProgress) => void;
  onCleanupError?: (error: unknown) => void;
}

export interface TextureAsset {
  /** Owned native texture/bitmap. Do not dispose the texture or close its image separately. */
  readonly texture: Texture<ImageBitmap>;
  /** Consumer detach hooks run before texture.dispose and ImageBitmap.close. */
  readonly resources: ResourceScope;
  readonly disposed: boolean;
  dispose(this: void): void;
}

function aborted(): DOMException {
  return new DOMException("Texture loading was cancelled", "AbortError");
}

function asset(app: AnyThreeApp, texture: Texture<ImageBitmap>): TextureAsset {
  const resources = new ResourceScope();
  const bitmap = texture.image;
  let disposed = false;
  const handle: TextureAsset = {
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
      for (const release of [
        () => resources.dispose(),
        () => texture.dispose(),
        () => bitmap.close(),
      ]) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "Texture asset cleanup failed");
    },
  };
  return handle;
}

/** Independently decode an owned image; no material mutation, automatic render or shared bitmap cache. */
export function loadTexture(
  app: AnyThreeApp,
  url: string,
  options: LoadTextureOptions = {},
): Promise<TextureAsset> {
  const { signal, colorSpace = SRGBColorSpace, flipY = true, onProgress, onCleanupError } = options;
  if (typeof url !== "string" || !url.trim())
    return Promise.reject(new TypeError("A non-empty image URL is required"));
  if (
    ![SRGBColorSpace, LinearSRGBColorSpace, NoColorSpace].includes(colorSpace) ||
    typeof flipY !== "boolean"
  )
    return Promise.reject(new RangeError("Invalid texture color space or flipY"));
  if (app.signal.aborted || app.resources.disposed || signal?.aborted)
    return Promise.reject(aborted());
  const view = app.renderer.domElement.ownerDocument.defaultView;
  if (!view || typeof view.createImageBitmap !== "function")
    return Promise.reject(new Error("createImageBitmap is required to load owned textures"));
  const decode = view.createImageBitmap.bind(view);
  return new Promise<TextureAsset>((resolve, reject) => {
    let settled = false;
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
        else console.error("Texture late cleanup failed", error);
      } catch (reporterError) {
        console.error(
          "Texture cleanup reporter failed",
          new AggregateError([error, reporterError]),
        );
      }
    };
    const decoded = (bitmap: ImageBitmap): void => {
      let texture: Texture<ImageBitmap> | undefined;
      let transferred = false;
      try {
        if (settled || app.signal.aborted || signal?.aborted || app.resources.disposed) {
          transferred = true;
          bitmap.close();
          fail(aborted());
          return;
        }
        texture = new Texture(bitmap);
        texture.colorSpace = colorSpace;
        texture.flipY = false; // Orientation is baked into the bitmap, as required by WebGL.
        texture.needsUpdate = true;
        const handle = asset(app, texture);
        app.resources.track(handle);
        transferred = true;
        finish();
        resolve(handle);
      } catch (error) {
        const errors = [error];
        if (!transferred) {
          try {
            texture?.dispose();
          } catch (failure) {
            errors.push(failure);
          }
          try {
            bitmap.close();
          } catch (failure) {
            errors.push(failure);
          }
        }
        const failure =
          errors.length === 1 ? error : new AggregateError(errors, "Texture load rollback failed");
        if (settled) report(failure);
        else fail(failure);
      }
    };
    app.resources.track(pending);
    app.signal.addEventListener("abort", cancel, { once: true });
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      // Share immutable downloaded bytes only. Decoding and ImageBitmap ownership stay per task.
      new FileLoader(new LoadingManager()).setResponseType("arraybuffer").load(
        url,
        (buffer): void => {
          if (settled) return;
          try {
            if (!(buffer instanceof ArrayBuffer))
              throw new TypeError("Texture requires binary data");
            void decode(new Blob([buffer]), {
              imageOrientation: flipY ? "flipY" : "none",
              premultiplyAlpha: "none",
              colorSpaceConversion: "none",
            }).then(decoded, fail);
          } catch (error) {
            fail(error);
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
