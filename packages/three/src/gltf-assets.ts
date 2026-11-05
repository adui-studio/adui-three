import type { Disposable, ResourceScope } from "./resources.ts";

/** One decoded asset snapshot, retained by the original model and all explicit clones. */
export class SharedGLTFAssets {
  #count = 0;
  #disposed = false;

  constructor(private readonly resources: ResourceScope) {}

  acquire(): Disposable {
    if (this.#disposed) throw new Error("GLTF assets have been disposed");
    this.#count++;
    let released = false;
    return {
      dispose: (): void => {
        if (released) return;
        released = true;
        if (--this.#count === 0) {
          this.#disposed = true;
          this.resources.dispose();
        }
      },
    };
  }
}

/** Only handles created by this library participate; no global URL or decoded-model cache. */
export const gltfAssets = new WeakMap<object, SharedGLTFAssets>();
