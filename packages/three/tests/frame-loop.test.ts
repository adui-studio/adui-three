import { expect, test, vi } from "vite-plus/test";
import { FrameLoop } from "../src/frame-loop.ts";
import type { FrameInfo } from "../src/frame-loop.ts";

function scheduler() {
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    callbacks,
    request(callback: FrameRequestCallback): number {
      callbacks.set(++id, callback);
      return id;
    },
    cancel(handle: number): void {
      callbacks.delete(handle);
    },
    step(time: number): void {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(time);
    },
  };
}

test("start is idempotent, stop cancels, and restart resets delta", () => {
  const clock = scheduler();
  const frames: FrameInfo[] = [];
  const loop = new FrameLoop(clock, (frame) => frames.push(frame), 0.1);
  loop.start();
  loop.start();
  expect(clock.callbacks.size).toBe(1);
  clock.step(1000);
  clock.step(1050);
  clock.step(5000);
  expect(frames.map((frame) => frame.delta)).toEqual([0, 0.05, 0.1]);
  expect(frames[2]?.elapsed).toBeCloseTo(0.15);
  loop.stop();
  loop.stop();
  expect(clock.callbacks.size).toBe(0);
  loop.start();
  clock.step(10000);
  expect(frames.at(-1)?.delta).toBe(0);
  loop.stop();
});

test("stale callbacks cannot restart or render an older run", () => {
  const clock = scheduler();
  const update = vi.fn();
  const loop = new FrameLoop(clock, update, 0.1);
  loop.start();
  const stale = [...clock.callbacks.values()][0]!;
  loop.stop();
  loop.start();
  stale(1000);
  expect(update).not.toHaveBeenCalled();
  expect(clock.callbacks.size).toBe(1);
  loop.stop();
});

test("stop/start inside a callback schedules exactly one new run", () => {
  const clock = scheduler();
  const loop = new FrameLoop(
    clock,
    () => {
      loop.stop();
      loop.start();
    },
    0.1,
  );
  loop.start();
  clock.step(0);
  expect(clock.callbacks.size).toBe(1);
  loop.stop();
});

test("a callback failure stops the loop and allows a clean restart", () => {
  const clock = scheduler();
  const update = vi.fn().mockImplementationOnce(() => {
    throw new Error("update failed");
  });
  const loop = new FrameLoop(clock, update, 0.1);
  loop.start();
  expect(() => clock.step(0)).toThrow("update failed");
  expect(clock.callbacks.size).toBe(0);
  loop.start();
  clock.step(3000);
  expect(update).toHaveBeenLastCalledWith({ delta: 0, elapsed: 0 });
  loop.stop();
});
