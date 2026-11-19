import { retireAfterRender } from "./render-retirement.ts";
import { webGPUFeatures } from "../webgpu/features.ts";
import { installWebGPUFeatures } from "./webgpu-features.ts";
import { WebGPURenderer } from "three/webgpu";
import { WebGPUCoordinateSystem, WebGLCoordinateSystem } from "three";
import type { PerspectiveCamera } from "three";
import type { WebGPURendererParameters } from "three/webgpu";
import { positive } from "./scene-host.ts";
import type { SceneHost } from "./scene-host.ts";
import type { SceneHostOptions, WebGPUCanvasRenderer } from "./scene-host.ts";
import { createPerspectiveCamera } from "./perspective-camera.ts";
import type { PerspectiveCameraOptions } from "./perspective-camera.ts";

export interface WebGPUHostOptions extends SceneHostOptions {
  camera?: PerspectiveCameraOptions;
  /** auto permits native WebGL 2 fallback; webgpu rejects a fallback result. Default auto. */
  backend?: "auto" | "webgpu" | "webgl2";
  renderer?: Pick<
    WebGPURendererParameters,
    | "antialias"
    | "alpha"
    | "depth"
    | "stencil"
    | "samples"
    | "reversedDepthBuffer"
    | "logarithmicDepthBuffer"
    | "powerPreference"
    | "outputBufferType"
  >;
  /** Cancels creation only. The initialized host has its own lifetime signal. */
  signal?: AbortSignal;
  /** Reports late native cleanup failures after cancellation or failed creation. */
  onCleanupError?: (error: unknown) => void;
}

export interface PreparedWebGPUHost {
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGPUCanvasRenderer;
  readonly options: SceneHostOptions;
  readonly disposeRenderer: () => Promise<void>;
  setDeviceLossHandler(handler: () => void): void;
}

function rendererSettings(
  value: WebGPUHostOptions["renderer"],
): NonNullable<WebGPUHostOptions["renderer"]> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Renderer options must be an object");
  const settings = { ...value };
  for (const key of Object.keys(settings)) {
    if (
      ![
        "antialias",
        "alpha",
        "depth",
        "stencil",
        "samples",
        "reversedDepthBuffer",
        "logarithmicDepthBuffer",
        "powerPreference",
        "outputBufferType",
      ].includes(key)
    )
      throw new TypeError(
        `Unsupported WebGPU renderer option: ${key}; external canvas/context/device are not accepted`,
      );
  }
  return settings;
}

/** Initialize off-DOM, then mount an idle host using the same owned RAF as ThreeApp. */
export async function initializeWebGPUHost<
  T extends SceneHost<PerspectiveCamera, WebGPUCanvasRenderer>,
>(
  container: HTMLElement,
  options: WebGPUHostOptions,
  createHost: (prepared: PreparedWebGPUHost) => T,
): Promise<T> {
  const view = container?.ownerDocument?.defaultView;
  if (!view || container.nodeType !== 1)
    throw new TypeError("A browser HTMLElement container is required");
  if (typeof view.ResizeObserver !== "function") throw new Error("ResizeObserver is required");
  const { backend = "auto", signal, onCleanupError } = options;
  const hostOptions = {
    maxDelta: positive(options.maxDelta ?? 0.1, "maxDelta"),
    maxPixelRatio: positive(options.maxPixelRatio ?? 2, "maxPixelRatio"),
  };
  if (!["auto", "webgpu", "webgl2"].includes(backend))
    throw new TypeError("Invalid WebGPU backend");
  const settings = rendererSettings(options.renderer);
  const camera = createPerspectiveCamera(options.camera);
  const aborted = (): DOMException =>
    new DOMException("WebGPU creation was cancelled", "AbortError");
  if (signal?.aborted) throw aborted();
  const canvas = container.ownerDocument.createElement("canvas");
  const renderer = new WebGPURenderer({
    antialias: true,
    ...settings,
    canvas,
    forceWebGL: backend === "webgl2",
  }) as WebGPUCanvasRenderer;
  let nativeCleanup: Promise<void> | undefined;
  const cleanup = (): Promise<void> =>
    (nativeCleanup ??= new Promise<void>((resolve, reject) => {
      retireAfterRender(renderer, () => {
        void (async () => {
          const errors: unknown[] = [];
          try {
            await renderer.dispose();
          } catch (error) {
            errors.push(error);
          }
          try {
            // r187 keeps an explicitly supplied WebGL canvas context alive after dispose().
            if (renderer.initialized && renderer.coordinateSystem === WebGLCoordinateSystem) {
              const context = renderer.getContext() as WebGL2RenderingContext;
              context.getExtension("WEBGL_lose_context")?.loseContext();
            }
          } catch (error) {
            errors.push(error);
          }
          try {
            canvas.remove();
          } catch (error) {
            errors.push(error);
          }
          if (errors.length === 1) throw errors[0];
          if (errors.length) throw new AggregateError(errors, "WebGPU renderer cleanup failed");
        })().then(resolve, reject);
      });
    }));
  const report = (error: unknown): void => {
    try {
      if (onCleanupError) onCleanupError(error);
      else console.error(error);
    } catch (reportError) {
      console.error(reportError);
    }
  };
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let app: T | undefined;
    let handleDeviceLoss: (() => void) | undefined;
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      reject(error);
    };
    const cancel = (): void => fail(aborted());
    signal?.addEventListener("abort", cancel, { once: true });
    renderer.onDeviceLost = () => {
      if (handleDeviceLoss) handleDeviceLoss();
      else fail(new Error("GPU device/context was lost during initialization"));
    };
    if (signal?.aborted) cancel();
    void (async () => {
      try {
        await renderer.init();
        if (settled) {
          await cleanup();
          return;
        }
        if (backend === "webgpu" && renderer.coordinateSystem !== WebGPUCoordinateSystem)
          throw new Error("WebGPU is required but the renderer selected WebGL 2");
        camera.coordinateSystem = renderer.coordinateSystem;
        camera.updateProjectionMatrix();
        installWebGPUFeatures(webGPUFeatures);
        app = createHost({
          camera,
          renderer,
          options: hostOptions,
          disposeRenderer: cleanup,
          setDeviceLossHandler(handler) {
            handleDeviceLoss = handler;
          },
        });
        if (settled || signal?.aborted || app.state === "disposed") {
          await app.destroy();
          fail(aborted());
          return;
        }
        settled = true;
        signal?.removeEventListener("abort", cancel);
        resolve(app);
      } catch (error) {
        fail(error);
        try {
          if (app) await app.destroy();
          else await cleanup();
        } catch (cleanupError) {
          report(cleanupError);
        }
      }
    })();
  });
}
