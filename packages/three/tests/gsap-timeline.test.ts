import { expect, test, vi } from "vite-plus/test";
import { gsap } from "gsap";
import { attachGSAPTimeline } from "../src/animation.ts";
import { ResourceScope } from "../src/core/resources.ts";
import type { SceneApp, FrameInfo } from "../src/index.ts";

function fixture() {
  const resources = new ResourceScope(),
    controller = new AbortController();
  const updates = new Set<(frame: FrameInfo) => void>();
  const app = {
    resources,
    signal: controller.signal,
    onUpdate(callback: (frame: FrameInfo) => void) {
      updates.add(callback);
      return () => {
        updates.delete(callback);
      };
    },
  } as SceneApp;
  return {
    app,
    resources,
    updates,
    tick(delta: number) {
      for (const callback of Array.from(updates))
        if (updates.has(callback)) callback({ delta, elapsed: delta });
    },
  };
}
test("real GSAP timeline uses host delta, pauses, seeks, changes speed and finishes", () => {
  const env = fixture(),
    value = { x: 0 };
  const complete = vi.fn();
  const timeline = gsap
    .timeline({ paused: true, onComplete: complete })
    .to(value, { x: 10, duration: 1, ease: "none" });
  const handle = attachGSAPTimeline(env.app, timeline);
  expect(timeline.paused()).toBe(true);
  env.tick(0.25);
  expect(value.x).toBeCloseTo(2.5);
  handle.pause();
  env.tick(0.25);
  expect(value.x).toBeCloseTo(2.5);
  handle.seek(0.5);
  expect(value.x).toBeCloseTo(5);
  expect(complete).not.toHaveBeenCalled();
  handle.setPlaybackRate(2);
  handle.resume();
  env.tick(0.25);
  expect(value.x).toBe(10);
  expect(handle.state).toBe("finished");
  expect(complete).toHaveBeenCalledTimes(1);
  handle.restart();
  env.tick(0.125);
  expect(value.x).toBeCloseTo(2.5);
  env.resources.dispose();
  expect(handle.disposed).toBe(true);
  expect(env.updates.size).toBe(0);
});
test("two hosts and a normal GSAP UI timeline keep independent ownership and clocks", () => {
  const first = fixture(),
    second = fixture();
  const a = { x: 0 },
    b = { x: 0 },
    ui = { x: 0 };
  const one = gsap.timeline({ paused: true }).to(a, { x: 1, duration: 1, ease: "none" });
  const two = gsap.timeline({ paused: true }).to(b, { x: 1, duration: 1, ease: "none" });
  const ordinary = gsap.timeline({ paused: true }).to(ui, { x: 1, duration: 1, ease: "none" });
  attachGSAPTimeline(first.app, one);
  attachGSAPTimeline(second.app, two);
  first.tick(0.5);
  expect(a.x).toBe(0.5);
  expect(b.x).toBe(0);
  ordinary.totalTime(0.2);
  first.resources.dispose();
  second.tick(0.3);
  expect(b.x).toBe(0.3);
  expect(ui.x).toBe(0.2);
  ordinary.kill();
  second.resources.dispose();
});
test("model scope and app scope kill only once, with no value restoration", () => {
  const env = fixture(),
    scope = new ResourceScope(),
    value = { x: 0 };
  const timeline = gsap.timeline({ paused: true }).to(value, { x: 1, duration: 1, ease: "none" });
  const kill = vi.spyOn(timeline, "kill");
  const handle = attachGSAPTimeline(env.app, timeline, { scope, autoPlay: false });
  env.tick(1);
  expect(value.x).toBe(0);
  handle.seek(0.4);
  scope.dispose();
  env.resources.dispose();
  handle.dispose();
  expect(kill).toHaveBeenCalledTimes(1);
  expect(value.x).toBe(0.4);
});
test("native completion callback can restart without recursive GSAP sampling", () => {
  const env = fixture(),
    value = { x: 0 };
  const timeline = gsap.timeline({ paused: true }).to(value, { x: 1, duration: 1 });
  const handle = attachGSAPTimeline(env.app, timeline);
  timeline.eventCallback("onComplete", () => handle.restart());
  env.tick(1);
  expect(handle.state).toBe("playing");
  expect(handle.time).toBe(0);
  expect(value.x).toBe(0);
  env.tick(0.5);
  expect(handle.time).toBe(0.5);
  env.resources.dispose();
});
test("dispose in a native callback retires the timeline after sampling", () => {
  const env = fixture(),
    value = { x: 0 };
  const timeline = gsap.timeline({ paused: true }).to(value, { x: 1, duration: 1 });
  const handle = attachGSAPTimeline(env.app, timeline);
  timeline.eventCallback("onUpdate", () => handle.dispose());
  env.tick(0.2);
  expect(handle.disposed).toBe(true);
  expect(env.updates.size).toBe(0);
  env.tick(1);
  expect(handle.time).toBe(0.2);
  env.resources.dispose();
});
test("finite repeats and yoyo use GSAP's total time, with silent endpoint seek", () => {
  const env = fixture(),
    value = { x: 0 },
    repeated = vi.fn(),
    completed = vi.fn();
  const timeline = gsap
    .timeline({ paused: true, repeat: 1, yoyo: true, onRepeat: repeated, onComplete: completed })
    .to(value, { x: 1, duration: 1, ease: "none" });
  const handle = attachGSAPTimeline(env.app, timeline);
  expect(handle.duration).toBe(2);
  env.tick(1.5);
  expect(value.x).toBe(0.5);
  expect(repeated).toHaveBeenCalledTimes(1);
  handle.seek(2);
  expect(value.x).toBe(0);
  expect(completed).not.toHaveBeenCalled();
  env.resources.dispose();
});
test("invalid configuration and duplicate ownership leave the caller's timeline intact", () => {
  const env = fixture(),
    value = { x: 0 };
  const timeline = gsap.timeline({ paused: true }).to(value, { x: 1, duration: 1 });
  expect(() => attachGSAPTimeline(env.app, timeline, { playbackRate: -1 })).toThrow(RangeError);
  const handle = attachGSAPTimeline(env.app, timeline);
  expect(() => attachGSAPTimeline(fixture().app, timeline)).toThrow("distinct");
  for (const seconds of [-1, NaN, Infinity, 2])
    expect(() => handle.seek(seconds)).toThrow(RangeError);
  handle.setPlaybackRate(0);
  env.tick(1);
  expect(handle.time).toBe(0);
  const playing = gsap.timeline().to({ x: 0 }, { x: 1, duration: 1 });
  expect(() => attachGSAPTimeline(env.app, playing)).toThrow("paused root");
  playing.kill();
  env.resources.dispose();
});
