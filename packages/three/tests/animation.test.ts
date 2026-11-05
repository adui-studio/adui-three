import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  AnimationClip,
  AdditiveAnimationBlendMode,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NumberKeyframeTrack,
  Scene,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { FrameInfo, ThreeApp, ThreeAppState } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";
import { loadGLTF } from "../src/loaders.ts";
import { attachGLTFAnimations } from "../src/animation.ts";

const owners: ResourceScope[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) {
    try {
      owner.dispose();
    } catch {
      /* Failure cases assert cleanup errors directly. */
    }
  }
  vi.restoreAllMocks();
});

async function fixture(
  clips = [
    new AnimationClip("Lift", 1, [new NumberKeyframeTrack(".position[y]", [0, 1], [0, 2])]),
    new AnimationClip("Slide", 1, [new NumberKeyframeTrack(".position[x]", [0, 1], [0, 4])]),
  ],
) {
  const callbacks = new Set<(frame: FrameInfo) => void>();
  const controller = new AbortController();
  const state = {
    scene: new Scene(),
    resources: new ResourceScope(),
    signal: controller.signal,
    state: "ready" as ThreeAppState,
    onUpdate(callback: (frame: FrameInfo) => void): () => void {
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
      };
    },
  };
  owners.push(state.resources);
  const app = state as unknown as ThreeApp;
  const scene = new Group();
  const geometry = new BoxGeometry();
  scene.add(new Mesh(geometry, new MeshBasicMaterial()));
  const gltf: GLTF = {
    scene,
    scenes: [scene],
    animations: clips,
    cameras: [],
    asset: { version: "2.0" },
    userData: {},
    parser: {} as GLTF["parser"],
  };
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(gltf);
  const model = await loadGLTF(app, "fixture.glb");
  const animation = attachGLTFAnimations(app, model);
  const tick = (delta: number): void => {
    if (state.state !== "running") return;
    for (const callback of Array.from(callbacks))
      if (callbacks.has(callback)) callback({ delta, elapsed: delta });
  };
  return { app, state, model, scene, gltf, geometry, animation, callbacks, tick };
}

test("attachment is idle, snapshots clip references and does not start the host", async () => {
  const env = await fixture();
  env.gltf.animations.push(new AnimationClip("Later", 1));
  expect(env.animation.clips).toHaveLength(2);
  expect(Object.isFrozen(env.animation.clips)).toBe(true);
  expect(env.animation.clips[0]).toBe(env.gltf.animations[0]);
  expect(env.animation.state).toBe("idle");
  expect(env.animation.action).toBeNull();
  expect(env.state.state).toBe("ready");
  expect(env.callbacks.size).toBe(1);
});

function blendClips() {
  return [0, 10, 20].map(
    (value, index) =>
      new AnimationClip("Pose" + index, 2, [
        new NumberKeyframeTrack(".position[x]", [0, 2], [value, value]),
      ]),
  );
}

test("crossfade samples linear native weights and stops outgoing actions only after the final sample", async () => {
  const env = await fixture(blendClips());
  env.state.state = "running";
  env.animation.play(0);
  const outgoing = env.animation.action!;
  env.animation.crossFadeTo(1, { duration: 1 });
  expect(env.scene.position.x).toBe(0);
  expect(env.animation.blending).toBe(true);
  env.tick(0.25);
  expect(env.scene.position.x).toBeCloseTo(2.5);
  expect(outgoing.getEffectiveWeight()).toBeCloseTo(0.75);
  expect(env.animation.action!.getEffectiveWeight()).toBeCloseTo(0.25);
  expect(env.animation.blendProgress).toBe(0.25);
  env.tick(0.75);
  expect(env.scene.position.x).toBeCloseTo(10);
  expect(outgoing.isScheduled()).toBe(false);
  expect(env.animation.blending).toBe(false);
  expect(env.animation.blendProgress).toBe(1);
  expect(env.animation.mixer.stats.actions.inUse).toBe(1);
});

test("interrupting a fade starts from its current composite pose rather than resetting outgoing weights", async () => {
  const env = await fixture(blendClips());
  env.state.state = "running";
  env.animation.play(0);
  env.animation.crossFadeTo(1, { duration: 1 });
  env.tick(0.5);
  expect(env.scene.position.x).toBeCloseTo(5);
  env.animation.crossFadeTo(2, { duration: 1 });
  expect(env.scene.position.x).toBeCloseTo(5);
  env.tick(0.5);
  expect(env.scene.position.x).toBeCloseTo(12.5);
  env.tick(0.5);
  expect(env.scene.position.x).toBeCloseTo(20);
  expect(env.animation.mixer.stats.actions.inUse).toBe(1);
});

test("fading back to an active outgoing clip retains its phase and repeated selection is a no-op", async () => {
  const env = await fixture(blendClips());
  env.state.state = "running";
  env.animation.play(0);
  const original = env.animation.action!;
  env.animation.crossFadeTo(1, { duration: 1 });
  env.tick(0.4);
  const time = original.time;
  const pose = env.scene.position.x;
  env.animation.crossFadeTo(0, { duration: 1 });
  expect(env.animation.action).toBe(original);
  expect(original.time).toBe(time);
  expect(env.scene.position.x).toBeCloseTo(pose);
  env.tick(0.2);
  const progress = env.animation.blendProgress;
  env.animation.crossFadeTo(0, { duration: 0.1 });
  expect(env.animation.blendProgress).toBe(progress);
  expect(original.time).toBeCloseTo(time + 0.2);
});

test("crossfade from idle starts normally and host/controller pause freezes the transition", async () => {
  const env = await fixture(blendClips());
  env.animation.crossFadeTo(0);
  expect(env.animation.blending).toBe(false);
  expect(env.animation.state).toBe("playing");
  env.animation.crossFadeTo(1, { duration: 1 });
  env.tick(0.5);
  expect(env.animation.blendProgress).toBe(0);
  expect(env.state.state).toBe("ready");
  env.state.state = "running";
  env.tick(0.25);
  env.animation.pause();
  env.tick(1);
  expect(env.animation.blendProgress).toBe(0.25);
  expect(env.scene.position.x).toBeCloseTo(2.5);
  env.animation.resume();
  env.tick(0.75);
  expect(env.scene.position.x).toBeCloseTo(10);
  expect(env.animation.blending).toBe(false);
});

test("mixer timeScale controls fade duration while action timeScale controls clip speed", async () => {
  const env = await fixture(blendClips());
  env.state.state = "running";
  env.animation.play(0);
  env.animation.crossFadeTo(1, { duration: 1, timeScale: 2 });
  env.animation.mixer.timeScale = 0;
  env.tick(0.5);
  expect(env.animation.blendProgress).toBe(0);
  env.animation.mixer.timeScale = 2;
  env.tick(0.25);
  expect(env.animation.blendProgress).toBeCloseTo(0.5);
  expect(env.animation.action!.time).toBeCloseTo(1);
  expect(env.scene.position.x).toBeCloseTo(5);
});

test("invalid fade inputs, additive modes and invalid mixer scaling preserve the current selection", async () => {
  const clips = blendClips();
  clips[2]!.blendMode = AdditiveAnimationBlendMode;
  const env = await fixture(clips);
  env.animation.play(0);
  const original = env.animation.action;
  for (const duration of [0, -1, Infinity, NaN])
    expect(() => env.animation.crossFadeTo(1, { duration })).toThrow("duration");
  expect(() => env.animation.crossFadeTo(99)).toThrow(RangeError);
  expect(() => env.animation.crossFadeTo(2)).toThrow("normal");
  env.animation.mixer.timeScale = -1;
  expect(() => env.animation.crossFadeTo(1)).toThrow("timeScale");
  expect(env.animation.action).toBe(original);
  expect(env.animation.blending).toBe(false);
  expect(env.animation.mixer.stats.actions.inUse).toBe(1);
});

test("one-shot completion during a fade settles after the fade and respects clamp behavior", async () => {
  for (const clampWhenFinished of [true, false]) {
    const clips = blendClips();
    clips[1]!.duration = 0.1;
    const env = await fixture(clips);
    env.state.state = "running";
    env.animation.play(0);
    env.animation.crossFadeTo(1, { duration: 1, loop: "once", clampWhenFinished });
    env.tick(0.25);
    expect(env.animation.state).toBe("playing");
    expect(env.animation.blending).toBe(true);
    env.tick(0.75);
    expect(env.animation.state).toBe("finished");
    expect(env.scene.position.x).toBeCloseTo(clampWhenFinished ? 10 : 0);
    expect(env.animation.mixer.stats.actions.inUse).toBe(1);
  }
});

test("seek cancels outgoing contributions while preserving weight when no fade is active", async () => {
  const env = await fixture(blendClips());
  env.state.state = "running";
  env.animation.play(0);
  env.animation.crossFadeTo(1, { duration: 1 });
  env.tick(0.25);
  env.animation.seek(0.5);
  expect(env.animation.blending).toBe(false);
  expect(env.animation.blendProgress).toBe(0);
  expect(env.scene.position.x).toBeCloseTo(10);
  expect(env.animation.state).toBe("paused");
  expect(env.animation.mixer.stats.actions.inUse).toBe(1);
  env.animation.action!.setEffectiveWeight(0.4);
  env.animation.seek(0.5);
  expect(env.animation.action!.weight).toBeCloseTo(0.4);
  expect(env.scene.position.x).toBeCloseTo(4);
});

test("immediate play and stop cancel all outgoing actions and restore the original bindings", async () => {
  const env = await fixture(blendClips());
  env.state.state = "running";
  env.animation.play(0);
  env.animation.crossFadeTo(1, { duration: 1 });
  env.tick(0.25);
  env.animation.play(2);
  expect(env.scene.position.x).toBe(20);
  expect(env.animation.blending).toBe(false);
  expect(env.animation.mixer.stats.actions.inUse).toBe(1);
  env.animation.crossFadeTo(1, { duration: 1 });
  env.animation.stop();
  expect(env.scene.position.x).toBe(0);
  expect(env.animation.mixer.stats.actions.inUse).toBe(0);
  expect(env.animation.blendProgress).toBe(0);
  expect(env.animation.state).toBe("idle");
});

test("native finished events queue a fade without changing the mixer active array during iteration", async () => {
  const env = await fixture(blendClips());
  env.state.state = "running";
  env.animation.play(0, { loop: "once" });
  env.animation.mixer.addEventListener("finished", () =>
    env.animation.crossFadeTo(1, { duration: 1 }),
  );
  env.tick(2.1);
  expect(env.animation.blending).toBe(true);
  expect(env.animation.action!.getClip().name).toBe("Pose1");
  env.tick(0.5);
  expect(env.scene.position.x).toBeCloseTo(5);
});

test("disposal from a native finish during blending defers cache release and cannot revive transition state", async () => {
  const clips = blendClips();
  clips[1]!.duration = 0.1;
  const env = await fixture(clips);
  env.state.state = "running";
  env.animation.play(0);
  env.animation.crossFadeTo(1, { duration: 1, loop: "once" });
  env.animation.mixer.addEventListener("finished", () => env.model.dispose());
  env.tick(0.25);
  expect(env.animation.state).toBe("disposed");
  expect(env.animation.blending).toBe(false);
  expect(env.callbacks.size).toBe(0);
  expect(env.animation.mixer.stats.actions.inUse).toBe(0);
  expect(() => env.animation.crossFadeTo(0)).toThrow("disposed");
});

test("outgoing cleanup attempts all other actions even when one native stop fails", async () => {
  const env = await fixture(blendClips());
  env.state.state = "running";
  env.animation.play(0);
  const first = env.animation.action!;
  env.animation.crossFadeTo(1, { duration: 1 });
  env.tick(0.5);
  const second = env.animation.action!;
  env.animation.crossFadeTo(2, { duration: 1 });
  vi.spyOn(first, "stop").mockImplementation(() => {
    throw new Error("native stop");
  });
  const stopSecond = vi.spyOn(second, "stop");
  expect(() => env.tick(1)).toThrow(AggregateError);
  expect(stopSecond).toHaveBeenCalledOnce();
  expect(() => env.animation.dispose()).toThrow(AggregateError);
  expect(env.animation.mixer.stats.actions.inUse).toBe(0);
});

test("many interrupted transitions keep at most one native action per clip and settle to one action", async () => {
  const env = await fixture(blendClips());
  env.state.state = "running";
  env.animation.play(0);
  for (let index = 0; index < 30; index++) {
    const before = env.scene.position.x;
    env.animation.crossFadeTo((index + 1) % 3, { duration: 1 });
    expect(env.scene.position.x).toBeCloseTo(before);
    env.tick(0.05);
    expect(env.animation.mixer.stats.actions.inUse).toBeLessThanOrEqual(3);
  }
  env.tick(1);
  expect(env.animation.mixer.stats.actions.inUse).toBe(1);
  expect(env.animation.mixer.stats.actions.total).toBe(3);
});

test("blending a model does not change another model's action weights or controller state", async () => {
  const a = await fixture(blendClips());
  const b = await fixture(blendClips());
  a.state.state = "running";
  b.state.state = "running";
  a.animation.play(0);
  b.animation.play(1);
  a.animation.crossFadeTo(2, { duration: 1 });
  a.tick(0.5);
  b.tick(0.5);
  expect(a.scene.position.x).toBeCloseTo(10);
  expect(b.scene.position.x).toBeCloseTo(10);
  expect(b.animation.action!.getEffectiveWeight()).toBe(1);
  expect(b.animation.blending).toBe(false);
  expect(b.animation.state).toBe("playing");
});

test("seek samples an exact selected clip pose and pauses without starting the host or advancing mixer time", async () => {
  const env = await fixture();
  env.animation.play(0);
  const mixerTime = env.animation.mixer.time;
  env.animation.seek(0.75);
  expect(env.scene.position.y).toBeCloseTo(1.5);
  expect(env.animation.action!.time).toBe(0.75);
  expect(env.animation.state).toBe("paused");
  expect(env.state.state).toBe("ready");
  expect(env.animation.mixer.time).toBe(mixerTime);
});

test("seek preserves playback configuration and resume advances from the new pose", async () => {
  const env = await fixture();
  env.state.state = "running";
  env.animation.play(0, { timeScale: 2, loop: "once", clampWhenFinished: false });
  env.tick(0.1);
  const mixerTime = env.animation.mixer.time;
  env.animation.seek(0.25);
  expect(env.animation.action!.timeScale).toBe(2);
  expect(env.animation.action!.clampWhenFinished).toBe(false);
  expect(env.animation.mixer.time).toBe(mixerTime);
  env.tick(0.2);
  expect(env.scene.position.y).toBeCloseTo(0.5);
  env.animation.resume();
  env.tick(0.1);
  expect(env.scene.position.y).toBeCloseTo(0.9);
});

test("seek can revive a completed one-shot for inspection with or without a clamped final pose", async () => {
  for (const clampWhenFinished of [true, false]) {
    const env = await fixture();
    env.state.state = "running";
    env.animation.play(0, { loop: "once", clampWhenFinished });
    env.tick(1.1);
    expect(env.animation.state).toBe("finished");
    env.animation.seek(0.5);
    expect(env.animation.state).toBe("paused");
    expect(env.scene.position.y).toBeCloseTo(1);
    env.animation.resume();
    env.tick(0.1);
    expect(env.scene.position.y).toBeCloseTo(1.2);
  }
});

test("invalid seek and missing selection leave the current pose and playback untouched", async () => {
  const env = await fixture();
  expect(() => env.animation.seek(0)).toThrow("Select");
  env.animation.play(0);
  env.animation.seek(0.4);
  for (const time of [-1, NaN, Infinity, 1.0001])
    expect(() => env.animation.seek(time)).toThrow(RangeError);
  expect(env.scene.position.y).toBeCloseTo(0.8);
  expect(env.animation.action!.time).toBe(0.4);
  expect(env.animation.state).toBe("paused");
  env.animation.stop();
  expect(() => env.animation.seek(0)).toThrow("Select");
  env.animation.dispose();
  expect(() => env.animation.seek(0)).toThrow("disposed");
});

test("seek includes exact endpoints and resumes using the existing repeat or one-shot semantics", async () => {
  for (const loop of ["repeat", "once"] as const) {
    const env = await fixture();
    env.state.state = "running";
    env.animation.play(0, { loop });
    env.animation.seek(1);
    expect(env.scene.position.y).toBeCloseTo(2);
    expect(env.animation.state).toBe("paused");
    env.animation.resume();
    env.tick(0.1);
    expect(env.scene.position.y).toBeCloseTo(loop === "repeat" ? 0.2 : 2);
    expect(env.animation.state).toBe(loop === "repeat" ? "playing" : "finished");
    env.animation.seek(0);
    expect(env.scene.position.y).toBeCloseTo(0);
    env.animation.stop();
    expect(env.animation.action).toBeNull();
  }
});

test("seeking another selected clip keeps a second model independent", async () => {
  const a = await fixture();
  const b = await fixture();
  a.animation.play("Slide");
  b.animation.play("Lift");
  a.animation.seek(0.5);
  expect(a.scene.position.x).toBeCloseTo(2);
  expect(a.scene.position.y).toBe(0);
  expect(b.scene.position.y).toBe(0);
  expect(b.animation.state).toBe("playing");
});

test("native loop-event play/seek commands execute in order after mixer sampling", async () => {
  const env = await fixture();
  env.state.state = "running";
  env.animation.play("Lift");
  env.animation.mixer.addEventListener("loop", () => {
    env.animation.play("Slide");
    env.animation.seek(0.5);
  });
  env.tick(1.1);
  expect(env.animation.action!.getClip().name).toBe("Slide");
  expect(env.animation.state).toBe("paused");
  expect(env.scene.position.x).toBeCloseTo(2);
  expect(env.scene.position.y).toBe(0);
});

test("model disposal during seek sampling keeps the disposed state and releases mixer ownership", async () => {
  const env = await fixture();
  env.animation.play(0);
  vi.spyOn(env.animation.mixer, "update").mockImplementationOnce(() => {
    env.model.dispose();
    return env.animation.mixer;
  });
  env.animation.seek(0.5);
  expect(env.animation.disposed).toBe(true);
  expect(env.animation.state).toBe("disposed");
  expect(env.animation.action).toBeNull();
  expect(env.callbacks.size).toBe(0);
  expect(env.animation.mixer.stats.actions.inUse).toBe(0);
});

test("queued seek revalidates a shorter replacement clip before mutating it", async () => {
  const env = await fixture([
    new AnimationClip("Lift", 1, [new NumberKeyframeTrack(".position[y]", [0, 1], [0, 2])]),
    new AnimationClip("Short", 0.25, [new NumberKeyframeTrack(".position[x]", [0, 0.25], [0, 4])]),
  ]);
  env.state.state = "running";
  env.animation.play("Lift");
  env.animation.mixer.addEventListener("loop", () => {
    env.animation.play("Short");
    env.animation.seek(0.5);
  });
  expect(() => env.tick(1.1)).toThrow("within");
  expect(env.animation.action!.getClip().name).toBe("Short");
  expect(env.animation.action!.time).toBe(0);
  expect(env.scene.position.x).toBe(0);
});

test("native mixer samples actual properties using only host frame deltas", async () => {
  const env = await fixture();
  env.animation.play("Lift");
  env.tick(0.5);
  expect(env.scene.position.y).toBe(0);
  env.state.state = "running";
  env.tick(0.25);
  expect(env.scene.position.y).toBeCloseTo(0.5);
  env.state.state = "stopped";
  env.tick(0.5);
  expect(env.scene.position.y).toBeCloseTo(0.5);
  env.state.state = "running";
  env.tick(0);
  env.tick(0.25);
  expect(env.scene.position.y).toBeCloseTo(1);
});

test("pause/resume preserves the pose and configured rates without stopping the host", async () => {
  const env = await fixture();
  env.state.state = "running";
  env.animation.mixer.timeScale = 2;
  env.animation.play(0, { timeScale: 2 });
  env.tick(0.1);
  expect(env.scene.position.y).toBeCloseTo(0.8);
  env.animation.pause();
  const time = env.animation.mixer.time;
  env.tick(0.1);
  expect(env.scene.position.y).toBeCloseTo(0.8);
  expect(env.animation.mixer.time).toBe(time);
  expect(env.state.state).toBe("running");
  env.animation.resume();
  env.tick(0.1);
  expect(env.scene.position.y).toBeCloseTo(1.6);
});

test("switching stops the previous clip and replay restarts cached actions", async () => {
  const env = await fixture();
  env.scene.position.y = 3;
  env.state.state = "running";
  env.animation.play(0);
  const first = env.animation.action;
  env.tick(0.25);
  env.animation.play(1);
  env.tick(0.25);
  expect(env.scene.position.y).toBe(3);
  expect(env.scene.position.x).toBeCloseTo(1);
  env.animation.play(0);
  expect(env.animation.action).toBe(first);
  expect(env.animation.action!.time).toBe(0);
  expect(env.scene.position.x).toBe(0);
});

test("stop restores bound properties and clears the current selection", async () => {
  const env = await fixture();
  env.scene.position.y = 3;
  env.state.state = "running";
  env.animation.play(0);
  env.tick(0.5);
  env.animation.stop();
  env.animation.stop();
  expect(env.animation.state).toBe("idle");
  expect(env.animation.action).toBeNull();
  expect(env.scene.position.y).toBe(3);
  env.tick(0.5);
  expect(env.scene.position.y).toBe(3);
  env.animation.pause();
  env.animation.resume();
  expect(env.animation.state).toBe("idle");
});

test("repeat wraps, and pause/resume are idempotent", async () => {
  const env = await fixture();
  env.state.state = "running";
  env.animation.play(0);
  env.tick(1.25);
  expect(env.scene.position.y).toBeCloseTo(0.5);
  expect(env.animation.state).toBe("playing");
  env.animation.pause();
  env.animation.pause();
  expect(env.animation.state).toBe("paused");
  env.animation.resume();
  env.animation.resume();
  expect(env.animation.state).toBe("playing");
});

test("one-shot completion holds the last pose and replay resets it", async () => {
  const env = await fixture();
  env.state.state = "running";
  env.animation.play(0, { loop: "once" });
  env.tick(1.1);
  expect(env.animation.state).toBe("finished");
  expect(env.scene.position.y).toBe(2);
  const time = env.animation.mixer.time;
  env.tick(0.5);
  expect(env.animation.mixer.time).toBe(time);
  env.animation.play(0, { loop: "once" });
  expect(env.scene.position.y).toBe(0);
  expect(env.animation.state).toBe("playing");
});

test("one-shot without clamping restores the native bound value", async () => {
  const env = await fixture();
  env.scene.position.y = 3;
  env.state.state = "running";
  env.animation.play(0, { loop: "once", clampWhenFinished: false });
  env.tick(1.1);
  expect(env.animation.state).toBe("finished");
  expect(env.scene.position.y).toBe(3);
});

test("invalid selection, rates and clip data do not stop the current animation", async () => {
  const env = await fixture();
  env.animation.play(0);
  const action = env.animation.action;
  for (const selector of [-1, 0.5, 2, "missing"])
    expect(() => env.animation.play(selector)).toThrow(RangeError);
  for (const timeScale of [0, -1, NaN, Infinity])
    expect(() => env.animation.play(1, { timeScale })).toThrow(RangeError);
  env.gltf.animations[1]!.duration = 0;
  expect(() => env.animation.play(1)).toThrow("duration");
  env.gltf.animations[1]!.duration = 1;
  env.gltf.animations[1]!.tracks[0]!.values = new Float32Array([0, 1, 2]);
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => env.animation.play(1)).toThrow("valid tracks");
  expect(env.animation.action).toBe(action);
  expect(env.animation.state).toBe("playing");
});

test("empty lists and ambiguous names require an explicit valid index", async () => {
  const empty = await fixture([]);
  expect(() => empty.animation.play(0)).toThrow(RangeError);
  const env = await fixture();
  env.gltf.animations[1]!.name = "Lift";
  expect(() => env.animation.play("Lift")).toThrow("unique");
  expect(() => env.animation.play(1)).not.toThrow();
});

test("model disposal while paused releases mixer bindings before geometry", async () => {
  const env = await fixture();
  env.animation.play(0);
  env.animation.pause();
  const uncache = vi.spyOn(env.animation.mixer, "uncacheRoot");
  const geometry = vi.spyOn(env.geometry, "dispose");
  env.model.dispose();
  expect(env.animation.disposed).toBe(true);
  expect(env.callbacks.size).toBe(0);
  expect(uncache.mock.invocationCallOrder[0]).toBeLessThan(geometry.mock.invocationCallOrder[0]!);
  expect(env.animation.mixer.existingAction(env.gltf.animations[0]!)).toBeNull();
  expect(() => env.animation.play(0)).toThrow("disposed");
  expect(() => env.animation.pause()).toThrow("disposed");
  expect(() => env.animation.resume()).toThrow("disposed");
  expect(() => env.animation.stop()).not.toThrow();
});

test("host cleanup and multiple model instances remain isolated", async () => {
  const a = await fixture();
  const b = await fixture();
  a.animation.play(0);
  b.animation.play(0);
  a.state.state = "running";
  b.state.state = "running";
  a.state.resources.dispose();
  b.tick(0.25);
  expect(a.animation.disposed).toBe(true);
  expect(a.callbacks.size).toBe(0);
  expect(b.animation.disposed).toBe(false);
  expect(b.scene.position.y).toBeCloseTo(0.5);
});

test("one handle owns a root until disposal, and closed owners reject attachments", async () => {
  const env = await fixture();
  expect(() => attachGLTFAnimations(env.app, env.model)).toThrow("already owns");
  env.animation.dispose();
  const replacement = attachGLTFAnimations(env.app, env.model);
  replacement.dispose();
  env.model.resources.dispose();
  expect(() => attachGLTFAnimations(env.app, env.model)).toThrow("model");
  env.state.state = "disposed";
  expect(() => attachGLTFAnimations(env.app, env.model)).toThrow("ThreeApp");
});

test("switching from a native finished event is applied after the mixer update", async () => {
  const env = await fixture();
  env.state.state = "running";
  env.animation.mixer.addEventListener("finished", () => env.animation.play(1));
  env.animation.play(0, { loop: "once" });
  env.tick(1.1);
  expect(env.animation.state).toBe("playing");
  expect(env.animation.action!.getClip().name).toBe("Slide");
  expect(env.scene.position.y).toBe(0);
  expect(env.scene.position.x).toBe(0);
  env.tick(0.25);
  expect(env.scene.position.x).toBeCloseTo(1);
});

test("model disposal inside a native event defers cache mutation until update returns", async () => {
  const env = await fixture();
  env.state.state = "running";
  const uncache = vi.spyOn(env.animation.mixer, "uncacheRoot");
  env.animation.mixer.addEventListener("finished", () => {
    env.animation.play(1);
    env.model.dispose();
    expect(env.animation.disposed).toBe(true);
    expect(uncache).not.toHaveBeenCalled();
  });
  env.animation.play(0, { loop: "once" });
  expect(() => env.tick(1.1)).not.toThrow();
  expect(uncache).toHaveBeenCalledOnce();
  expect(env.animation.state).toBe("disposed");
  expect(env.callbacks.size).toBe(0);
  expect(env.scene.position.y).toBe(0);
});

test("a cleanup failure still uncaches the root and removes both owners and the frame subscription", async () => {
  const env = await fixture();
  env.animation.play(0);
  vi.spyOn(env.animation.mixer, "stopAllAction").mockImplementation(() => {
    throw new Error("stop failed");
  });
  const uncache = vi.spyOn(env.animation.mixer, "uncacheRoot");
  expect(() => env.animation.dispose()).toThrow(AggregateError);
  expect(uncache).toHaveBeenCalledOnce();
  expect(env.callbacks.size).toBe(0);
  expect(env.model.resources.untrack(env.animation)).toBe(false);
  expect(env.state.resources.untrack(env.animation)).toBe(false);
  expect(() => env.animation.dispose()).not.toThrow();
});
