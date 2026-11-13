import type { AnyThreeApp } from "./three-app.ts";

export interface CaptureRegion {
  /** Top-left origin in actual drawing-buffer pixels, independent of CSS size and DPR. */
  readonly x: number;
  readonly y: number;
  /** Positive integer output dimensions. No resampling or automatic clipping. */
  readonly width: number;
  readonly height: number;
}

export interface CaptureFrameOptions {
  /** Browser encoding; unsupported formats may fall back to PNG. Inspect Blob.type. Default PNG. */
  type?: "image/png" | "image/jpeg" | "image/webp";
  /** Finite [0,1]; only affects lossy formats supported by the browser. */
  quality?: number;
  signal?: AbortSignal;
  /** Optional pixel rectangle within the canvas produced by this capture's draw. */
  region?: CaptureRegion;
}

function snapshotRegion(value: CaptureRegion | undefined): CaptureRegion | undefined {
  if (value === undefined) return;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Capture region must be a pixel rectangle");
  const { x, y, width, height } = value;
  if (
    ![x, y, width, height].every(Number.isSafeInteger) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0
  )
    throw new RangeError(
      "Capture region requires nonnegative integer origin and positive dimensions",
    );
  return { x, y, width, height };
}

function aborted(): DOMException {
  return new DOMException("Frame capture was cancelled", "AbortError");
}

/** Draw once and copy the canvas synchronously, then encode an independent image. No DOM overlays. */
export async function captureFrame(
  app: AnyThreeApp,
  options: CaptureFrameOptions = {},
): Promise<Blob> {
  const { type = "image/png", quality, signal, region: requestedRegion } = options;
  const region = snapshotRegion(requestedRegion);
  if (!["image/png", "image/jpeg", "image/webp"].includes(type))
    throw new TypeError("Capture type must be image/png, image/jpeg or image/webp");
  if (quality !== undefined && (!Number.isFinite(quality) || quality < 0 || quality > 1))
    throw new RangeError("Capture quality must be finite and within [0,1]");
  const active = (): void => {
    if (app.state === "disposed" || app.resources.disposed || app.signal.aborted || signal?.aborted)
      throw aborted();
  };
  active();
  const source = app.renderer.domElement;
  const document = source.ownerDocument;
  const drawable = (): void => {
    active();
    if (
      !app.size.width ||
      !app.size.height ||
      document.hidden ||
      app.renderer.getContext().isContextLost()
    )
      throw new Error("Capture requires a visible nonzero canvas and an available WebGL context");
    if (app.renderer.getRenderTarget() !== null)
      throw new Error("Capture requires the default canvas render target");
  };
  drawable();
  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    let surface: HTMLCanvasElement | undefined;
    const pending = { dispose: (): void => finish({ error: aborted() }) };
    const cancel = (): void => finish({ error: aborted() });
    const finish = (result: { blob: Blob } | { error: unknown }): void => {
      if (settled) return;
      settled = true;
      const errors: unknown[] = [];
      const attempt = (cleanup: () => void): void => {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      };
      attempt(() => app.signal.removeEventListener("abort", cancel));
      attempt(() => signal?.removeEventListener("abort", cancel));
      attempt(() => {
        app.resources.untrack(pending);
      });
      const owned = surface;
      surface = undefined;
      if (owned) {
        attempt(() => {
          owned.width = 0;
        });
        attempt(() => {
          owned.height = 0;
        });
      }
      if (errors.length)
        reject(
          new AggregateError(
            "error" in result ? [result.error, ...errors] : errors,
            "Frame capture cleanup failed",
          ),
        );
      else if ("error" in result) reject(result.error);
      else resolve(result.blob);
    };
    try {
      app.signal.addEventListener("abort", cancel, { once: true });
      signal?.addEventListener("abort", cancel, { once: true });
      app.resources.track(pending);
      drawable();
      app.render(); // Throws for host-frame/resize reentry; updates and host intent stay unchanged.
      if (settled) return;
      drawable();
      if (!source.width || !source.height) throw new Error("Capture canvas has no drawing buffer");
      if (
        region &&
        (region.x > source.width - region.width || region.y > source.height - region.height)
      )
        throw new RangeError("Capture region must fit within the rendered drawing buffer");
      const snapshot = document.createElement("canvas");
      surface = snapshot;
      snapshot.width = region?.width ?? source.width;
      snapshot.height = region?.height ?? source.height;
      const context = snapshot.getContext("2d");
      if (!context) throw new Error("Canvas 2D encoding is unavailable");
      if (settled) return;
      if (region)
        context.drawImage(
          source,
          region.x,
          region.y,
          region.width,
          region.height,
          0,
          0,
          region.width,
          region.height,
        );
      else context.drawImage(source, 0, 0);
      if (settled) return;
      active();
      snapshot.toBlob(
        (blob) => {
          if (settled) return; // Logical cancellation cannot stop a native encoder already in progress.
          if (blob) finish({ blob });
          else finish({ error: new Error("Frame encoding returned no image") });
        },
        type,
        quality,
      );
    } catch (error) {
      finish({ error });
    }
  });
}
