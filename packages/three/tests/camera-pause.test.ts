import { expect, test, vi } from "vite-plus/test";
import { BoxGeometry, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  captureCameraView,
  transitionToCameraView,
  transitionToObject,
  transitionOrthographicToObject,
} from "../src/camera.ts";
import type { CameraTransitionHandle, CameraViewTransitionHandle } from "../src/camera.ts";
import type { AnyThreeApp, ThreeApp, OrthographicThreeApp, FrameInfo } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";

type Mode = "perspective-frame" | "orthographic-frame" | "perspective-view" | "orthographic-view";
const modes: Mode[] = [
  "perspective-frame",
  "orthographic-frame",
  "perspective-view",
  "orthographic-view",
];
type Motion = CameraTransitionHandle | CameraViewTransitionHandle;
function fixture(mode: Mode) {
  const camera = mode.startsWith("orthographic")
    ? new OrthographicCamera(-8, 8, 4, -4, 0, 1000)
    : new PerspectiveCamera(50, 2, 0.1, 1000);
  camera.position.set(3, 2, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const controls = new OrbitControls(camera);
  controls.update(0);
  controls.enableDamping = true;
  const object = new Mesh(new BoxGeometry(2, 4, 3), new MeshBasicMaterial());
  object.position.set(20, 10, -15);
  const updates = new Set<(frame: FrameInfo) => void>(),
    canvas = new EventTarget(),
    resources = new ResourceScope();
  resources.track(object.geometry);
  resources.track(object.material);
  const value = {
    camera,
    resources,
    state: "running",
    size: { width: 800, height: 400, pixelRatio: 1 },
    renderer: { domElement: canvas, render: vi.fn() },
    start: vi.fn(),
    onUpdate(callback: (frame: FrameInfo) => void) {
      updates.add(callback);
      return () => {
        updates.delete(callback);
      };
    },
  };
  const app = value as unknown as AnyThreeApp,
    view = captureCameraView(app, { controls });
  if (mode.endsWith("view")) {
    camera.position.set(8, 4, 9);
    camera.zoom = 2;
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  }
  let ticks = 0;
  return {
    camera,
    controls,
    object,
    updates,
    canvas,
    resources,
    value,
    get ticks() {
      return ticks;
    },
    start(signal?: AbortSignal): Motion {
      const options = { controls, duration: 1, signal };
      if (mode.endsWith("view")) return transitionToCameraView(app, view, options);
      return camera instanceof OrthographicCamera
        ? transitionOrthographicToObject(app as OrthographicThreeApp, object, options)
        : transitionToObject(app as ThreeApp, object, options);
    },
    tick(delta: number) {
      ticks++;
      for (const callback of Array.from(updates))
        if (updates.has(callback)) callback({ delta, elapsed: delta });
    },
  };
}

for (const mode of modes) {
  test(`${mode} terminal sampling wins over a deferred pause and pre-aborted controls are inert`, async () => {
    const env = fixture(mode),
      abort = new AbortController();
    abort.abort();
    const cancelled = env.start(abort.signal);
    cancelled.pause();
    cancelled.resume();
    expect(await cancelled.finished).toMatchObject({ status: "cancelled" });
    const motion = env.start(),
      native = env.controls.update.bind(env.controls);
    const update = vi.spyOn(env.controls, "update").mockImplementation((delta) => {
      motion.pause();
      return native(delta);
    });
    env.tick(1);
    expect((await motion.finished).status).toBe("completed");
    update.mockRestore();
    env.resources.dispose();
  });

  test(`${mode} callback pause/resume ordering is preserved and failures still settle`, async () => {
    const env = fixture(mode),
      motion = env.start(),
      native = env.controls.update.bind(env.controls);
    const update = vi.spyOn(env.controls, "update").mockImplementation((delta) => {
      motion.pause();
      motion.resume();
      return native(delta);
    });
    env.tick(0.25);
    expect(motion.state).toBe("running");
    const failure = new Error("native pause failure");
    update.mockImplementation(() => {
      motion.pause();
      throw failure;
    });
    expect(() => env.tick(0.25)).toThrow(failure);
    expect(await motion.finished).toMatchObject({ status: "failed", error: failure });
    motion.resume();
    expect(motion.state).toBe("failed");
    expect(env.updates.size).toBe(0);
    expect(env.controls.enabled).toBe(true);
    update.mockRestore();
    env.resources.dispose();
  });
  test(`${mode} pauses only its clock, retains the input lease and resumes the remaining duration`, async () => {
    const env = fixture(mode),
      motion = env.start(),
      settled = vi.fn();
    void motion.finished.then(settled);
    motion.pause();
    motion.pause();
    const position = env.camera.position.clone(),
      zoom = env.camera.zoom;
    expect(motion.state).toBe("paused");
    env.tick(10);
    env.tick(10);
    await Promise.resolve();
    expect(env.ticks).toBe(2);
    expect(motion.progress).toBe(0);
    expect(settled).not.toHaveBeenCalled();
    expect(env.camera.position.equals(position)).toBe(true);
    expect(env.camera.zoom).toBe(zoom);
    expect(env.controls.enabled).toBe(false);
    expect(env.updates.size).toBe(1);
    motion.resume();
    env.tick(0.25);
    expect(motion.progress).toBe(0.25);
    motion.pause();
    env.tick(100);
    expect(motion.progress).toBe(0.25);
    motion.resume();
    motion.resume();
    env.tick(0.75);
    expect((await motion.finished).status).toBe("completed");
    motion.pause();
    motion.resume();
    expect(motion.state).toBe("completed");
    expect(env.controls.enabled).toBe(true);
    expect(env.controls.enableDamping).toBe(true);
    expect(env.updates.size).toBe(0);
    expect(env.value.start).not.toHaveBeenCalled();
    expect(env.value.renderer.render).not.toHaveBeenCalled();
    env.resources.dispose();
  });

  test.each(["wheel", "abort", "scope", "replace", "external"] as const)(
    `${mode} settles and releases a paused lease: %s`,
    async (reason) => {
      const env = fixture(mode),
        abort = new AbortController(),
        motion = env.start(abort.signal);
      motion.pause();
      let replacement: Motion | undefined;
      if (reason === "wheel") env.canvas.dispatchEvent(new Event("wheel"));
      if (reason === "abort") abort.abort();
      if (reason === "scope") env.resources.dispose();
      if (reason === "replace") replacement = env.start();
      if (reason === "external") {
        env.camera.zoom = 3;
        env.tick(0.2);
        expect(env.camera.zoom).toBe(3);
      }
      expect(await motion.finished).toMatchObject({ status: "cancelled" });
      motion.resume();
      expect(motion.state).toBe("cancelled");
      replacement?.cancel();
      expect(env.updates.size).toBe(0);
      expect(env.controls.enabled).toBe(true);
      env.resources.dispose();
    },
  );

  test(`${mode} native callback pause waits for the current pose to commit`, async () => {
    const env = fixture(mode),
      motion = env.start();
    const native = env.controls.update.bind(env.controls);
    const update = vi.spyOn(env.controls, "update").mockImplementation((delta) => {
      motion.pause();
      expect(motion.state).toBe("running");
      return native(delta);
    });
    env.tick(0.25);
    expect(motion.state).toBe("paused");
    expect(motion.progress).toBe(0.25);
    const position = env.camera.position.clone();
    env.tick(10);
    expect(env.camera.position.equals(position)).toBe(true);
    update.mockRestore();
    motion.resume();
    env.tick(0.75);
    expect((await motion.finished).status).toBe("completed");
    env.resources.dispose();
  });

  test(`${mode} initial pause requests still install a usable subscription`, async () => {
    const env = fixture(mode),
      track = env.resources.track.bind(env.resources);
    const tracked = vi.spyOn(env.resources, "track").mockImplementation((resource) => {
      const result = track(resource);
      (resource as Motion).pause();
      return result;
    });
    const motion = env.start();
    tracked.mockRestore();
    expect(motion.state).toBe("paused");
    expect(env.updates.size).toBe(1);
    env.tick(2);
    expect(motion.progress).toBe(0);
    motion.resume();
    env.tick(1);
    expect((await motion.finished).status).toBe("completed");
    env.resources.dispose();
  });
}
