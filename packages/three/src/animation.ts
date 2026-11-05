import { AnimationMixer, LoopOnce, LoopRepeat } from "three";
import type { AnimationAction, AnimationClip, Object3D } from "three";
import type { GLTFModel } from "./loaders.ts";
import type { ThreeApp } from "./three-app.ts";

export type AnimationState = "idle" | "playing" | "paused" | "finished" | "disposed";

export interface PlayAnimationOptions {
  /** Default repeat. */
  loop?: "repeat" | "once";
  /** Hold the last pose for a completed one-shot. Default true. */
  clampWhenFinished?: boolean;
  /** Positive finite playback rate. Default 1. */
  timeScale?: number;
}

export interface GLTFAnimationsHandle {
  readonly mixer: AnimationMixer;
  /** Snapshot of clip references; clips remain borrowed and must not be mutated while playing. */
  readonly clips: readonly AnimationClip[];
  readonly action: AnimationAction | null;
  readonly state: AnimationState;
  readonly disposed: boolean;
  /** Select by array index or unique exact name. Always restarts the clip; switching is immediate. */
  play(clip: number | string, options?: PlayAnimationOptions): void;
  pause(): void;
  resume(): void;
  /** Restore properties bound by the mixer and clear the selection. Safe after dispose. */
  stop(): void;
  dispose(): void;
}

const roots = new WeakSet<Object3D>();

/** One owned mixer for a GLTF model, driven exclusively by the host's update phase. */
export function attachGLTFAnimations(app: ThreeApp, model: GLTFModel): GLTFAnimationsHandle {
  const assertOwners = (): void => {
    if (app.state === "disposed" || app.resources.disposed)
      throw new Error("ThreeApp has been disposed");
    if (model.disposed || model.resources.disposed) throw new Error("GLTF model has been disposed");
  };
  assertOwners();
  const root = model.scene;
  if (roots.has(root)) throw new Error("An animation handle already owns this root");
  const clips = Object.freeze([...model.gltf.animations]);
  const mixer = new AnimationMixer(root);
  let state: AnimationState = "idle";
  let action: AnimationAction | null = null;
  let disposed = false;
  let updating = false;
  let released = false;
  let unsubscribe = (): void => {};
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
    if (errors.length) throw new AggregateError(errors, "GLTF animation cleanup failed");
  };
  const sample = (delta: number): void => {
    updating = true;
    const errors: unknown[] = [];
    try {
      mixer.update(delta);
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
      if (errors.length === 1) throw errors[0];
      throw new AggregateError(errors, "GLTF animation update and cleanup failed");
    }
  };
  const execute = (command: () => void): void => {
    active();
    if (updating) pending.push(command);
    else command();
  };
  const finished = (event: { action: AnimationAction }): void => {
    if (!disposed && event.action === action) state = "finished";
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
    play(selector, options = {}): void {
      active();
      const matches =
        typeof selector === "string" ? clips.filter((clip) => clip.name === selector) : [];
      const clip =
        typeof selector === "number" && Number.isInteger(selector)
          ? clips[selector]
          : matches.length === 1
            ? matches[0]
            : undefined;
      if (!clip) throw new RangeError("Select an existing clip index or a unique exact name");
      const { loop = "repeat", clampWhenFinished = true, timeScale = 1 } = options;
      if ((loop !== "repeat" && loop !== "once") || !Number.isFinite(timeScale) || timeScale <= 0)
        throw new RangeError(
          "Animation loop must be repeat/once and timeScale must be positive and finite",
        );
      if (!Number.isFinite(clip.duration) || clip.duration <= 0 || !clip.validate())
        throw new RangeError(
          "Animation clip must have a positive finite duration and valid tracks",
        );
      execute(() => {
        mixer.stopAllAction();
        action = mixer.clipAction(clip);
        action
          .reset()
          .setEffectiveWeight(1)
          .setEffectiveTimeScale(timeScale)
          .setLoop(loop === "once" ? LoopOnce : LoopRepeat, loop === "once" ? 1 : Infinity);
        action.clampWhenFinished = clampWhenFinished;
        state = "playing";
        action.play();
        sample(0);
      });
    },
    pause(): void {
      execute(() => {
        if (state === "playing") state = "paused";
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
        mixer.stopAllAction();
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
      pending.length = 0;
      unsubscribe();
      mixer.removeEventListener("finished", finished);
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
