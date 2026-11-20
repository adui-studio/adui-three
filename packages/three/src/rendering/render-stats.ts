import type { SceneApp, ThreeAppState, ViewportSize } from "../core/three-app.ts";
import type { ResourceScope } from "../core/resources.ts";

export interface RenderStats {
  readonly rendererType: "webgl" | "webgpu";
  readonly backend: "webgl2" | "webgpu";
  readonly state: ThreeAppState;
  readonly viewport: Readonly<ViewportSize>;
  /** Native counters retain their renderer's reset window; not a sum of all host passes. */
  readonly autoReset: boolean;
  readonly drawCalls: number | null;
  readonly triangles: number | null;
  readonly lines: number | null;
  readonly points: number | null;
  readonly geometries: number | null;
  readonly textures: number | null;
  readonly programs: number | null;
  /** Native tracked-resource estimate where available, not device VRAM usage. */
  readonly estimatedBytes: number | null;
}
const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

/** Copy native statistics without rendering, resetting counters or changing autoReset. */
export function captureRenderStats(app: SceneApp): RenderStats {
  if (app.signal.aborted || app.resources.disposed)
    throw new Error("Render statistics owner has been disposed");
  const info = app.renderer.info;
  const memory = info.memory;
  const programs =
    "programs" in memory ? memory.programs : "programs" in info ? info.programs?.length : undefined;
  return Object.freeze({
    rendererType: app.rendererType,
    backend: app.backend,
    state: app.state,
    viewport: Object.freeze({ ...app.size }),
    autoReset: info.autoReset,
    drawCalls: count("drawCalls" in info.render ? info.render.drawCalls : info.render.calls),
    triangles: count(info.render.triangles),
    lines: count(info.render.lines),
    points: count(info.render.points),
    geometries: count(memory.geometries),
    textures: count(memory.textures),
    programs: count(programs),
    estimatedBytes: count("total" in memory ? memory.total : undefined),
  });
}

export interface RenderMonitorSample {
  /** Successful host draws since attachment, including renderOnce. */
  readonly draws: number;
  /** Milliseconds relative to the canvas window's performance time origin. */
  readonly capturedAt: number;
  /** Observed running-host drawing frequency. Null until a valid observation window. */
  readonly fps: number | null;
  /** Mean wall-clock interval between running host draws, not CPU/GPU execution time. */
  readonly frameIntervalMs: number | null;
  readonly stats: RenderStats;
}
export interface RenderMonitorOptions {
  /** Callback interval in seconds, default 0.5; zero publishes every successful draw. */
  sampleInterval?: number;
  onSample?: (sample: RenderMonitorSample) => void;
  scope?: ResourceScope;
}
export interface RenderMonitorHandle {
  readonly disposed: boolean;
  /** Last immutable sample, retained after disposal. No native Three.js references. */
  readonly snapshot: RenderMonitorSample;
  /** Capture current native values without drawing or invoking onSample. */
  read(this: void): RenderMonitorSample;
  dispose(this: void): void;
}

/** Observe the host's existing completion phase. No additional RAF, timer or renderer wrapper. */
export function attachRenderMonitor(
  app: SceneApp,
  options: RenderMonitorOptions = {},
): RenderMonitorHandle {
  const { sampleInterval = 0.5, onSample, scope } = options;
  if (!Number.isFinite(sampleInterval) || sampleInterval < 0)
    throw new RangeError("sampleInterval must be finite and nonnegative");
  if (onSample !== undefined && typeof onSample !== "function")
    throw new TypeError("onSample must be a function");
  if (scope?.disposed) throw new Error("Render monitor scope has been disposed");
  const initial = captureRenderStats(app);
  const view = app.renderer.domElement.ownerDocument.defaultView;
  if (!view) throw new Error("Render monitor requires the host's browser window");
  const now = (): number => view.performance.now();
  let disposed = false;
  let draws = 0,
    previous: number | undefined,
    intervals = 0,
    elapsed = 0;
  let fps: number | null = null,
    frameIntervalMs: number | null = null;
  let published = -Infinity;
  let snapshot: RenderMonitorSample = Object.freeze({
    draws,
    capturedAt: now(),
    fps,
    frameIntervalMs,
    stats: initial,
  });
  let unsubscribe = (): void => {};
  const resetWindow = (): void => {
    previous = undefined;
    intervals = 0;
    elapsed = 0;
    fps = null;
    frameIntervalMs = null;
  };
  const read = (): RenderMonitorSample => {
    if (disposed) throw new Error("Render monitor has been disposed");
    const size = app.size;
    if (
      app.state !== "running" ||
      size.width <= 0 ||
      size.height <= 0 ||
      app.renderer.domElement.ownerDocument.hidden
    )
      resetWindow();
    snapshot = Object.freeze({
      draws,
      capturedAt: now(),
      fps,
      frameIntervalMs,
      stats: captureRenderStats(app),
    });
    return snapshot;
  };
  const handle: RenderMonitorHandle = {
    get disposed() {
      return disposed;
    },
    get snapshot() {
      return snapshot;
    },
    read,
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      app.resources.untrack(handle);
      scope?.untrack(handle);
    },
  };
  try {
    unsubscribe = app.onAfterRender((frame) => {
      if (disposed) return;
      const time = now();
      draws++;
      if (app.state === "running" && frame.delta > 0) {
        if (previous !== undefined && time >= previous) {
          intervals++;
          elapsed += time - previous;
        }
        previous = time;
      } else resetWindow();
      const publish = time - published >= sampleInterval * 1000 || app.state !== "running";
      if (publish && intervals > 0 && elapsed > 0) {
        frameIntervalMs = elapsed / intervals;
        fps = 1000 / frameIntervalMs;
        intervals = 0;
        elapsed = 0;
      }
      read();
      if (publish) {
        published = time;
        onSample?.(snapshot);
      }
    });
    app.resources.track(handle);
    scope?.track(handle);
  } catch (error) {
    handle.dispose();
    throw error;
  }
  return handle;
}
