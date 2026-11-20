import { expect, test, vi } from "vite-plus/test";
import { captureRenderStats, attachRenderMonitor } from "../src/rendering.ts";
import { ResourceScope } from "../src/core/resources.ts";
import type { FrameInfo, SceneApp, ThreeAppState } from "../src/index.ts";

function fixture(node = false) {
  let time = 0;
  const updates = new Set<(frame: FrameInfo) => void>();
  const resources = new ResourceScope();
  const controller = new AbortController();
  const info = node
    ? {
        autoReset: true,
        render: { calls: 999, drawCalls: 3, triangles: 12, lines: 2, points: 1 },
        memory: { programs: 4, geometries: 2, textures: 5, total: 1024 },
        reset: vi.fn(),
      }
    : {
        autoReset: true,
        render: { calls: 3, triangles: 12, lines: 2, points: 1 },
        memory: { geometries: 2, textures: 5 },
        programs: [{}, {}],
        reset: vi.fn(),
      };
  const state = {
    resources,
    signal: controller.signal,
    state: "running" as ThreeAppState,
    rendererType: node ? "webgpu" : "webgl",
    backend: "webgl2",
    size: { width: 640, height: 360, pixelRatio: 2 },
    renderer: {
      info,
      domElement: {
        ownerDocument: { hidden: false, defaultView: { performance: { now: () => time } } },
      },
    },
    onAfterRender(callback: (frame: FrameInfo) => void) {
      updates.add(callback);
      return () => {
        updates.delete(callback);
      };
    },
  };
  const app = state as unknown as SceneApp;
  return {
    app,
    state,
    resources,
    updates,
    info,
    step(ms: number, delta = 0.1) {
      time = ms;
      for (const callback of Array.from(updates))
        if (updates.has(callback)) callback({ delta, elapsed: delta });
    },
  };
}
test("snapshots normalize real renderer field semantics and never reset counters", () => {
  for (const node of [false, true]) {
    const env = fixture(node);
    const stats = captureRenderStats(env.app);
    expect(stats.drawCalls).toBe(3);
    expect(stats.triangles).toBe(12);
    expect(stats.programs).toBe(node ? 4 : 2);
    expect(stats.estimatedBytes).toBe(node ? 1024 : null);
    expect(stats.backend).toBe("webgl2");
    expect(stats.autoReset).toBe(true);
    expect(env.info.reset).not.toHaveBeenCalled();
    expect(env.info.autoReset).toBe(true);
  }
});
test("snapshots are deeply independent and do not retain native resources", () => {
  const env = fixture();
  const stats = captureRenderStats(env.app);
  env.info.memory.textures = 99;
  env.state.size.width = 1;
  expect(stats.textures).toBe(5);
  expect(stats.viewport.width).toBe(640);
  expect(Object.isFrozen(stats)).toBe(true);
  expect(Object.isFrozen(stats.viewport)).toBe(true);
  expect(Object.values(stats).some((value) => value === env.info)).toBe(false);
});
test("FPS uses wall-clock draw intervals rather than clamped simulation delta", () => {
  const env = fixture();
  const callback = vi.fn();
  const monitor = attachRenderMonitor(env.app, { sampleInterval: 0, onSample: callback });
  env.step(0, 0);
  env.step(100, 0.1);
  env.step(300, 0.1);
  expect(monitor.snapshot.draws).toBe(3);
  expect(monitor.snapshot.fps).toBe(5);
  expect(monitor.snapshot.frameIntervalMs).toBe(200);
  expect(callback).toHaveBeenCalledTimes(3);
  env.resources.dispose();
});
test("coarse performance timestamps retain zero-length intervals without inventing infinite FPS", () => {
  const env = fixture();
  const monitor = attachRenderMonitor(env.app, { sampleInterval: 0 });
  env.step(0, 0);
  env.step(10);
  env.step(10);
  expect(monitor.snapshot.fps).toBeNull();
  env.step(110);
  expect(monitor.snapshot.fps).toBe(20);
  expect(monitor.snapshot.frameIntervalMs).toBe(50);
  env.resources.dispose();
});

test("callback throttling does not prevent per-draw snapshots or mutate native info", () => {
  const env = fixture(true);
  const callback = vi.fn();
  const monitor = attachRenderMonitor(env.app, { onSample: callback });
  env.step(0, 0);
  env.step(100);
  env.info.memory.textures = 6;
  env.step(200);
  expect(callback).toHaveBeenCalledTimes(1);
  expect(monitor.snapshot.stats.textures).toBe(6);
  env.step(500);
  expect(callback).toHaveBeenCalledTimes(2);
  expect(monitor.snapshot.frameIntervalMs).toBe(200);
  expect(env.info.reset).not.toHaveBeenCalled();
  env.resources.dispose();
});
test("manual draws and stop/resume clear timing windows without including the idle gap", () => {
  const env = fixture();
  const monitor = attachRenderMonitor(env.app, { sampleInterval: 0 });
  env.step(0, 0);
  env.step(10);
  env.step(20);
  expect(monitor.snapshot.fps).toBe(100);
  env.state.state = "stopped";
  expect(monitor.read().fps).toBeNull();
  env.step(10000, 0);
  expect(monitor.snapshot.fps).toBeNull();
  expect(monitor.snapshot.draws).toBe(4);
  env.state.state = "running";
  env.step(20000, 0);
  env.step(20010);
  env.step(20030);
  expect(monitor.snapshot.fps).toBe(50);
  env.resources.dispose();
});
test("explicit reads clear stale timing while hidden or zero sized", () => {
  const env = fixture();
  const monitor = attachRenderMonitor(env.app, { sampleInterval: 0 });
  env.step(0, 0);
  env.step(10);
  env.step(20);
  expect(monitor.snapshot.fps).toBe(100);
  env.state.size.height = 0;
  expect(monitor.read().fps).toBeNull();
  env.state.size.height = 360;
  env.step(10000, 0);
  env.step(10010);
  env.step(10020);
  expect(monitor.snapshot.fps).toBe(100);
  env.state.renderer.domElement.ownerDocument.hidden = true;
  expect(monitor.read().fps).toBeNull();
  env.resources.dispose();
});

test("manual reads invoke no callbacks and perform no render or subscription work", () => {
  const env = fixture();
  const callback = vi.fn();
  const monitor = attachRenderMonitor(env.app, { onSample: callback });
  env.info.memory.geometries = 8;
  const snapshot = monitor.read();
  expect(snapshot.stats.geometries).toBe(8);
  expect(snapshot.draws).toBe(0);
  expect(callback).not.toHaveBeenCalled();
  expect(env.updates.size).toBe(1);
  env.resources.dispose();
});
test("model scope disposal retains the last snapshot and leaves another monitor independent", () => {
  const first = fixture(),
    second = fixture(true),
    scope = new ResourceScope();
  const a = attachRenderMonitor(first.app, { scope }),
    b = attachRenderMonitor(second.app);
  first.step(0, 0);
  const saved = a.snapshot;
  scope.dispose();
  expect(a.disposed).toBe(true);
  expect(a.snapshot).toBe(saved);
  expect(first.updates.size).toBe(0);
  expect(() => a.read()).toThrow("disposed");
  second.step(0, 0);
  expect(b.snapshot.draws).toBe(1);
  first.resources.dispose();
  second.resources.dispose();
});
test("callbacks can dispose without another notification and errors remain observable", () => {
  const env = fixture();
  const monitor = attachRenderMonitor(env.app, { onSample: () => monitor.dispose() });
  env.step(0, 0);
  expect(monitor.disposed).toBe(true);
  expect(env.updates.size).toBe(0);
  const other = fixture();
  attachRenderMonitor(other.app, {
    onSample: () => {
      throw new Error("observer");
    },
  });
  expect(() => other.step(0, 0)).toThrow("observer");
  other.resources.dispose();
  expect(other.updates.size).toBe(0);
});
test("invalid options and ended owners allocate no subscriptions", () => {
  const env = fixture();
  for (const sampleInterval of [-1, Infinity, NaN])
    expect(() => attachRenderMonitor(env.app, { sampleInterval })).toThrow(RangeError);
  expect(() => Reflect.apply(attachRenderMonitor, undefined, [env.app, { onSample: 1 }])).toThrow(
    TypeError,
  );
  const scope = new ResourceScope();
  scope.dispose();
  expect(() => attachRenderMonitor(env.app, { scope })).toThrow("disposed");
  env.resources.dispose();
  expect(() => captureRenderStats(env.app)).toThrow("disposed");
  expect(() => attachRenderMonitor(env.app)).toThrow("disposed");
  expect(env.updates.size).toBe(0);
});
