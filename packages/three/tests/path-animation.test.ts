import { expect, test, vi } from "vite-plus/test";
import { CatmullRomCurve3, Group, LineCurve3, Scene, Vector3 } from "three";
import type { Curve } from "three";
import type { ThreeApp, ThreeAppState, FrameInfo } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";
import { followPath } from "../src/path-animation.ts";

function fixture() {
  const controller = new AbortController();
  const updates = new Set<(frame: FrameInfo) => void>();
  const object = new Group(),
    parent = new Group(),
    scene = new Scene();
  parent.add(object);
  scene.add(parent);
  const value = {
    state: "ready" as ThreeAppState,
    scene,
    resources: new ResourceScope(),
    signal: controller.signal,
    start: vi.fn(),
    renderer: { render: vi.fn() },
    onUpdate: vi.fn((callback: (frame: FrameInfo) => void) => {
      updates.add(callback);
      return () => {
        updates.delete(callback);
      };
    }),
  };
  const app = value as unknown as ThreeApp;
  const curve = new LineCurve3(new Vector3(), new Vector3(4, 0, 0));
  return {
    app,
    value,
    object,
    parent,
    controller,
    updates,
    curve,
    start: () => followPath(app, object, { curve, duration: 2 }),
    tick(delta: number): void {
      if (value.state !== "running") return;
      const snapshot = Array.from(updates);
      for (const callback of snapshot)
        if (updates.has(callback)) callback({ delta, elapsed: delta });
    },
  };
}

test("path motion samples immediately, uses host seconds and releases all hooks on completion", async () => {
  const env = fixture();
  env.object.position.x = -10;
  const handle = env.start();
  expect(env.object.position.x).toBe(0);
  expect(env.value.state).toBe("ready");
  expect(env.value.start).not.toHaveBeenCalled();
  expect(env.value.renderer.render).not.toHaveBeenCalled();
  env.value.state = "running";
  env.tick(0.5);
  expect(env.object.position.x).toBeCloseTo(1);
  expect(handle.progress).toBeCloseTo(0.25);
  env.tick(3);
  expect(env.object.position.x).toBe(4);
  expect(handle.progress).toBe(1);
  expect(handle.state).toBe("completed");
  expect(await handle.finished).toEqual({ status: "completed" });
  expect(env.updates.size).toBe(0);
  handle.cancel();
  handle.dispose();
  handle.pause();
  handle.resume();
  expect(handle.state).toBe("completed");
});

test("controller and host pauses retain elapsed motion without replaying wall time", () => {
  const env = fixture(),
    handle = env.start();
  env.value.state = "running";
  env.tick(0.5);
  handle.pause();
  env.tick(5);
  expect(handle.progress).toBe(0.25);
  handle.resume();
  env.value.state = "stopped";
  env.tick(5);
  env.value.state = "running";
  env.tick(0);
  expect(handle.progress).toBe(0.25);
  env.tick(0.5);
  expect(env.object.position.x).toBeCloseTo(2);
  handle.dispose();
});

test("repeat wraps across multiple traversals and ping-pong reverses position and local forward", () => {
  for (const loop of ["repeat", "pingpong"] as const) {
    const env = fixture();
    const motion = followPath(env.app, env.object, {
      curve: env.curve,
      duration: 1,
      loop,
      orientToPath: true,
    });
    env.value.state = "running";
    env.tick(3.25);
    expect(env.object.position.x).toBeCloseTo(loop === "repeat" ? 1 : 3);
    const forward = new Vector3(0, 0, 1).applyQuaternion(env.object.quaternion);
    expect(forward.x).toBeCloseTo(loop === "repeat" ? 1 : -1);
    expect(motion.state).toBe("running");
    motion.dispose();
  }
});

test("native arc-length sampling and transformed parents preserve local path coordinates", () => {
  const env = fixture();
  env.parent.position.set(10, 20, 30);
  env.parent.scale.set(2, 3, 4);
  env.parent.rotation.y = Math.PI / 2;
  const curve = new CatmullRomCurve3([new Vector3(), new Vector3(1, 2, 0), new Vector3(10, 2, 1)]);
  const expected = curve.getPointAt(0.5);
  const motion = followPath(env.app, env.object, { curve, duration: 1 });
  env.value.state = "running";
  env.tick(0.5);
  expect(env.object.position.distanceTo(expected)).toBeLessThan(1e-9);
  env.parent.position.x += 10;
  env.tick(0.25);
  expect(motion.state).toBe("running");
  motion.dispose();
});

test("valid replacement cancels the old motion, while invalid/pre-aborted requests leave it untouched", async () => {
  const env = fixture(),
    original = env.start();
  for (const duration of [0, -1, NaN, Infinity])
    expect(() => followPath(env.app, env.object, { curve: env.curve, duration })).toThrow(
      RangeError,
    );
  expect(() => followPath(env.app, env.object, { curve: new LineCurve3(), duration: 1 })).toThrow(
    "length",
  );
  const cancelled = new AbortController();
  cancelled.abort();
  const early = followPath(env.app, env.object, {
    curve: env.curve,
    duration: 1,
    signal: cancelled.signal,
  });
  expect(await early.finished).toEqual({ status: "cancelled", reason: "aborted" });
  expect(original.state).toBe("running");
  const next = env.start();
  expect(await original.finished).toEqual({ status: "cancelled", reason: "replaced" });
  expect(env.updates.size).toBe(1);
  next.dispose();
});

test("external position, owned rotation, reparenting and matrix flags cancel without overwriting the consumer", async () => {
  for (const edit of [
    (env: ReturnType<typeof fixture>) => {
      env.object.position.x = 10;
    },
    (env: ReturnType<typeof fixture>) => {
      env.object.rotation.y = 1;
    },
    (env: ReturnType<typeof fixture>) => {
      env.value.scene.add(env.object);
    },
    (env: ReturnType<typeof fixture>) => {
      env.object.matrixAutoUpdate = false;
    },
    (env: ReturnType<typeof fixture>) => {
      env.object.removeFromParent();
    },
  ]) {
    const env = fixture();
    const motion = followPath(env.app, env.object, {
      curve: env.curve,
      duration: 1,
      orientToPath: true,
    });
    edit(env);
    const position = env.object.position.clone(),
      rotation = env.object.quaternion.clone();
    env.value.state = "running";
    env.tick(0.25);
    expect(await motion.finished).toEqual({ status: "cancelled", reason: "target-changed" });
    expect(env.object.position).toEqual(position);
    expect(env.object.quaternion.toArray()).toEqual(rotation.toArray());
  }
});

test("position-only paths leave external rotation and scale available to the consumer", () => {
  const env = fixture(),
    motion = env.start();
  env.object.rotation.y = 1;
  env.object.scale.setScalar(2);
  const quaternion = env.object.quaternion.clone();
  env.value.state = "running";
  env.tick(0.25);
  expect(motion.state).toBe("running");
  expect(env.object.quaternion.toArray()).toEqual(quaternion.toArray());
  expect(env.object.scale.x).toBe(2);
  motion.dispose();
});

test("abort, app scope, app signal and an explicit model scope release subscriptions but borrow target assets", async () => {
  for (const end of ["signal", "app", "abort", "model"] as const) {
    const env = fixture(),
      controller = new AbortController(),
      scope = new ResourceScope();
    const borrowed = vi.spyOn(env.object, "dispose");
    const motion = followPath(env.app, env.object, {
      curve: env.curve,
      duration: 1,
      signal: controller.signal,
    });
    scope.track(motion);
    if (end === "signal") controller.abort();
    if (end === "app") env.value.resources.dispose();
    if (end === "abort") env.controller.abort();
    if (end === "model") scope.dispose();
    expect(await motion.finished).toEqual({
      status: "cancelled",
      reason: end === "signal" ? "aborted" : "disposed",
    });
    expect(env.updates.size).toBe(0);
    expect(borrowed).not.toHaveBeenCalled();
    expect(env.object.parent).toBe(env.parent);
  }
});

test("invalid target, flags and curve samples reject before replacing a live motion", () => {
  const env = fixture(),
    original = env.start();
  const bad = new LineCurve3();
  vi.spyOn(bad, "getLength").mockReturnValue(1);
  vi.spyOn(bad, "getPointAt").mockReturnValue(new Vector3(Infinity, 0, 0));
  expect(() => followPath(env.app, env.object, { curve: bad, duration: 1 })).toThrow(
    "finite Vector3",
  );
  expect(() => followPath(env.app, env.value.scene, { curve: env.curve, duration: 1 })).toThrow(
    TypeError,
  );
  expect(() => followPath(env.app, new Group(), { curve: env.curve, duration: 1 })).toThrow(
    "attached",
  );
  expect(original.state).toBe("running");
  original.dispose();
  env.value.resources.dispose();
  expect(() => env.start()).toThrow("disposed");
});

test("a failed runtime sample preserves the last pose, resolves failed and releases the writer for a retry", async () => {
  const env = fixture(),
    motion = env.start();
  env.value.state = "running";
  env.tick(0.5);
  const position = env.object.position.clone(),
    failure = new Error("curve failed");
  const point = vi.spyOn(env.curve, "getPointAt").mockImplementation(() => {
    throw failure;
  });
  expect(() => env.tick(0.25)).toThrow(failure);
  expect(await motion.finished).toEqual({ status: "failed", error: failure });
  expect(env.object.position).toEqual(position);
  expect(env.updates.size).toBe(0);
  point.mockRestore();
  expect(() => env.start().dispose()).not.toThrow();
});

test("invalid deltas and numerically unrepresentable phase changes settle failure before transform writes", async () => {
  for (const delta of [-1, Infinity, NaN]) {
    const env = fixture(),
      motion = env.start();
    env.value.state = "running";
    expect(() => env.tick(delta)).toThrow(RangeError);
    expect((await motion.finished).status).toBe("failed");
    expect(env.object.position.x).toBe(0);
  }
  const env = fixture();
  const motion = followPath(env.app, env.object, { curve: env.curve, duration: Number.MIN_VALUE });
  env.value.state = "running";
  expect(() => env.tick(1)).toThrow(RangeError);
  expect((await motion.finished).status).toBe("failed");
});

test("curve callbacks cannot reenter path writes and owner cancellation discards a returned sample", async () => {
  const env = fixture(),
    controller = new AbortController();
  const motion = followPath(env.app, env.object, {
    curve: env.curve,
    duration: 1,
    orientToPath: true,
    signal: controller.signal,
  });
  const tangent = vi.spyOn(env.curve, "getTangentAt");
  const point = vi.spyOn(env.curve, "getPointAt").mockImplementation(() => {
    expect(() => env.start()).toThrow("already in progress");
    controller.abort();
    return new Vector3(99, 0, 0);
  });
  env.value.state = "running";
  env.tick(0.25);
  expect(await motion.finished).toEqual({ status: "cancelled", reason: "aborted" });
  expect(tangent).not.toHaveBeenCalled();
  expect(env.object.position.x).toBe(0);
  point.mockRestore();
});

test("owner ending during preflight prevents further custom sampling or target writes", () => {
  const env = fixture();
  vi.spyOn(env.curve, "getLength").mockImplementation(() => {
    env.value.resources.dispose();
    return 4;
  });
  const point = vi.spyOn(env.curve, "getPointAt");
  expect(() => env.start()).toThrow("owner ended");
  expect(point).not.toHaveBeenCalled();
  expect(env.object.position.x).toBe(0);
});

test("a curve callback pausing the motion leaves its candidate pose and phase unapplied", () => {
  const env = fixture(),
    motion = env.start();
  const sample = env.curve.getPointAt.bind(env.curve);
  vi.spyOn(env.curve, "getPointAt").mockImplementationOnce((u, value) => {
    motion.pause();
    return sample(u, value);
  });
  env.value.state = "running";
  env.tick(0.5);
  expect(motion.state).toBe("paused");
  expect(motion.progress).toBe(0);
  expect(env.object.position.x).toBe(0);
  motion.resume();
  env.tick(0.5);
  expect(env.object.position.x).toBeCloseTo(1);
  motion.dispose();
});

test("all cleanup hooks are attempted and cleanup errors resolve as a failure", async () => {
  const env = fixture();
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  const untrack = vi.spyOn(env.value.resources, "untrack");
  env.value.onUpdate.mockImplementationOnce((callback) => {
    env.updates.add(callback);
    return () => {
      env.updates.delete(callback);
      throw new Error("unsubscribe failed");
    };
  });
  const motion = followPath(env.app, env.object, {
    curve: env.curve,
    duration: 1,
    signal: controller.signal,
  });
  motion.cancel();
  const result = await motion.finished;
  expect(result.status).toBe("failed");
  if (result.status === "failed") expect(result.error).toBeInstanceOf(AggregateError);
  expect(remove).toHaveBeenCalled();
  expect(untrack).toHaveBeenCalledWith(motion);
  expect(env.updates.size).toBe(0);
});

test("an optional model scope cancels immediately and completed motions release both owner registrations", async () => {
  for (const completed of [false, true]) {
    const env = fixture(),
      scope = new ResourceScope();
    const untrack = vi.spyOn(scope, "untrack");
    const motion = followPath(env.app, env.object, { curve: env.curve, duration: 1, scope });
    if (completed) {
      env.value.state = "running";
      env.tick(1);
    }
    scope.dispose();
    expect(await motion.finished).toEqual(
      completed ? { status: "completed" } : { status: "cancelled", reason: "disposed" },
    );
    expect(untrack).toHaveBeenCalledWith(motion);
    expect(env.updates.size).toBe(0);
  }
  const env = fixture(),
    scope = new ResourceScope();
  scope.dispose();
  expect(() => followPath(env.app, env.object, { curve: env.curve, duration: 1, scope })).toThrow(
    "disposed",
  );
});

test("a nonfinite runtime tangent fails before position or rotation are committed", async () => {
  const env = fixture();
  const motion = followPath(env.app, env.object, {
    curve: env.curve,
    duration: 1,
    orientToPath: true,
  });
  const position = env.object.position.clone(),
    rotation = env.object.quaternion.toArray();
  vi.spyOn(env.curve, "getTangentAt").mockReturnValue(new Vector3(NaN, 0, 0));
  env.value.state = "running";
  expect(() => env.tick(0.5)).toThrow(RangeError);
  expect((await motion.finished).status).toBe("failed");
  expect(env.object.position).toEqual(position);
  expect(env.object.quaternion.toArray()).toEqual(rotation);
});

test("two targets sharing one curve retain independent motion state and ownership", async () => {
  const env = fixture(),
    peer = new Group();
  env.parent.add(peer);
  const scope = new ResourceScope();
  const first = followPath(env.app, env.object, { curve: env.curve, duration: 1, scope });
  const second = followPath(env.app, peer, { curve: env.curve, duration: 2 });
  env.value.state = "running";
  env.tick(0.25);
  first.pause();
  env.tick(0.25);
  expect(env.object.position.x).toBeCloseTo(1);
  expect(peer.position.x).toBeCloseTo(1);
  scope.dispose();
  expect(await first.finished).toEqual({ status: "cancelled", reason: "disposed" });
  env.tick(0.5);
  expect(peer.position.x).toBeCloseTo(2);
  expect(second.state).toBe("running");
  second.dispose();
});

test("a reparented target can transfer to another host without retaining the previous owner", async () => {
  const first = fixture(),
    second = fixture(),
    old = first.start();
  expect(() => followPath(second.app, first.object, { curve: second.curve, duration: 1 })).toThrow(
    "attached",
  );
  expect(old.state).toBe("running");
  second.parent.add(first.object);
  const next = followPath(second.app, first.object, { curve: second.curve, duration: 1 });
  expect(await old.finished).toEqual({ status: "cancelled", reason: "replaced" });
  first.controller.abort();
  first.value.resources.dispose();
  expect(next.state).toBe("running");
  second.value.state = "running";
  second.tick(0.5);
  expect(first.object.position.x).toBeCloseTo(2);
  next.dispose();
});

test("seek samples local arc length, pauses without drawing or settling, and resumes from the sample", async () => {
  const env = fixture(),
    handle = env.start(),
    settled = vi.fn();
  void handle.finished.then(settled);
  env.parent.position.set(10, 20, 30);
  env.parent.scale.set(2, 3, 4);
  handle.seek(0.75);
  expect(handle.progress).toBe(0.75);
  expect(handle.state).toBe("paused");
  expect(env.object.position.toArray()).toEqual([3, 0, 0]);
  expect(env.value.state).toBe("ready");
  expect(env.value.start).not.toHaveBeenCalled();
  expect(env.value.renderer.render).not.toHaveBeenCalled();
  env.value.state = "running";
  env.tick(0.25);
  expect(handle.progress).toBe(0.75);
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  handle.resume();
  env.tick(0.25);
  expect(handle.progress).toBeCloseTo(0.875);
  handle.dispose();
});

test("seek resets ping-pong return direction and an explicit repeat endpoint wraps only after resume", () => {
  for (const loop of ["pingpong", "repeat"] as const) {
    const env = fixture();
    const handle = followPath(env.app, env.object, {
      curve: env.curve,
      duration: 2,
      loop,
      orientToPath: true,
    });
    env.value.state = "running";
    env.tick(2.5);
    handle.seek(0.25);
    expect(env.object.position.x).toBe(1);
    expect(new Vector3(0, 0, 1).applyQuaternion(env.object.quaternion).x).toBeCloseTo(1);
    handle.resume();
    env.tick(0.5);
    expect(handle.progress).toBeCloseTo(0.5);
    handle.seek(1);
    expect(env.object.position.x).toBe(4);
    expect(handle.state).toBe("paused");
    handle.resume();
    env.tick(0);
    expect(handle.progress).toBe(loop === "repeat" ? 0 : 1);
    handle.dispose();
  }
});

test("seek at the once endpoint stays live until resumed, then settles and cannot resurrect", async () => {
  const env = fixture(),
    handle = env.start();
  env.value.state = "running";
  handle.seek(1);
  env.tick(1);
  expect(handle.state).toBe("paused");
  expect(env.updates.size).toBe(1);
  handle.resume();
  env.tick(0);
  expect(await handle.finished).toEqual({ status: "completed" });
  expect(env.updates.size).toBe(0);
  expect(() => handle.seek(0)).toThrow("ended");
});

test("invalid seek values preserve pose, active motion and its subscription", () => {
  const env = fixture(),
    handle = env.start();
  env.value.state = "running";
  env.tick(0.5);
  for (const value of [-0.01, 1.01, NaN, Infinity, -Infinity])
    expect(() => handle.seek(value)).toThrow(RangeError);
  expect(env.object.position.x).toBe(1);
  expect(handle.progress).toBe(0.25);
  expect(handle.state).toBe("running");
  expect(env.updates.size).toBe(1);
  handle.dispose();
  expect(() => handle.seek(0.5)).toThrow("ended");
  const signal = AbortSignal.abort();
  const early = followPath(env.app, env.object, { curve: env.curve, duration: 1, signal });
  expect(() => early.seek(0)).toThrow("ended");
});

test.each(["pause", "resume", "cancel"] as const)(
  "a %s command during seek sampling discards the old candidate",
  async (command) => {
    const env = fixture(),
      handle = env.start();
    if (command === "resume") handle.pause();
    vi.spyOn(env.curve, "getPointAt").mockImplementationOnce((_u, target = new Vector3()) => {
      handle[command]();
      return target.set(3, 0, 0);
    });
    handle.seek(0.75);
    expect(env.object.position.x).toBe(0);
    expect(handle.progress).toBe(0);
    expect(handle.state).toBe(
      command === "cancel" ? "cancelled" : command === "pause" ? "paused" : "running",
    );
    if (command === "cancel")
      expect(await handle.finished).toEqual({ status: "cancelled", reason: "cancelled" });
    else {
      handle.seek(0.5);
      expect(handle.progress).toBe(0.5);
      handle.dispose();
    }
  },
);

test.each(["scope", "target"] as const)(
  "seek observes %s changes during sampling without committing a candidate",
  async (change) => {
    const env = fixture(),
      scope = new ResourceScope();
    const handle = followPath(env.app, env.object, { curve: env.curve, duration: 2, scope });
    vi.spyOn(env.curve, "getPointAt").mockImplementationOnce((_u, target = new Vector3()) => {
      if (change === "scope") scope.dispose();
      else env.object.removeFromParent();
      return target.set(3, 0, 0);
    });
    handle.seek(0.75);
    expect(env.object.position.x).toBe(0);
    expect(await handle.finished).toEqual({
      status: "cancelled",
      reason: change === "scope" ? "disposed" : "target-changed",
    });
    expect(env.updates.size).toBe(0);
    scope.dispose();
  },
);

test("seek sampling failures settle the motion, release hooks and leave the write guard reusable", async () => {
  const env = fixture(),
    handle = env.start(),
    error = new Error("bad path sample");
  vi.spyOn(env.curve, "getPointAt").mockImplementationOnce(() => {
    throw error;
  });
  expect(() => handle.seek(0.75)).toThrow(error);
  expect(await handle.finished).toEqual({ status: "failed", error });
  expect(env.object.position.x).toBe(0);
  expect(env.updates.size).toBe(0);
  const next = env.start();
  next.seek(0.5);
  expect(env.object.position.x).toBe(2);
  next.dispose();
});

test("seek shares the path write lock with nested seeks and replacement, then releases it", () => {
  const env = fixture(),
    handle = env.start();
  vi.spyOn(env.curve, "getPointAt").mockImplementationOnce((_u, target = new Vector3()) => {
    expect(() => handle.seek(0.5)).toThrow("in progress");
    expect(() => env.start()).toThrow("in progress");
    return target.set(3, 0, 0);
  });
  handle.seek(0.75);
  expect(handle.progress).toBe(0.75);
  handle.seek(0);
  expect(env.object.position.x).toBe(0);
  handle.dispose();
});

test("seek validates the tangent before writing either position or orientation", async () => {
  const env = fixture();
  const handle = followPath(env.app, env.object, {
    curve: env.curve,
    duration: 2,
    orientToPath: true,
  });
  const orientation = env.object.quaternion.clone();
  vi.spyOn(env.curve, "getTangentAt").mockReturnValueOnce(new Vector3());
  expect(() => handle.seek(0.5)).toThrow("nonzero");
  expect(env.object.position.x).toBe(0);
  expect(env.object.quaternion.equals(orientation)).toBe(true);
  expect((await handle.finished).status).toBe("failed");
  expect(env.updates.size).toBe(0);
});

test("2D and zero tangent curves reject orientation before touching target rotation", () => {
  const env = fixture();
  const curve = env.curve.clone();
  vi.spyOn(curve, "getTangentAt").mockReturnValue(new Vector3());
  expect(() => followPath(env.app, env.object, { curve, duration: 1, orientToPath: true })).toThrow(
    "nonzero",
  );
  const twoDimensional = {
    getLength: () => 1,
    getPointAt: () => ({ x: 0, y: 0 }),
  } as unknown as Curve<Vector3>;
  expect(() => followPath(env.app, env.object, { curve: twoDimensional, duration: 1 })).toThrow(
    "Vector3",
  );
});
