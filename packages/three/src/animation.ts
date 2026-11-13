import {
  AnimationMixer,
  LoopOnce,
  LoopPingPong,
  LoopRepeat,
  NormalAnimationBlendMode,
} from "three";
import type { AnimationAction, AnimationClip, Object3D } from "three";
import type { GLTFInstance, GLTFModel } from "./loaders.ts";
import type { AnyThreeApp } from "./three-app.ts";
import { resolveTransitionEasing } from "./easing.ts";
import type { TransitionEasing } from "./easing.ts";
export type { TransitionEasing } from "./easing.ts";

export { followPath } from "./path-animation.ts";
export type {
  FollowPathOptions,
  PathMotionHandle,
  PathMotionState,
  PathMotionResult,
} from "./path-animation.ts";

export type AnimationState = "idle" | "playing" | "paused" | "finished" | "disposed";

export interface PlayAnimationOptions {
  /** Default repeat. */
  loop?: "repeat" | "once" | "pingpong";
  /** Positive safe integer or Infinity. Default Infinity, except once which only accepts 1. */
  repetitions?: number;
  /** Hold the last pose for a completed one-shot. Default true. */
  clampWhenFinished?: boolean;
  /** Positive finite playback rate. Default 1. */
  timeScale?: number;
}

export interface CrossFadeOptions extends PlayAnimationOptions {
  /** Positive finite mixer seconds. Default 0.3. */
  duration?: number;
  /** Weight interpolation preset. Default linear. */
  easing?: TransitionEasing;
}

export interface GLTFAnimationEvents {
  loop: {
    readonly type: "loop";
    readonly action: AnimationAction;
    readonly clip: AnimationClip;
    readonly loopDelta: number;
  };
  finished: {
    readonly type: "finished";
    readonly action: AnimationAction;
    readonly clip: AnimationClip;
    readonly direction: number;
  };
}
export type GLTFAnimationEvent = GLTFAnimationEvents[keyof GLTFAnimationEvents];

export interface GLTFAnimationsHandle {
  readonly mixer: AnimationMixer;
  /** Snapshot of clip references; clips remain borrowed and must not be mutated while playing. */
  readonly clips: readonly AnimationClip[];
  readonly action: AnimationAction | null;
  readonly state: AnimationState;
  readonly disposed: boolean;
  readonly blending: boolean;
  /** Uneased mixer-time progress; 0 initially/cancelled, 1 after completion. */
  readonly blendProgress: number;
  /** Model-wide native mixer time scale. Starts at 1; 0 freezes sampling time without changing state. */
  readonly playbackRate: number;
  /** Nonnegative finite model-wide speed. Preserves pose, clip/loop progress and blend weights. */
  setPlaybackRate(rate: number): void;
  /** After sampling/endpoint normalization, before host drawing. No synthetic loop notices. */
  on<K extends keyof GLTFAnimationEvents>(
    type: K,
    callback: (event: GLTFAnimationEvents[K]) => void,
  ): () => void;
  /** Select by array index or unique exact name. Always restarts the clip; switching is immediate. */
  play(clip: number | string, options?: PlayAnimationOptions): void;
  /** Blend from current weights; an already active destination retains its clip time. */
  crossFadeTo(clip: number | string, options?: CrossFadeOptions): void;
  /** Sample selected clip time in [0, duration] seconds, then pause. Does not advance mixer time. */
  seek(seconds: number): void;
  pause(): void;
  resume(): void;
  /** Restore properties bound by the mixer and clear the selection. Safe after dispose. */
  stop(): void;
  dispose(): void;
}

const roots = new WeakSet<Object3D>();

/** One owned mixer for a GLTF model, driven exclusively by the host's update phase. */
export function attachGLTFAnimations(
  app: AnyThreeApp,
  model: GLTFModel | GLTFInstance,
): GLTFAnimationsHandle {
  const assertOwners = (): void => {
    if (app.state === "disposed" || app.resources.disposed)
      throw new Error("ThreeApp has been disposed");
    if (model.disposed || model.resources.disposed) throw new Error("GLTF model has been disposed");
  };
  assertOwners();
  const root = model.scene;
  if (roots.has(root)) throw new Error("An animation handle already owns this root");
  const clips = Object.freeze([
    ...("animations" in model ? model.animations : model.gltf.animations),
  ]);
  const mixer = new AnimationMixer(root);
  let state: AnimationState = "idle";
  let action: AnimationAction | null = null;
  let disposed = false;
  let updating = false;
  let released = false;
  let unsubscribe = (): void => {};
  const actions = new Set<AnimationAction>();
  const terminal = new Set<AnimationAction>();
  let blend: {
    duration: number;
    elapsed: number;
    weights: Map<AnimationAction, number>;
    easing: (progress: number) => number;
  } | null = null;
  let blendProgress = 0;
  let targetFinished = false;
  let completion: GLTFAnimationEvents["finished"] | null = null;
  const notifications: GLTFAnimationEvent[] = [];
  const listeners = {
    loop: new Set<(event: GLTFAnimationEvent) => void>(),
    finished: new Set<(event: GLTFAnimationEvent) => void>(),
  };
  const pending: Array<() => void> = [];
  const active = (): void => {
    if (disposed) throw new Error("GLTF animations have been disposed");
    assertOwners();
  };
  const release = (): void => {
    if (released) return;
    released = true;
    const errors: unknown[] = [];
    try {
      mixer.stopAllAction();
    } catch (error) {
      errors.push(error);
    }
    try {
      mixer.uncacheRoot(root);
    } catch (error) {
      errors.push(error);
    }
    roots.delete(root);
    actions.clear();
    terminal.clear();
    blend = null;
    if (errors.length) throw new AggregateError(errors, "GLTF animation cleanup failed");
  };
  const sample = (delta: number): void => {
    updating = true;
    const errors: unknown[] = [];
    try {
      if (blend) {
        const elapsed = delta * mixer.timeScale;
        if (!Number.isFinite(elapsed) || elapsed < 0)
          throw new RangeError("Crossfade requires a finite nonnegative mixer timeScale");
        blend.elapsed = Math.min(blend.duration, blend.elapsed + elapsed);
        blendProgress = blend.elapsed / blend.duration;
        const factor = blend.easing(blendProgress);
        for (const [entry, weight] of blend.weights)
          entry.setEffectiveWeight(weight * (1 - factor) + (entry === action ? factor : 0));
      }
      mixer.update(delta);
      // r187's final ping-pong sample can use the opposite parity, especially when delta skips loops.
      // Wait until native iteration ends, then fix the clamped endpoint through public action APIs.
      if (!disposed && terminal.size) {
        for (const entry of terminal) {
          const endpoint = entry.repetitions % 2 === 1 ? entry.getClip().duration : 0;
          entry.reset();
          entry.time = endpoint;
          entry.paused = true;
        }
        terminal.clear();
        mixer.update(0);
      }
      // Never deactivate native actions while AnimationMixer is iterating its active array.
      if (!disposed && blend && blendProgress === 1) {
        blend = null;
        stopOthers(action!);
        if (!disposed && targetFinished) state = "finished";
      }
      if (!disposed) {
        if (state === "finished" && completion) {
          notifications.push(completion);
          completion = null;
        }
        if (notifications.length)
          for (const event of notifications.splice(0)) {
            const subscriptions = Array.from(listeners[event.type]);
            for (const callback of subscriptions) {
              if (
                disposed ||
                app.state === "disposed" ||
                app.resources.disposed ||
                model.disposed ||
                model.resources.disposed
              )
                break;
              if (listeners[event.type].has(callback)) callback(event);
            }
            if (disposed) break;
          }
      }
    } catch (error) {
      errors.push(error);
    }
    updating = false;
    try {
      if (disposed) release();
      else if (!errors.length) {
        const commands = pending.splice(0);
        for (const command of commands) {
          if (disposed) break;
          command();
        }
      }
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) {
      pending.length = 0;
      notifications.length = 0;
      if (errors.length === 1) throw errors[0];
      throw new AggregateError(errors, "GLTF animation update and cleanup failed");
    }
  };
  const execute = (command: () => void): void => {
    active();
    if (updating) pending.push(command);
    else command();
  };
  const finished = (event: { action: AnimationAction; direction?: number }): void => {
    if (
      !disposed &&
      actions.has(event.action) &&
      event.action.loop === LoopPingPong &&
      event.action.clampWhenFinished &&
      Number.isSafeInteger(event.action.repetitions)
    )
      terminal.add(event.action);
    if (!disposed && event.action === action) {
      targetFinished = true;
      completion = {
        type: "finished",
        action: event.action,
        clip: event.action.getClip(),
        direction: event.direction ?? 1,
      };
      if (!blend) state = "finished";
    }
  };
  const looped = (event: { action: AnimationAction; loopDelta: number }): void => {
    if (!disposed && updating && event.action === action)
      notifications.push({
        type: "loop",
        action: event.action,
        clip: event.action.getClip(),
        loopDelta: event.loopDelta,
      });
  };
  const stopOthers = (keep: AnimationAction): void => {
    const errors: unknown[] = [];
    for (const entry of Array.from(actions)) {
      if (disposed) break;
      if (entry === keep) continue;
      actions.delete(entry);
      try {
        entry.stop();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Outgoing animation cleanup failed");
  };
  const selection = (
    selector: number | string,
    options: PlayAnimationOptions,
  ): {
    clip: AnimationClip;
    settings: Required<PlayAnimationOptions>;
  } => {
    const matches =
      typeof selector === "string" ? clips.filter((clip) => clip.name === selector) : [];
    const clip =
      typeof selector === "number" && Number.isInteger(selector)
        ? clips[selector]
        : matches.length === 1
          ? matches[0]
          : undefined;
    if (!clip) throw new RangeError("Select an existing clip index or a unique exact name");
    const {
      loop = "repeat",
      clampWhenFinished = true,
      timeScale = 1,
      repetitions = loop === "once" ? 1 : Infinity,
    } = options;
    if (
      (loop !== "repeat" && loop !== "once" && loop !== "pingpong") ||
      !Number.isFinite(timeScale) ||
      timeScale <= 0
    )
      throw new RangeError(
        "Animation loop must be repeat/once/pingpong and timeScale must be positive and finite",
      );
    if (
      !(repetitions === Infinity || (Number.isSafeInteger(repetitions) && repetitions > 0)) ||
      (loop === "once" && repetitions !== 1)
    )
      throw new RangeError(
        "Repetitions must be a positive safe integer or Infinity; once requires 1",
      );
    if (typeof clampWhenFinished !== "boolean")
      throw new TypeError("clampWhenFinished must be boolean");
    if (!Number.isFinite(clip.duration) || clip.duration <= 0 || !clip.validate())
      throw new RangeError("Animation clip must have a positive finite duration and valid tracks");
    return { clip, settings: { loop, repetitions, clampWhenFinished, timeScale } };
  };
  const configure = (entry: AnimationAction, settings: Required<PlayAnimationOptions>): void => {
    entry.paused = false;
    entry.enabled = true;
    entry
      .setEffectiveTimeScale(settings.timeScale)
      .setLoop(
        settings.loop === "once"
          ? LoopOnce
          : settings.loop === "pingpong"
            ? LoopPingPong
            : LoopRepeat,
        settings.repetitions,
      );
    entry.clampWhenFinished = settings.clampWhenFinished;
  };
  const handle: GLTFAnimationsHandle = {
    mixer,
    clips,
    get action(): AnimationAction | null {
      return action;
    },
    get state(): AnimationState {
      return state;
    },
    get disposed(): boolean {
      return disposed;
    },
    get blending(): boolean {
      return blend !== null;
    },
    get blendProgress(): number {
      return blendProgress;
    },
    get playbackRate(): number {
      return mixer.timeScale;
    },
    setPlaybackRate(rate): void {
      active();
      if (!Number.isFinite(rate) || rate < 0)
        throw new RangeError("Playback rate must be nonnegative and finite");
      execute(() => {
        mixer.timeScale = rate;
      });
    },
    on(type, callback): () => void {
      active();
      if ((type !== "loop" && type !== "finished") || typeof callback !== "function")
        throw new TypeError("A loop/finished event and callback are required");
      const subscription = (event: GLTFAnimationEvent): void =>
        callback(event as GLTFAnimationEvents[typeof type]);
      listeners[type].add(subscription);
      return () => {
        listeners[type].delete(subscription);
      };
    },
    play(selector, options = {}): void {
      active();
      const { clip, settings } = selection(selector, options);
      execute(() => {
        blend = null;
        blendProgress = 0;
        targetFinished = false;
        completion = null;
        notifications.length = 0;
        terminal.clear();
        mixer.stopAllAction();
        actions.clear();
        action = mixer.clipAction(clip);
        action.reset().setEffectiveWeight(1);
        configure(action, settings);
        state = "playing";
        action.play();
        actions.add(action);
        sample(0);
      });
    },
    crossFadeTo(selector, options = {}): void {
      active();
      const { clip, settings } = selection(selector, options);
      const duration = options.duration ?? 0.3;
      if (!Number.isFinite(duration) || duration <= 0)
        throw new RangeError("Crossfade duration must be positive and finite");
      const easing = resolveTransitionEasing(options.easing, "linear");
      if (clip.blendMode !== NormalAnimationBlendMode)
        throw new RangeError("Crossfade only supports normal animation blend mode");
      execute(() => {
        if (!Number.isFinite(mixer.timeScale) || mixer.timeScale < 0)
          throw new RangeError("Crossfade requires a finite nonnegative mixer timeScale");
        if (action?.getClip() === clip) return;
        const weights = new Map<AnimationAction, number>();
        for (const entry of actions) {
          const weight = entry.getEffectiveWeight();
          if (
            entry.getClip().blendMode !== NormalAnimationBlendMode ||
            !Number.isFinite(weight) ||
            weight < 0 ||
            weight > 1
          )
            throw new RangeError("Crossfade requires normal actions with weights in [0, 1]");
          weights.set(entry, weight);
        }
        const next = mixer.clipAction(clip);
        const reused = actions.has(next);
        if (!reused) next.reset();
        configure(next, settings);
        next.setEffectiveWeight(weights.get(next) ?? (actions.size ? 0 : 1)).play();
        actions.add(next);
        weights.set(next, next.getEffectiveWeight());
        action = next;
        targetFinished = false;
        completion = null;
        notifications.length = 0;
        terminal.clear();
        blendProgress = 0;
        blend = weights.size > 1 ? { duration, elapsed: 0, weights, easing } : null;
        state = "playing";
        sample(0);
      });
    },
    pause(): void {
      execute(() => {
        if (state === "playing") state = "paused";
      });
    },
    seek(seconds): void {
      active();
      const selected = (): AnimationAction => {
        if (!action) throw new Error("Select an animation before seeking");
        if (!Number.isFinite(seconds) || seconds < 0 || seconds > action.getClip().duration)
          throw new RangeError("Seek time must be finite and within the selected clip duration");
        return action;
      };
      selected(); // Validate before queueing; recheck if an earlier queued command changes selection.
      execute(() => {
        const target = selected();
        const weight = blend ? 1 : target.weight;
        blend = null;
        blendProgress = 0;
        targetFinished = false;
        completion = null;
        notifications.length = 0;
        terminal.clear();
        stopOthers(target);
        target.reset().setEffectiveWeight(weight);
        target.time = seconds;
        state = "paused";
        sample(0);
      });
    },
    resume(): void {
      execute(() => {
        if (state === "paused") state = "playing";
      });
    },
    stop(): void {
      if (disposed) return;
      execute(() => {
        blend = null;
        blendProgress = 0;
        targetFinished = false;
        completion = null;
        notifications.length = 0;
        terminal.clear();
        mixer.stopAllAction();
        actions.clear();
        mixer.time = 0;
        action = null;
        state = "idle";
      });
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      state = "disposed";
      action = null;
      blend = null;
      blendProgress = 0;
      pending.length = 0;
      terminal.clear();
      completion = null;
      notifications.length = 0;
      listeners.loop.clear();
      listeners.finished.clear();
      unsubscribe();
      mixer.removeEventListener("finished", finished);
      mixer.removeEventListener("loop", looped);
      app.resources.untrack(handle);
      model.resources.untrack(handle);
      // Native finished/loop handlers run inside mixer.update; finish that stack before touching caches.
      if (!updating) release();
    },
  };
  try {
    roots.add(root);
    assertOwners();
    app.resources.track(handle);
    model.resources.track(handle);
    mixer.addEventListener("finished", finished);
    mixer.addEventListener("loop", looped);
    unsubscribe = app.onUpdate(({ delta }) => {
      if (model.disposed || model.resources.disposed) handle.dispose();
      else if (state === "playing") sample(delta);
    });
    return handle;
  } catch (error) {
    try {
      handle.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "GLTF animations initialization and rollback failed",
      );
    }
    throw error;
  }
}
