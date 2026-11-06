import { afterEach, expect, test, vi } from "vite-plus/test";
import { AnimationClip, Group, NumberKeyframeTrack } from "three";
import type { FrameInfo, ThreeApp } from "../src/index.ts";
import type { GLTFInstance } from "../src/loaders.ts";
import { ResourceScope } from "../src/resources.ts";
import { attachGLTFAnimations } from "../src/animation.ts";

const scopes: ResourceScope[] = [];
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.dispose();
  vi.restoreAllMocks();
});

function fixture() {
  const updates = new Set<(frame: FrameInfo) => void>();
  const scope = new ResourceScope(),
    modelScope = new ResourceScope();
  scopes.push(scope, modelScope);
  const value = {
    state: "running",
    resources: scope,
    onUpdate(callback: (frame: FrameInfo) => void) {
      updates.add(callback);
      return () => {
        updates.delete(callback);
      };
    },
  };
  const root = new Group();
  let disposed = false;
  const clips = [
    new AnimationClip("Lift", 1, [new NumberKeyframeTrack(".position[y]", [0, 1], [0, 2])]),
    new AnimationClip("Slide", 1, [new NumberKeyframeTrack(".position[x]", [0, 1], [0, 4])]),
  ];
  const model: GLTFInstance = {
    scene: root,
    animations: clips,
    resources: modelScope,
    get disposed() {
      return disposed;
    },
    dispose(): void {
      disposed = true;
      modelScope.dispose();
    },
  };
  const handle = attachGLTFAnimations(value as unknown as ThreeApp, model);
  return {
    root,
    model,
    clips,
    handle,
    updates,
    value,
    tick(delta: number): void {
      for (const callback of Array.from(updates))
        if (updates.has(callback)) callback({ delta, elapsed: delta });
    },
  };
}

test("finished notices follow native property application and expose a typed action/clip snapshot", () => {
  const env = fixture();
  const native: number[] = [],
    after: number[] = [];
  env.handle.mixer.addEventListener("finished", () => native.push(env.root.position.y));
  env.handle.on("finished", (event) => {
    expect(event.type).toBe("finished");
    expect(event.direction).toBe(1);
    expect(event.action).toBe(env.handle.action);
    expect(event.clip).toBe(env.clips[0]);
    expect(env.handle.state).toBe("finished");
    after.push(env.root.position.y);
  });
  env.handle.play(0, { loop: "once" });
  env.tick(1);
  expect(native).toEqual([0]);
  expect(after).toEqual([2]);
});

test("finite ping-pong completion notices see the normalized endpoint", () => {
  for (const repetitions of [1, 2, 3, 4]) {
    const env = fixture(),
      poses: number[] = [];
    env.handle.on("finished", () => poses.push(env.root.position.y));
    env.handle.play(0, { loop: "pingpong", repetitions });
    env.tick(repetitions + 0.5);
    env.tick(1);
    expect(poses).toEqual([repetitions % 2 ? 2 : 0]);
  }
});

test("unclamped completion notices observe restored bindings", () => {
  const env = fixture(),
    poses: number[] = [];
  env.root.position.y = 3;
  env.handle.on("finished", () => poses.push(env.root.position.y));
  env.handle.play(0, { loop: "once", clampWhenFinished: false });
  env.tick(1);
  expect(poses).toEqual([3]);
});

test("loop notices expose the newly sampled pose and preserve the native aggregate loop delta", () => {
  const env = fixture(),
    events: Array<[number, number]> = [];
  env.handle.on("loop", (event) => {
    expect(event.clip).toBe(env.clips[0]);
    events.push([event.loopDelta, env.root.position.y]);
  });
  env.handle.play(0);
  env.tick(0.5);
  env.tick(2.75);
  expect(events).toEqual([[3, 0.5]]);
});

test("listener removal/registration during a notice uses a snapshot and duplicate subscriptions are independent", () => {
  const env = fixture(),
    calls: number[] = [];
  let remove = (): void => {};
  env.handle.on("loop", () => {
    calls.push(1);
    remove();
    env.handle.on("loop", () => calls.push(3));
  });
  remove = env.handle.on("loop", () => calls.push(2));
  env.handle.play(0);
  env.tick(1.25);
  expect(calls).toEqual([1]);
  env.tick(1);
  expect(calls).toEqual([1, 1, 3]);
  const duplicate = vi.fn();
  const off = env.handle.on("loop", duplicate);
  env.handle.on("loop", duplicate);
  off();
  env.tick(1);
  expect(duplicate).toHaveBeenCalledOnce();
});

test("finished callbacks queue clip switches until every subscriber has observed the final pose", () => {
  const env = fixture(),
    clips: string[] = [];
  env.handle.on("finished", () => env.handle.play(1));
  env.handle.on("finished", (event) => {
    clips.push(event.clip.name);
    expect(env.handle.action!.getClip().name).toBe("Lift");
    expect(env.root.position.y).toBe(2);
  });
  env.handle.play(0, { loop: "once" });
  env.tick(1);
  expect(clips).toEqual(["Lift"]);
  expect(env.handle.action!.getClip().name).toBe("Slide");
  expect(env.root.position.y).toBe(0);
  expect(env.handle.action!.time).toBe(0);
});

test("only the selected controller completion is emitted, after a longer fade settles", () => {
  const env = fixture(),
    selected: string[] = [];
  env.handle.on("finished", (event) => {
    selected.push(event.clip.name);
    expect(env.handle.blending).toBe(false);
    expect(env.root.position.x).toBe(4);
  });
  env.handle.play(0, { loop: "once" });
  env.handle.crossFadeTo(1, { loop: "once", duration: 2 });
  env.tick(1);
  expect(selected).toEqual([]);
  expect(env.handle.state).toBe("playing");
  env.tick(1);
  expect(selected).toEqual(["Slide"]);
  env.tick(1);
  expect(selected).toHaveLength(1);
});

test("disposing the model in a notice skips later subscribers and releases mixer ownership afterwards", () => {
  const env = fixture(),
    later = vi.fn();
  env.handle.on("finished", () => env.model.dispose());
  env.handle.on("finished", later);
  env.handle.play(0, { loop: "once" });
  env.tick(1);
  expect(later).not.toHaveBeenCalled();
  expect(env.handle.disposed).toBe(true);
  expect(env.updates.size).toBe(0);
  expect(env.handle.mixer.stats.actions.inUse).toBe(0);
});

test("consumer notification errors propagate and discard queued commands without corrupting the selection", () => {
  const env = fixture(),
    error = new Error("notification failed");
  const off = env.handle.on("finished", () => {
    env.handle.play(1);
    throw error;
  });
  env.handle.play(0, { loop: "once" });
  expect(() => env.tick(1)).toThrow(error);
  expect(env.handle.action!.getClip().name).toBe("Lift");
  expect(env.handle.state).toBe("finished");
  off();
  expect(() => env.handle.play(1)).not.toThrow();
  expect(env.handle.state).toBe("playing");
});

test("notices are not retroactive and stop/seek/pause do not manufacture completion", () => {
  const env = fixture();
  env.handle.play(0, { loop: "once" });
  env.tick(1);
  const ended = vi.fn();
  env.handle.on("finished", ended);
  expect(ended).not.toHaveBeenCalled();
  env.handle.seek(0.5);
  env.handle.pause();
  env.handle.resume();
  env.tick(0.5);
  expect(ended).toHaveBeenCalledOnce();
  env.handle.stop();
  env.handle.play(0, { loop: "once" });
  env.handle.seek(1);
  expect(ended).toHaveBeenCalledOnce();
  env.handle.resume();
  env.tick(0.1);
  expect(ended).toHaveBeenCalledTimes(2);
});

test("loop callbacks can request a fade without mutating other subscribers' sampled selection", () => {
  const env = fixture();
  let checked = false;
  env.handle.on("loop", () => env.handle.crossFadeTo(1, { duration: 1 }));
  env.handle.on("loop", (event) => {
    expect(env.handle.action).toBe(event.action);
    expect(env.root.position.y).toBeCloseTo(0.5);
    checked = true;
  });
  env.handle.play(0);
  env.tick(1.25);
  expect(checked).toBe(true);
  expect(env.handle.action!.getClip().name).toBe("Slide");
  expect(env.handle.blending).toBe(true);
  expect(env.handle.blendProgress).toBe(0);
});

test("invalid subscriptions fail early and teardown makes unsubscribe harmless but new subscriptions invalid", () => {
  const env = fixture(),
    callback = vi.fn();
  expect(() => env.handle.on("missing" as "loop", callback)).toThrow(TypeError);
  expect(() => env.handle.on("loop", null as unknown as () => void)).toThrow(TypeError);
  const off = env.handle.on("loop", callback);
  env.handle.dispose();
  off();
  off();
  expect(() => env.handle.on("loop", callback)).toThrow("disposed");
  expect(callback).not.toHaveBeenCalled();
});
