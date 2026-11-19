import { OrthographicCamera, PerspectiveCamera, WebGLRenderer } from "three";
import type { Camera, WebGLRendererParameters } from "three";
import { createPerspectiveCamera } from "./perspective-camera.ts";
import { SceneHost, positive } from "./scene-host.ts";
import type { WebGPUCanvasRenderer } from "./scene-host.ts";
import type { PreparedWebGPUHost } from "./webgpu-host.ts";
import type {
  RendererType,
  WebGLRendererOptions,
  WebGLCreateOptions,
  WebGPUCreateOptions,
  ThreeAppCreateOptions,
} from "./app-options.ts";
export type {
  RendererType,
  WebGLRendererOptions,
  WebGPURendererOptions,
  ThreeAppCreateOptions,
} from "./app-options.ts";
export type {
  ThreeAppState,
  ViewportSize,
  RenderPipeline,
  SceneApp,
  PerspectiveSceneApp,
  OrthographicSceneApp,
} from "./scene-host.ts";

interface HostOptions {
  renderer?: WebGLRendererOptions;
  maxPixelRatio?: number;
  maxDelta?: number;
}
export interface ThreeAppOptions extends HostOptions {
  camera?: {
    fov?: number;
    near?: number;
    far?: number;
    position?: readonly [number, number, number];
  };
}
export interface OrthographicThreeAppOptions extends HostOptions {
  camera?: {
    frustumHeight?: number;
    near?: number;
    far?: number;
    position?: readonly [number, number, number];
  };
}

function creationSnapshot(options: ThreeAppCreateOptions): ThreeAppCreateOptions {
  if (!options || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Creation options must be an object");
  const snapshot = { ...options };
  if ("backend" in snapshot || "fallback" in snapshot || "rendererType" in snapshot)
    throw new TypeError("Use renderer.type and renderer.allowFallback to configure rendering");
  const { camera, renderer } = snapshot;
  if (camera !== undefined) {
    if (!camera || typeof camera !== "object" || Array.isArray(camera))
      throw new TypeError("Camera options must be an object");
    snapshot.camera = { ...camera };
    if (snapshot.camera.position !== undefined)
      snapshot.camera.position = [...snapshot.camera.position];
  }
  if (renderer !== undefined) {
    if (!renderer || typeof renderer !== "object" || Array.isArray(renderer))
      throw new TypeError("Renderer options must be an object");
    snapshot.renderer = { ...renderer };
  }
  return snapshot;
}
function rendererSettings(
  value: HostOptions["renderer"],
): Omit<WebGLRendererParameters, "canvas" | "context"> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Renderer options must be an object");
  const {
    canvas,
    context,
    type = "webgl",
    ...settings
  } = value as WebGLRendererParameters & WebGLRendererOptions;
  if (type !== "webgl") throw new TypeError("Use await ThreeApp.create() to select WebGPU");
  if ("allowFallback" in settings)
    throw new TypeError("allowFallback requires renderer.type: webgpu");
  if (canvas != null || context != null)
    throw new TypeError("ThreeApp does not accept an external canvas or context");
  return settings;
}

export type AnyThreeApp = SceneHost<Camera, WebGLRenderer>;
type RendererFor<R extends RendererType> = R extends "webgpu"
  ? WebGPUCanvasRenderer
  : WebGLRenderer;
export type ThreeAppInstance = ThreeApp<"webgl"> | ThreeApp<"webgpu">;

/** A ready scene host. create() selects the renderer; synchronous construction supports WebGL. */
class ThreeAppHost<R extends RendererType = "webgl"> extends SceneHost<
  PerspectiveCamera,
  RendererFor<R>
> {
  override get rendererType(): R {
    return super.rendererType as R;
  }

  static create(container: HTMLElement, options: WebGPUCreateOptions): Promise<ThreeApp<"webgpu">>;
  static create(container: HTMLElement, options?: WebGLCreateOptions): Promise<ThreeApp<"webgl">>;
  static create(container: HTMLElement, options: ThreeAppCreateOptions): Promise<ThreeAppInstance>;
  static async create(
    container: HTMLElement,
    options: ThreeAppCreateOptions = {},
  ): Promise<ThreeAppInstance> {
    const snapshot = creationSnapshot(options);
    const signal = snapshot.signal;
    const aborted = (): DOMException =>
      new DOMException("Scene creation was cancelled", "AbortError");
    if (signal?.aborted) throw aborted();
    const rendererType = snapshot.renderer?.type ?? "webgl";
    if (rendererType === "webgpu") {
      const { renderer, ...settings } = snapshot as WebGPUCreateOptions;
      const { type: _type, allowFallback = true, ...nativeOptions } = renderer;
      if (typeof allowFallback !== "boolean")
        throw new TypeError("allowFallback must be a boolean");
      let cancelImport: (() => void) | undefined;
      try {
        const loading = import("./webgpu-host.ts");
        const module = signal
          ? await Promise.race([
              loading,
              new Promise<never>((_resolve, reject) => {
                cancelImport = () => reject(aborted());
                signal.addEventListener("abort", cancelImport, { once: true });
                if (signal.aborted) cancelImport();
              }),
            ])
          : await loading;
        return module.initializeWebGPUHost(
          container,
          {
            ...settings,
            renderer: nativeOptions,
            backend: allowFallback ? "auto" : "webgpu",
          },
          (prepared) => {
            // Only this initialized path supplies the private implementation's third argument.
            // The public constructor signature only exposes synchronous WebGL construction.
            return Reflect.construct(ThreeApp, [
              container,
              prepared.options,
              prepared,
            ]) as ThreeApp<"webgpu">;
          },
        );
      } finally {
        if (cancelImport) signal?.removeEventListener("abort", cancelImport);
      }
    }
    if (rendererType !== "webgl") throw new TypeError("renderer.type must be webgl or webgpu");
    const app = new ThreeApp(container, snapshot as ThreeAppOptions);
    if (signal?.aborted) {
      await app.destroy();
      throw aborted();
    }
    return app;
  }

  constructor(
    container: HTMLElement,
    options: ThreeAppOptions = {},
    prepared?: PreparedWebGPUHost,
  ) {
    if ("backend" in options || "fallback" in options || "rendererType" in options)
      throw new TypeError("Use renderer.type and renderer.allowFallback to configure rendering");
    const renderer = prepared ? undefined : rendererSettings(options.renderer);
    super(
      container,
      options,
      () => (prepared ? prepared.camera : createPerspectiveCamera(options.camera)),
      (camera, aspect) => {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      },
      (document) =>
        (prepared
          ? prepared.renderer
          : new WebGLRenderer({
              antialias: true,
              ...renderer,
              canvas: document.createElement("canvas"),
            })) as RendererFor<R>,
      prepared ? undefined : (renderer) => (renderer as WebGLRenderer).forceContextLoss(),
      prepared?.disposeRenderer,
    );
    prepared?.setDeviceLossHandler(() => this.loseContext());
  }
}

export type ThreeApp<R extends RendererType = "webgl"> = ThreeAppHost<R>;
interface ThreeAppConstructor {
  new (container: HTMLElement, options?: ThreeAppOptions): ThreeApp<"webgl">;
  [Symbol.hasInstance](value: unknown): value is ThreeAppInstance;
  readonly prototype: ThreeApp<RendererType>;
  readonly name: string;
  readonly create: typeof ThreeAppHost.create;
}
/** Public constructor always produces WebGL; create() returns the requested initialized renderer. */
export const ThreeApp = ThreeAppHost as ThreeAppConstructor;

/** Orthographic host. Resize preserves vertical span, frustum center and native zoom. */
export class OrthographicThreeApp extends SceneHost<OrthographicCamera, WebGLRenderer> {
  constructor(container: HTMLElement, options: OrthographicThreeAppOptions = {}) {
    const renderer = rendererSettings(options.renderer);
    super(
      container,
      options,
      () => {
        const {
          frustumHeight = 10,
          near = 0,
          far = 1000,
          position = [0, 0, 10],
        } = options.camera ?? {};
        positive(frustumHeight, "camera.frustumHeight");
        if (
          !Number.isFinite(near) ||
          near < 0 ||
          !Number.isFinite(far) ||
          far <= near ||
          position.length !== 3 ||
          !position.every(Number.isFinite)
        )
          throw new RangeError("Invalid orthographic frustum or position");
        const half = frustumHeight / 2;
        const camera = new OrthographicCamera(-half, half, half, -half, near, far);
        validOrthographicProjection(camera);
        camera.position.set(...position);
        camera.lookAt(0, 0, 0);
        return camera;
      },
      (camera, aspect) => {
        const height = positive(camera.top - camera.bottom, "camera vertical span");
        const center = camera.left / 2 + camera.right / 2;
        const halfWidth = (height / 2) * aspect;
        const left = center - halfWidth,
          right = center + halfWidth;
        if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left)
          throw new RangeError("Invalid orthographic horizontal span");
        camera.left = left;
        camera.right = right;
        camera.updateProjectionMatrix();
        validOrthographicProjection(camera);
      },
      (document) =>
        new WebGLRenderer({
          antialias: true,
          ...renderer,
          canvas: document.createElement("canvas"),
        }),
      (renderer) => renderer.forceContextLoss(),
    );
  }
}

function validOrthographicProjection(camera: OrthographicCamera): void {
  if (
    !camera.projectionMatrix.elements.every(Number.isFinite) ||
    !camera.projectionMatrixInverse.elements.every(Number.isFinite) ||
    camera.projectionMatrixInverse.elements.every((value) => value === 0)
  )
    throw new RangeError("Orthographic projection must be finite and invertible");
}
