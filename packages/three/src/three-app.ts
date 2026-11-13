import { OrthographicCamera, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { Camera, WebGLRendererParameters } from "three";
import { FrameLoop } from "./frame-loop.ts";
import type { FrameInfo } from "./frame-loop.ts";
import { ResourceScope } from "./resources.ts";

export type ThreeAppState = "ready" | "running" | "stopped" | "disposed";

interface HostOptions {
  /** Only scalar/configuration options. Non-null external canvas/context are rejected at runtime. */
  renderer?: Omit<WebGLRendererParameters, "canvas" | "context">;
  /** Positive, finite DPR ceiling. Default 2. */
  maxPixelRatio?: number;
  /** Positive, finite per-frame delta ceiling in seconds. Default 0.1. */
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
    /** Unzoomed vertical span in scene units. Default 10. */
    frustumHeight?: number;
    /** Nonnegative and finite. Default 0. */
    near?: number;
    /** Finite and greater than near. Default 1000. */
    far?: number;
    /** Default [0, 0, 10], looking at the origin. */
    position?: readonly [number, number, number];
  };
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

/** Borrowed rendering strategy. The caller owns its resources and disposal. */
export interface RenderPipeline {
  render(frame: FrameInfo): void;
  /** CSS dimensions and the capped DPR, including zero-size notifications. */
  resize(size: ViewportSize): void;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} must be positive and finite`);
  return value;
}

function rendererSettings(value: HostOptions["renderer"]): NonNullable<HostOptions["renderer"]> {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Renderer options must be an object");
  // Omit only restricts object literals: wider native parameter objects can still be passed.
  const { canvas, context, ...settings } = value as WebGLRendererParameters;
  if (canvas != null || context != null)
    throw new TypeError("ThreeApp does not accept an external canvas or context");
  return settings;
}

/** One browser container, one renderer, one owned frame loop. Construction does not start it. */
abstract class SceneHost<C extends Camera> {
  readonly scene: Scene;
  readonly camera: C;
  readonly renderer: WebGLRenderer;
  readonly resources = new ResourceScope();
  #container: HTMLElement;
  #view: Window & typeof globalThis;
  #document: Document;
  #loop: FrameLoop;
  #platform = new ResourceScope();
  #updates = new Set<(frame: FrameInfo) => void>();
  #afterRender = new Set<(frame: FrameInfo) => void>();
  #abort = new AbortController();
  #state: ThreeAppState = "ready";
  #revision = 0;
  #size: ViewportSize = { width: 0, height: 0, pixelRatio: 1 };
  #drawable = false;
  #maxPixelRatio: number;
  #media: MediaQueryList | null = null;
  #pipeline: { value: RenderPipeline; sizeDirty: boolean } | null = null;
  #bufferDirty = false;
  #resizing = false;
  #inFrame = false;
  #elapsed = 0;
  #contextLost = false;
  #projectCamera: (aspect: number) => void;

  protected constructor(
    container: HTMLElement,
    options: HostOptions,
    createCamera: () => C,
    projectCamera: (camera: C, aspect: number) => void,
  ) {
    const view = container?.ownerDocument?.defaultView;
    if (!view || container.nodeType !== 1)
      throw new TypeError("A browser HTMLElement container is required");
    if (typeof view.ResizeObserver !== "function") throw new Error("ResizeObserver is required");
    const maxDelta = positive(options.maxDelta ?? 0.1, "maxDelta");
    this.#maxPixelRatio = positive(options.maxPixelRatio ?? 2, "maxPixelRatio");
    const renderer = rendererSettings(options.renderer);
    this.#container = container;
    this.#document = container.ownerDocument;
    this.#view = view;
    this.scene = new Scene();
    this.camera = createCamera();
    this.#projectCamera = (aspect) => projectCamera(this.camera, aspect);
    const canvas = this.#document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%";
    this.renderer = new WebGLRenderer({ antialias: true, ...renderer, canvas });
    this.#loop = new FrameLoop(
      {
        request: (callback) => view.requestAnimationFrame(callback),
        cancel: (id) => view.cancelAnimationFrame(id),
      },
      (frame) => this.#update(frame),
      maxDelta,
    );
    try {
      canvas.addEventListener("webglcontextlost", this.#handleContextLost);
      this.#platform.track({
        dispose: () => canvas.removeEventListener("webglcontextlost", this.#handleContextLost),
      });
      container.appendChild(canvas);
      const observer = new view.ResizeObserver(() => this.resize());
      this.#platform.track({ dispose: () => observer.disconnect() });
      observer.observe(container);
      view.addEventListener("resize", this.#handleResize);
      this.#platform.track({
        dispose: () => view.removeEventListener("resize", this.#handleResize),
      });
      this.#document.addEventListener("visibilitychange", this.#handleVisibility);
      this.#platform.track({
        dispose: () =>
          this.#document.removeEventListener("visibilitychange", this.#handleVisibility),
      });
      this.#platform.track({
        dispose: () => this.#media?.removeEventListener("change", this.#handleDpr),
      });
      this.#watchDpr();
      this.resize();
    } catch (error) {
      try {
        this.dispose();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "ThreeApp initialization and rollback failed",
        );
      }
      throw error;
    }
  }

  get state(): ThreeAppState {
    return this.#state;
  }
  /** Sticky loss diagnosis. A lost context disposes this host; create a new host to recover. */
  get contextLost(): boolean {
    return this.#contextLost;
  }
  get size(): ViewportSize {
    return { ...this.#size };
  }
  /** Aborted synchronously on dispose; consumers can guard asynchronous results with it. */
  get signal(): AbortSignal {
    return this.#abort.signal;
  }

  start(): void {
    this.#assertActive();
    if (this.#state === "running") return;
    this.#state = "running";
    this.#revision++;
    this.#syncLoop();
  }

  stop(): void {
    if (this.#state === "disposed" || this.#state === "stopped") return;
    this.#state = "stopped";
    this.#revision++;
    this.#loop.stop();
  }

  onUpdate(callback: (frame: FrameInfo) => void): () => void {
    this.#assertActive();
    // Each subscription is independent, even for the same callback.
    const subscription = (frame: FrameInfo): void => callback(frame);
    this.#updates.add(subscription);
    return () => {
      this.#updates.delete(subscription);
    };
  }

  /** Runs after all updates and a successful render, within the same owned frame. */
  onAfterRender(callback: (frame: FrameInfo) => void): () => void {
    this.#assertActive();
    const subscription = (frame: FrameInfo): void => callback(frame);
    this.#afterRender.add(subscription);
    return () => {
      this.#afterRender.delete(subscription);
    };
  }

  /** Exclusively attach a borrowed pipeline. Detach restores the default renderer. */
  setRenderPipeline(pipeline: RenderPipeline): () => void {
    this.#assertActive();
    if (this.#resizing) throw new Error("Cannot attach a pipeline reentrantly during resize");
    if (!pipeline) throw new TypeError("A render and resize pipeline is required");
    // oxlint-disable-next-line typescript/unbound-method -- Snapshot validation only; never invoked unbound.
    const render = pipeline.render;
    this.#assertActive();
    // oxlint-disable-next-line typescript/unbound-method -- Invoked with call(pipeline) after owner checks.
    const resize = pipeline.resize;
    this.#assertActive();
    if (typeof render !== "function" || typeof resize !== "function")
      throw new TypeError("A render and resize pipeline is required");
    if (this.#pipeline) throw new Error("A render pipeline is already attached");
    const lease = { value: pipeline, sizeDirty: false };
    this.#pipeline = lease;
    const detach = (): void => {
      if (this.#pipeline === lease) this.#pipeline = null;
    };
    this.#resizing = true;
    try {
      resize.call(pipeline, this.size);
      this.#assertActive();
      if (this.#pipeline !== lease) throw new Error("Render pipeline attachment was interrupted");
      return detach;
    } catch (error) {
      detach();
      throw error;
    } finally {
      this.#resizing = false;
    }
  }

  /** Draw once without updates, advancing time or scheduling another frame. */
  render(): void {
    this.#assertActive();
    if (this.#inFrame || this.#resizing)
      throw new Error("Cannot render reentrantly within a host frame or resize");
    const revision = this.#revision;
    const valid = (): boolean =>
      this.#state !== "disposed" &&
      revision === this.#revision &&
      this.#drawable &&
      !this.#document.hidden;
    if (!valid()) return;
    this.#inFrame = true;
    try {
      this.#draw({ delta: 0, elapsed: this.#elapsed }, valid);
    } catch (error) {
      this.stop();
      throw error;
    } finally {
      this.#inFrame = false;
    }
  }

  resize(): void {
    this.#assertActive();
    if (this.#resizing) throw new Error("Cannot resize reentrantly");
    this.#resizing = true;
    try {
      const width = this.#container.clientWidth;
      const height = this.#container.clientHeight;
      const pixelRatio = Math.min(this.#view.devicePixelRatio || 1, this.#maxPixelRatio);
      const previous = this.#size;
      this.#size = { width, height, pixelRatio };
      this.#drawable = width > 0 && height > 0;
      const changed =
        width !== previous.width ||
        height !== previous.height ||
        pixelRatio !== previous.pixelRatio;
      if (changed) {
        this.#bufferDirty = true;
        // Preserve both operations even when native sizing fails before the pipeline is notified.
        if (this.#pipeline) this.#pipeline.sizeDirty = true;
      }
      if (this.#drawable && this.#bufferDirty) {
        this.#projectCamera(width / height);
        this.renderer.setDrawingBufferSize(width, height, pixelRatio);
        this.#bufferDirty = false;
      }
      if (this.#pipeline?.sizeDirty) {
        const lease = this.#pipeline;
        // oxlint-disable-next-line typescript/unbound-method -- Preserve the receiver via call after lease checks.
        const resize = lease.value.resize;
        if (this.#state === "disposed" || this.#pipeline !== lease) return;
        resize.call(lease.value, this.size);
        lease.sizeDirty = false;
      }
      this.#syncLoop();
    } catch (error) {
      this.stop();
      throw error;
    } finally {
      this.#resizing = false;
    }
  }

  dispose(): void {
    if (this.#state === "disposed") return;
    this.#state = "disposed";
    this.#revision++;
    const errors: unknown[] = [];
    const attempt = (cleanup: () => void): void => {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    };
    attempt(() => this.#loop.stop());
    attempt(() => this.#abort.abort());
    this.#updates.clear();
    this.#afterRender.clear();
    this.#pipeline = null;
    attempt(() => this.#platform.dispose());
    attempt(() => this.resources.dispose());
    attempt(() => this.scene.clear());
    attempt(() => this.renderer.dispose());
    if (!this.#contextLost) attempt(() => this.renderer.forceContextLoss());
    attempt(() => this.renderer.domElement.remove());
    if (errors.length) throw new AggregateError(errors, "ThreeApp cleanup failed");
  }

  #assertActive(): void {
    if (this.#state === "disposed") throw new Error("ThreeApp has been disposed");
  }

  #syncLoop(): void {
    if (this.#state === "running" && this.#drawable && !this.#document.hidden) this.#loop.start();
    else this.#loop.stop();
  }

  #update(frame: FrameInfo): void {
    if (this.#inFrame) throw new Error("Cannot render reentrantly within a host frame");
    this.#inFrame = true;
    this.#elapsed = frame.elapsed;
    const revision = this.#revision;
    try {
      // Snapshot subscriptions so additions during an update start on the next frame.
      const subscriptions = Array.from(this.#updates);
      for (const callback of subscriptions) {
        if (this.#updates.has(callback)) callback(frame);
        if (!this.#currentFrame(revision)) return;
      }
      this.#draw(frame, () => this.#currentFrame(revision));
    } catch (error) {
      this.stop();
      throw error;
    } finally {
      this.#inFrame = false;
    }
  }

  #draw(frame: FrameInfo, valid: () => boolean): void {
    // Failed native-buffer and pipeline sizing must complete before another draw.
    if (this.#bufferDirty || this.#pipeline?.sizeDirty) {
      this.resize();
      if (!valid()) return;
    }
    if (this.#pipeline) {
      const lease = this.#pipeline;
      // oxlint-disable-next-line typescript/unbound-method -- Preserve the receiver via call after lease checks.
      const render = lease.value.render;
      if (!valid() || this.#pipeline !== lease) return;
      render.call(lease.value, frame);
    } else this.renderer.render(this.scene, this.camera);
    if (!valid()) return;
    const afterRender = Array.from(this.#afterRender);
    for (const callback of afterRender) {
      if (this.#afterRender.has(callback)) callback(frame);
      if (!valid()) return;
    }
  }

  #currentFrame(revision: number): boolean {
    return (
      this.#state === "running" &&
      revision === this.#revision &&
      this.#drawable &&
      !this.#document.hidden
    );
  }

  #handleResize = (): void => {
    this.resize();
  };
  #handleContextLost = (): void => {
    if (this.#state === "disposed") return;
    this.#contextLost = true;
    // Clean native listeners/caches while the context is lost, before a later native restore.
    this.dispose();
  };
  #handleVisibility = (): void => {
    this.#syncLoop();
  };
  #handleDpr = (): void => {
    this.#watchDpr();
    this.resize();
  };

  #watchDpr(): void {
    this.#media?.removeEventListener("change", this.#handleDpr);
    this.#media = this.#view.matchMedia(`(resolution: ${this.#view.devicePixelRatio}dppx)`);
    this.#media.addEventListener("change", this.#handleDpr);
  }
}

/** Common host contract accepted by camera-independent optional modules. */
export type AnyThreeApp = SceneHost<Camera>;

/** Perspective host. Construction is idle; the camera remains precisely typed. */
export class ThreeApp extends SceneHost<PerspectiveCamera> {
  constructor(container: HTMLElement, options: ThreeAppOptions = {}) {
    super(
      container,
      options,
      () => {
        const { fov = 50, near = 0.1, far = 1000, position = [3, 2, 5] } = options.camera ?? {};
        positive(fov, "camera.fov");
        positive(near, "camera.near");
        positive(far, "camera.far");
        if (fov >= 180 || far <= near || position.length !== 3 || !position.every(Number.isFinite))
          throw new RangeError("Invalid camera frustum or position");
        const camera = new PerspectiveCamera(fov, 1, near, far);
        camera.position.set(...position);
        camera.lookAt(0, 0, 0);
        return camera;
      },
      (camera, aspect) => {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      },
    );
  }
}

/** Orthographic host. Resize preserves vertical span, frustum center and native zoom. */
export class OrthographicThreeApp extends SceneHost<OrthographicCamera> {
  constructor(container: HTMLElement, options: OrthographicThreeAppOptions = {}) {
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
