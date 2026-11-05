import { LoadingManager } from "three";
import type { CompressedTexture } from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";

export type TranscoderPath = string | { readonly js: string; readonly wasm: string };

/** Internal per-task adapter around r187's callback API and global ArrayBuffer task cache. */
export class TaskKTX2Loader extends KTX2Loader {
  #active = 0;
  #ended = false;
  #released = false;
  #adopted = false;
  #textures = new Set<CompressedTexture>();
  #failure: { error: unknown } | undefined;
  #report: (error: unknown) => void;

  constructor(path: TranscoderPath, report: (error: unknown) => void) {
    const manager = new LoadingManager();
    super(manager);
    this.#report = report;
    if (typeof path === "string") this.setTranscoderPath(path);
    else {
      // KTX2Loader only accepts a directory. Map its two fixed filenames in this private manager.
      const prefix = "adui-ktx2:";
      manager.setURLModifier((url) => {
        if (url === `${prefix}basis_transcoder.js`) return path.js;
        if (url === `${prefix}basis_transcoder.wasm`) return path.wasm;
        return url;
      });
      this.setTranscoderPath(prefix);
    }
  }

  get failure(): { error: unknown } | undefined {
    return this.#failure;
  }

  override load(
    url: string,
    onLoad: (texture: CompressedTexture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    const failed = (error: unknown): void => {
      this.#failure ??= { error };
      onError?.(error);
    };
    try {
      super.load(url, onLoad, onProgress, failed);
    } catch (error) {
      failed(error);
    }
  }

  override parse(
    buffer: ArrayBuffer,
    onLoad?: (texture: CompressedTexture) => void,
    onError?: (error: unknown) => void,
  ): void {
    if (this.#ended) {
      onError?.(new Error("The KTX2 model task has settled"));
      return;
    }
    this.#active++;
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      this.#active--;
      this.#release();
    };
    const failed = (error: unknown): void => {
      this.#failure ??= { error };
      try {
        onError?.(error);
      } finally {
        finish();
      }
    };
    try {
      // FileLoader may coalesce equal URLs or return a globally cached buffer. Never transfer it
      // or reuse KTX2Loader's cached Texture across independently owned model tasks.
      super.parse(
        buffer.slice(0),
        (texture) => {
          this.#textures.add(texture);
          try {
            onLoad?.(texture);
          } finally {
            finish();
          }
        },
        failed,
      );
    } catch (error) {
      failed(error);
    }
  }

  /** A model resource snapshot now owns the decoded textures, including a late cancelled model. */
  adopt(): void {
    this.#adopted = true;
    this.#textures.clear();
  }

  /** Native GLTF completion may fail before other texture transcodes have finished. */
  finish(): void {
    this.#ended = true;
    this.#release();
  }

  #release(): void {
    if (!this.#ended || this.#active !== 0 || this.#released) return;
    this.#released = true;
    if (!this.#adopted)
      for (const texture of this.#textures) {
        try {
          texture.dispose();
        } catch (error) {
          this.#report(error);
        }
      }
    this.#textures.clear();
    // r187 dispose decrements a global active counter even if init never ran. An unused loader
    // owns no worker/Blob URL; skip native dispose until init has incremented that counter.
    if (this.transcoderPending !== null)
      try {
        super.dispose();
      } catch (error) {
        this.#report(error);
      }
  }
}
