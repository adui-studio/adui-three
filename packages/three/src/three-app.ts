import { PerspectiveCamera, Scene, WebGLRenderer } from "three";
import type { WebGLRendererParameters } from "three";
import { FrameLoop } from "./frame-loop.ts";
import type { FrameInfo } from "./frame-loop.ts";
import { ResourceScope } from "./resources.ts";

export type ThreeAppState = "ready" | "running" | "stopped" | "disposed";

export interface ThreeAppOptions {
  camera?: {
    fov?: number;
    near?: number;
    far?: number;
    position?: readonly [number, number, number];
  };
  renderer?: Omit<WebGLRendererParameters, "canvas" | "context">;
  /** Positive, finite DPR ceiling. Default 2. */
  maxPixelRatio?: number;
  /** Positive, finite per-frame delta ceiling in seconds. Default 0.1. */
  maxDelta?: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} must be positive and finite`);
  return value;
}

/** One browser container, one renderer, one owned frame loop. Construction does not start it. */
export class ThreeApp {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly resources = new ResourceScope();
  #container: HTMLElement;
  #view: Window & typeof globalThis;
  #document: Document;
  #loop: FrameLoop;
  #platform = new ResourceScope();
  #updates = new Set<(frame: FrameInfo) => void>();
  #abort = new AbortController();
  #state: ThreeAppState = "ready";
  #revision = 0;
  #size: ViewportSize = { width: 0, height: 0, pixelRatio: 1 };
  #drawable = false;
  #maxPixelRatio: number;
  #media: MediaQueryList | null = null;

  constructor(container: HTMLElement, options: ThreeAppOptions = {}) {
    const view = container?.ownerDocument?.defaultView;
    if (!view || container.nodeType !== 1)
      throw new TypeError("A browser HTMLElement container is required");
    if (typeof view.ResizeObserver !== "function") throw new Error("ResizeObserver is required");
    const maxDelta = positive(options.maxDelta ?? 0.1, "maxDelta");
    this.#maxPixelRatio = positive(options.maxPixelRatio ?? 2, "maxPixelRatio");
    const { fov = 50, near = 0.1, far = 1000, position = [3, 2, 5] } = options.camera ?? {};
    positive(fov, "camera.fov");
    positive(near, "camera.near");
    positive(far, "camera.far");
    if (fov >= 180 || far <= near || position.length !== 3 || !position.every(Number.isFinite)) {
      throw new RangeError("Invalid camera frustum or position");
    }
    this.#container = container;
    this.#document = container.ownerDocument;
    this.#view = view;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(fov, 1, near, far);
    this.camera.position.set(...position);
    this.camera.lookAt(0, 0, 0);
    const canvas = this.#document.createElement("canvas");
    canvas.style.cssText = "display:block;width:100%;height:100%";
    this.renderer = new WebGLRenderer({ antialias: true, ...options.renderer, canvas });
    this.#loop = new FrameLoop(
      {
        request: (callback) => view.requestAnimationFrame(callback),
        cancel: (id) => view.cancelAnimationFrame(id),
      },
      (frame) => this.#update(frame),
      maxDelta,
    );
    try {
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

  resize(): void {
    this.#assertActive();
    const width = this.#container.clientWidth;
    const height = this.#container.clientHeight;
    const pixelRatio = Math.min(this.#view.devicePixelRatio || 1, this.#maxPixelRatio);
    const previous = this.#size;
    this.#size = { width, height, pixelRatio };
    this.#drawable = width > 0 && height > 0;
    if (
      this.#drawable &&
      (width !== previous.width || height !== previous.height || pixelRatio !== previous.pixelRatio)
    ) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setDrawingBufferSize(width, height, pixelRatio);
    }
    this.#syncLoop();
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
    attempt(() => this.#platform.dispose());
    attempt(() => this.resources.dispose());
    attempt(() => this.scene.clear());
    attempt(() => this.renderer.dispose());
    attempt(() => this.renderer.forceContextLoss());
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
    const revision = this.#revision;
    try {
      // Snapshot subscriptions so additions during an update start on the next frame.
      const subscriptions = Array.from(this.#updates);
      for (const callback of subscriptions) {
        if (this.#updates.has(callback)) callback(frame);
        if (
          this.#state !== "running" ||
          revision !== this.#revision ||
          !this.#drawable ||
          this.#document.hidden
        )
          return;
      }
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  #handleResize = (): void => {
    this.resize();
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
