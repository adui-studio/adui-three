import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __ktx: {
      created: number;
      terminated: number;
      revoked: number;
      compressed: number;
      rgba: number;
      deleted: number;
    };
  }
}

export async function observeKTX2(page: Page, fallback = false): Promise<void> {
  await page.addInitScript(
    ({ fallback }) => {
      window.__ktx = { created: 0, terminated: 0, revoked: 0, compressed: 0, rgba: 0, deleted: 0 };
      const workers = new Set<string>();
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          workers.add(String(url));
          window.__ktx.created++;
        }
        terminate(): void {
          window.__ktx.terminated++;
          super.terminate();
        }
      };
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (url: string): void => {
        if (workers.has(url)) window.__ktx.revoked++;
        revoke(url);
      };
      const prototype = WebGL2RenderingContext.prototype;
      for (const method of [
        "compressedTexImage2D",
        "compressedTexSubImage2D",
        "texSubImage2D",
        "deleteTexture",
      ] as const) {
        const native = prototype[method] as (...args: unknown[]) => void;
        Object.defineProperty(prototype, method, {
          configurable: true,
          writable: true,
          value: function (this: WebGL2RenderingContext, ...args: unknown[]): void {
            if (method === "deleteTexture") window.__ktx.deleted++;
            else if (method === "texSubImage2D") {
              if (args[4] === 16 && args[5] === 16) window.__ktx.rgba++;
            } else window.__ktx.compressed++;
            native.apply(this, args);
          },
        });
      }
      if (fallback) {
        const getExtension = Reflect.get(prototype, "getExtension") as (name: string) => unknown;
        Object.defineProperty(prototype, "getExtension", {
          configurable: true,
          writable: true,
          value: function (this: WebGL2RenderingContext, name: string): unknown {
            if (/compressed_texture|texture_compression/.test(name)) return null;
            return Reflect.apply(getExtension, this, [name]);
          },
        });
      }
    },
    { fallback },
  );
}
