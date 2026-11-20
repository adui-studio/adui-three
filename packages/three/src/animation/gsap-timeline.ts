import type { SceneApp } from "../core/three-app.ts";
import type { ResourceScope } from "../core/resources.ts";

/** Structural GSAP interface: consumers install GSAP; the SDK never imports it. */
export interface GSAPTimelineLike {
  paused(): boolean;
  totalTime(): number;
  totalTime(seconds: number, suppressEvents?: boolean): unknown;
  totalDuration(): number;
  timeScale(): number;
  repeat?(): number;
  reversed?(): boolean;
  kill(): unknown;
  readonly parent?: { readonly parent?: unknown } | null;
  readonly scrollTrigger?: unknown;
}
export interface AttachGSAPTimelineOptions {
  /** Optional additional owner, e.g. a model's resources. */
  scope?: ResourceScope;
  /** Default true. The native timeline always remains paused. */
  autoPlay?: boolean;
  /** Nonnegative finite speed. Default snapshots the native timeline's timeScale(). */
  playbackRate?: number;
}
export interface GSAPTimelineHandle {
  readonly timeline: GSAPTimelineLike;
  readonly state: "playing" | "paused" | "finished" | "disposed";
  readonly disposed: boolean;
  readonly time: number;
  readonly duration: number;
  readonly playbackRate: number;
  pause(): void;
  resume(): void;
  /** Rewind and play. No synthetic GSAP events at time zero. */
  restart(): void;
  /** Sample and pause, suppressing GSAP callbacks. Does not render the host. */
  seek(seconds: number): void;
  setPlaybackRate(rate: number): void;
  /** Kill the transferred timeline; leaves its last sampled values in place. */
  dispose(): void;
}
const owners = new WeakSet<object>();
const nonnegative = (value: number): void => {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError("Value must be finite and nonnegative");
};

/** Transfer a paused, populated root timeline to the host clock. Do not mutate it while attached. */
export function attachGSAPTimeline(
  app: SceneApp,
  timeline: GSAPTimelineLike,
  options: AttachGSAPTimelineOptions = {},
): GSAPTimelineHandle {
  const { scope, autoPlay = true } = options;
  const assertOwners = (): void => {
    if (app.signal.aborted || app.resources.disposed || scope?.disposed)
      throw new Error("Timeline owner has been disposed");
  };
  assertOwners();
  if (!timeline || typeof timeline !== "object" || owners.has(timeline))
    throw new TypeError("A distinct GSAP timeline is required");
  if (
    !timeline.paused() ||
    timeline.parent?.parent ||
    timeline.scrollTrigger ||
    timeline.reversed?.()
  )
    throw new TypeError("Use a paused root GSAP timeline without ScrollTrigger");
  if (timeline.repeat?.() === -1) throw new RangeError("Use a finite GSAP timeline repeat count");
  const duration = timeline.totalDuration();
  let time = timeline.totalTime();
  let rate = options.playbackRate ?? timeline.timeScale();
  nonnegative(rate);
  nonnegative(time);
  if (!Number.isFinite(duration) || duration <= 0 || time > duration)
    throw new RangeError("Timeline must have a positive finite total duration and valid time");
  if (typeof autoPlay !== "boolean") throw new TypeError("autoPlay must be a boolean");
  assertOwners();
  let state: GSAPTimelineHandle["state"] = autoPlay ? "playing" : "paused";
  let sampling = false,
    killed = false;
  let removeUpdate = (): void => {};
  const commands: Array<() => void> = [];
  const kill = (): void => {
    if (killed) return;
    killed = true;
    try {
      timeline.kill();
    } finally {
      owners.delete(timeline);
    }
  };
  const live = (): boolean => state !== "disposed";
  const command = (operation: () => void): void => {
    if (!live()) return;
    if (sampling) commands.push(operation);
    else operation();
  };
  const sample = (seconds: number, suppressEvents: boolean): void => {
    time = seconds;
    sampling = true;
    try {
      timeline.totalTime(seconds, suppressEvents);
    } finally {
      sampling = false;
      if (!live()) kill();
      else {
        // Native callbacks can request controls, but never recursively sample GSAP.
        const pending = commands.splice(0);
        for (const operation of pending) {
          if (live()) operation();
        }
      }
    }
  };
  const handle: GSAPTimelineHandle = {
    timeline,
    get state() {
      return state;
    },
    get disposed() {
      return !live();
    },
    get time() {
      return time;
    },
    duration,
    get playbackRate() {
      return rate;
    },
    pause() {
      command(() => {
        state = "paused";
      });
    },
    resume() {
      command(() => {
        if (time < duration) state = "playing";
      });
    },
    restart() {
      command(() => {
        state = "playing";
        sample(0, true);
      });
    },
    seek(seconds) {
      nonnegative(seconds);
      if (seconds > duration) throw new RangeError("Timeline seek exceeds total duration");
      command(() => {
        state = "paused";
        sample(seconds, true);
      });
    },
    setPlaybackRate(value) {
      nonnegative(value);
      command(() => {
        rate = value;
      });
    },
    dispose() {
      if (!live()) return;
      state = "disposed";
      commands.length = 0;
      removeUpdate();
      app.resources.untrack(handle);
      scope?.untrack(handle);
      if (!sampling) kill();
    },
  };
  owners.add(timeline);
  try {
    removeUpdate = app.onUpdate(({ delta }) => {
      if (state !== "playing" || rate === 0) return;
      const target = Math.min(duration, time + delta * rate);
      // Set endpoint state before native callbacks, so queued restart/seek wins.
      if (target === duration) state = "finished";
      sample(target, false);
    });
    app.resources.track(handle);
    scope?.track(handle);
  } catch (error) {
    handle.dispose();
    throw error;
  }
  return handle;
}
