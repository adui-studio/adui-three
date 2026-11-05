import { expect, test, vi } from "vite-plus/test";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { fitObject, transitionToObject } from "../src/camera.ts";
import type { CameraTransitionOptions } from "../src/camera.ts";
import type { ThreeApp, ThreeAppState, FrameInfo } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";

function fixture(orbit = false) {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  camera.position.set(4, 3, 5);
  camera.lookAt(0, 0, 0);
  const object = new Mesh(new BoxGeometry(2, 4, 3), new MeshBasicMaterial());
  object.position.set(20, 10, -15);
  const updates = new Set<(frame: FrameInfo) => void>();
  const canvas = new EventTarget();
  const env = {
    camera,
    state: "running" as ThreeAppState,
    size: { width: 640, height: 360, pixelRatio: 2 },
    resources: new ResourceScope(),
    renderer: { domElement: canvas, render: vi.fn() },
    start: vi.fn(),
    onUpdate(callback: (frame: FrameInfo) => void) {
      updates.add(callback);
      return () => {
        updates.delete(callback);
      };
    },
  };
  const controls = orbit ? new OrbitControls(camera) : undefined;
  if (controls) {
    controls.enableDamping = true;
    env.onUpdate(({ delta }) => controls.update(delta));
  }
  return {
    env,
    object,
    canvas,
    controls,
    camera,
    updates,
    app: env as unknown as ThreeApp,
    tick(delta: number): void {
      if (env.state !== "running" || env.size.width === 0 || env.size.height === 0) return;
      const snapshot = Array.from(updates);
      for (const callback of snapshot)
        if (updates.has(callback)) callback({ delta, elapsed: delta });
    },
  };
}

function start(env: ReturnType<typeof fixture>, options: CameraTransitionOptions = {}) {
  return transitionToObject(env.app, env.object, {
    duration: 1,
    controls: env.controls,
    ...options,
  });
}

test("no-controls transition samples host delta, smooths the midpoint and completes with an independent frame", async () => {
  const env = fixture();
  const before = env.camera.position.clone();
  const motion = start(env);
  expect(env.camera.position).toEqual(before);
  expect(env.env.start).not.toHaveBeenCalled();
  expect(env.env.renderer.render).not.toHaveBeenCalled();
  env.tick(0);
  expect(motion.progress).toBe(0);
  env.tick(0.25);
  expect(motion.progress).toBe(0.25);
  expect(env.camera.position.distanceTo(before)).toBeGreaterThan(0);
  env.tick(0.75);
  const result = await motion.finished;
  expect(result.status).toBe("completed");
  expect(motion.state).toBe("completed");
  expect(motion.progress).toBe(1);
  expect(env.updates.size).toBe(0);
  if (result.status !== "completed") throw new Error("Expected completed frame");
  expect(env.camera.position).toEqual(result.frame.position);
  expect(env.camera.near).toBe(result.frame.near);
  expect(env.camera.far).toBe(result.frame.far);
  result.frame.position.set(0, 0, 0);
  expect(env.camera.position.length()).toBeGreaterThan(0);
});

test("native controls interpolate target and orbit distance and restore their original settings", async () => {
  const env = fixture(true);
  const target = env.controls!.target.clone();
  const motion = start(env, { direction: [-1, 1, 1] });
  expect(env.controls).toMatchObject({ enabled: false, enableDamping: false, autoRotate: false });
  env.tick(0.5);
  expect(
    env.controls!.target.distanceTo(target.clone().lerp(env.object.position, 0.5)),
  ).toBeLessThan(1e-10);
  expect(env.camera.position.toArray().every(Number.isFinite)).toBe(true);
  env.tick(0.5);
  expect((await motion.finished).status).toBe("completed");
  expect(env.controls).toMatchObject({ enabled: true, enableDamping: true, autoRotate: false });
  expect(env.updates.size).toBe(1);
  const pose = env.camera.position.clone();
  env.tick(0.1);
  expect(env.camera.position.distanceTo(pose)).toBeLessThan(1e-9);
});

test("opposite orbit directions keep a nonzero distance through the transition", async () => {
  const env = fixture(true);
  const motion = start(env, { direction: [-4, -3, -5] });
  for (let index = 0; index < 10; index++) {
    env.tick(0.1);
    expect(env.controls!.getDistance()).toBeGreaterThan(1);
    expect(env.camera.position.toArray().every(Number.isFinite)).toBe(true);
  }
  env.tick(0.01);
  expect((await motion.finished).status).toBe("completed");
});

test("host pause and zero size retain progress and resume without using wall clock time", async () => {
  const env = fixture();
  const motion = start(env);
  env.tick(0.2);
  const pose = env.camera.position.clone();
  env.env.state = "stopped";
  env.tick(100);
  expect(motion.progress).toBe(0.2);
  expect(env.camera.position).toEqual(pose);
  env.env.state = "running";
  env.env.size.height = 0;
  env.tick(100);
  env.env.size.height = 360;
  env.tick(0);
  expect(motion.progress).toBe(0.2);
  env.tick(0.8);
  expect((await motion.finished).status).toBe("completed");
});

test("a stopped host is not started and can cancel an unadvanced request", async () => {
  const env = fixture(true);
  env.env.state = "stopped";
  const motion = start(env);
  env.tick(1);
  expect(motion.progress).toBe(0);
  expect(env.env.start).not.toHaveBeenCalled();
  motion.dispose();
  expect(await motion.finished).toEqual({ status: "cancelled" });
  expect(env.controls!.enabled).toBe(true);
});

test("invalid or pre-aborted requests leave the existing transition and subscriptions intact", async () => {
  const env = fixture(true);
  const first = start(env);
  for (const duration of [0, -1, NaN, Infinity])
    expect(() => start(env, { duration })).toThrow(RangeError);
  expect(() => transitionToObject(env.app, new Group(), { controls: env.controls })).toThrow(
    RangeError,
  );
  const signal = new AbortController();
  signal.abort();
  const aborted = start(env, { signal: signal.signal });
  expect(await aborted.finished).toEqual({ status: "cancelled" });
  expect(first.state).toBe("running");
  expect(env.updates.size).toBe(2);
  first.cancel();
});

test("superseding a request replaces one subscription and preserves the original controls lease", async () => {
  const env = fixture(true);
  const first = start(env);
  env.tick(0.2);
  env.object.position.x = -30;
  const second = start(env);
  expect(await first.finished).toEqual({ status: "cancelled" });
  expect(env.updates.size).toBe(2);
  expect(env.controls!.enabled).toBe(false);
  env.tick(1);
  expect((await second.finished).status).toBe("completed");
  expect(env.controls!.enabled).toBe(true);
  expect(env.controls!.enableDamping).toBe(true);
});

test("instant fitting cancels a transition before applying the new view", async () => {
  const env = fixture(true);
  const motion = start(env);
  env.tick(0.25);
  const frame = fitObject(env.app, env.object, { controls: env.controls });
  expect(await motion.finished).toEqual({ status: "cancelled" });
  expect(env.camera.position.distanceTo(frame.position)).toBeLessThan(1e-10);
  expect(env.updates.size).toBe(1);
});

test("signal and manual cancellation keep the current pose and clean event bindings exactly once", async () => {
  for (const mode of ["signal", "manual"] as const) {
    const env = fixture(true);
    const signal = new AbortController();
    const remove = vi.spyOn(env.canvas, "removeEventListener");
    const motion = start(env, { signal: signal.signal });
    env.tick(0.3);
    const pose = env.camera.position.clone();
    if (mode === "signal") signal.abort();
    else motion.cancel();
    expect(await motion.finished).toEqual({ status: "cancelled" });
    motion.cancel();
    motion.dispose();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(env.camera.position).toEqual(pose);
    expect(env.updates.size).toBe(1);
    expect(env.controls!.enabled).toBe(true);
  }
});

test("canvas pointer or wheel input cancels without consuming the event", async () => {
  for (const name of ["pointerdown", "wheel"]) {
    const env = fixture(true);
    const motion = start(env);
    const event = new Event(name, { cancelable: true });
    env.canvas.dispatchEvent(event);
    expect(await motion.finished).toEqual({ status: "cancelled" });
    expect(event.defaultPrevented).toBe(false);
    expect(env.controls!.enabled).toBe(true);
  }
});

test("viewport, frustum, pose and constraint changes cancel instead of overwriting external state", async () => {
  const changes: Array<(env: ReturnType<typeof fixture>) => void> = [
    (env) => {
      env.env.size.width = 500;
    },
    (env) => {
      env.camera.zoom = 2;
    },
    (env) => {
      env.camera.position.x += 2;
    },
    (env) => {
      env.controls!.target.x += 1;
    },
    (env) => {
      env.controls!.maxDistance = 500;
    },
    (env) => {
      env.camera.near = 0.05;
    },
  ];
  for (const change of changes) {
    const env = fixture(true);
    const motion = start(env);
    env.tick(0.1);
    change(env);
    env.tick(0.1);
    expect(await motion.finished).toEqual({ status: "cancelled" });
    expect(env.updates.size).toBe(1);
  }
  const env = fixture();
  const motion = start(env);
  env.camera.quaternion.set(NaN, 0, 0, 1);
  env.tick(0.1);
  expect(await motion.finished).toEqual({ status: "cancelled" });
});

test("observable controls configuration changes remain preserved during lease cleanup", async () => {
  const env = fixture(true);
  const motion = start(env);
  env.controls!.autoRotate = true;
  env.tick(0.1);
  expect(await motion.finished).toEqual({ status: "cancelled" });
  expect(env.controls!.autoRotate).toBe(true);
  expect(env.controls!.enableDamping).toBe(true);
});

test("scope disposal and native change-event cancellation cannot snap the camera to the final frame", async () => {
  for (const mode of ["scope", "change"] as const) {
    const env = fixture(true);
    const motion = start(env);
    const target = env.object.position.clone();
    if (mode === "scope") env.env.resources.dispose();
    else {
      env.controls!.addEventListener("change", () => motion.cancel());
      env.tick(0.25);
    }
    expect(await motion.finished).toEqual({ status: "cancelled" });
    expect(env.controls!.target.distanceTo(target)).toBeGreaterThan(1);
    expect(env.updates.size).toBe(1);
  }
});

test("native update failures resolve failed, restore controls, detach, and still propagate to the host loop", async () => {
  const env = fixture(true);
  const motion = start(env);
  const error = new Error("consumer callback");
  const changed = (): void => {
    throw error;
  };
  env.controls!.addEventListener("change", changed);
  expect(() => env.tick(0.25)).toThrow(error);
  expect(await motion.finished).toEqual({ status: "failed", error });
  expect(env.controls!.enabled).toBe(true);
  expect(env.updates.size).toBe(1);
  env.controls!.removeEventListener("change", changed);
  const next = start(env);
  next.cancel();
});

test("reentrant fit or transition creation is rejected while native update can still cancel the current motion", async () => {
  const env = fixture(true);
  const motion = start(env);
  env.controls!.addEventListener("change", () => {
    expect(() => start(env)).toThrow("already in progress");
    expect(() => fitObject(env.app, env.object, { controls: env.controls })).toThrow(
      "already in progress",
    );
    motion.cancel();
  });
  env.tick(0.25);
  expect(await motion.finished).toEqual({ status: "cancelled" });
});

test("cleanup failure is reported through the result while remaining cleanup continues", async () => {
  const env = fixture(true);
  const motion = start(env);
  const failure = new Error("listener cleanup");
  vi.spyOn(env.canvas, "removeEventListener").mockImplementation(() => {
    throw failure;
  });
  motion.cancel();
  const result = await motion.finished;
  expect(result.status).toBe("failed");
  if (result.status !== "failed") throw new Error("Expected cleanup failure");
  expect(result.error).toBeInstanceOf(AggregateError);
  expect(env.controls!.enabled).toBe(true);
  expect(env.updates.size).toBe(1);
});

test("different hosts have independent transitions and retained clipping mode is respected", async () => {
  const a = fixture();
  const b = fixture();
  const first = start(a, { adjustClipping: false });
  const second = start(b);
  first.cancel();
  b.tick(1);
  expect(await first.finished).toEqual({ status: "cancelled" });
  expect((await second.finished).status).toBe("completed");
  expect(a.camera.near).toBe(0.1);
  expect(a.camera.far).toBe(1000);
});
