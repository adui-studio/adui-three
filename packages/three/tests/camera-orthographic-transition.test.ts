import { expect, test, vi } from "vite-plus/test";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, OrthographicCamera } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { fitOrthographicObject, transitionOrthographicToObject } from "../src/camera.ts";
import type { CameraTransitionOptions } from "../src/camera.ts";
import type { OrthographicThreeApp, ThreeAppState, FrameInfo } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";

function fixture(orbit = false) {
  const camera = new OrthographicCamera(-8, 8, 4, -4, 0, 1000);
  camera.position.set(4, 3, 8);
  camera.lookAt(0, 0, 0);
  camera.zoom = 2;
  camera.updateProjectionMatrix();
  const object = new Mesh(new BoxGeometry(2, 4, 3), new MeshBasicMaterial());
  object.position.set(20, 10, -15);
  const updates = new Set<(frame: FrameInfo) => void>(),
    canvas = new EventTarget();
  const env = {
    camera,
    state: "running" as ThreeAppState,
    size: { width: 800, height: 400, pixelRatio: 2 },
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
  // Native controls remain unconnected; these fixtures own no DOM/GPU resources.
  const controls = orbit ? new OrbitControls(camera) : undefined;
  if (controls) {
    controls.enableDamping = true;
    env.onUpdate(({ delta }) => controls.update(delta));
  }
  const app = env as unknown as OrthographicThreeApp;
  return {
    camera,
    object,
    canvas,
    controls,
    env,
    app,
    updates,
    start(options: CameraTransitionOptions = {}) {
      return transitionOrthographicToObject(app, object, { duration: 1, controls, ...options });
    },
    tick(delta: number) {
      if (env.state !== "running" || !env.size.width || !env.size.height) return;
      for (const callback of Array.from(updates))
        if (updates.has(callback)) callback({ delta, elapsed: delta });
    },
  };
}

test("orthographic motion interpolates zoom and pose, accepts starting near zero and completes without drawing", async () => {
  const env = fixture(),
    startZoom = env.camera.zoom,
    pose = env.camera.position.clone();
  const motion = env.start();
  expect(env.camera.near).toBe(0);
  expect(env.camera.zoom).toBe(startZoom);
  expect(env.env.start).not.toHaveBeenCalled();
  expect(env.env.renderer.render).not.toHaveBeenCalled();
  env.tick(0.5);
  const midpoint = env.camera.zoom;
  expect(env.camera.position.distanceTo(pose)).toBeGreaterThan(0);
  expect(motion.progress).toBe(0.5);
  env.tick(0.5);
  const result = await motion.finished;
  if (result.status !== "completed") throw new Error("Expected completed frame");
  expect(env.camera.zoom).toBe(result.frame.zoom);
  expect(midpoint).toBeCloseTo((startZoom + result.frame.zoom) / 2);
  expect(env.camera.near).toBe(result.frame.near);
  expect(env.camera.far).toBe(result.frame.far);
  expect(env.updates.size).toBe(0);
  expect(motion.progress).toBe(1);
});

test("orthographic native controls keep target and zoom independent and restore their leased configuration", async () => {
  const env = fixture(true);
  env.controls!.autoRotate = true;
  const motion = env.start({ direction: [-1, 1, -1] });
  expect(env.controls).toMatchObject({ enabled: false, enableDamping: false, autoRotate: false });
  env.tick(0.4);
  const zoom = env.camera.zoom;
  expect(zoom).toBeGreaterThan(0);
  expect(env.camera.position.toArray().every(Number.isFinite)).toBe(true);
  env.tick(0.6);
  expect((await motion.finished).status).toBe("completed");
  expect(env.controls).toMatchObject({ enabled: true, enableDamping: true, autoRotate: true });
  expect(env.controls!.target.toArray()).toEqual(env.object.position.toArray());
  expect(env.updates.size).toBe(1);
});

test("orthographic host pause freezes zoom and progress while resumption follows only host delta", async () => {
  const env = fixture(),
    motion = env.start();
  env.tick(0.2);
  const zoom = env.camera.zoom;
  env.env.state = "stopped";
  env.tick(99);
  expect(motion.progress).toBe(0.2);
  expect(env.camera.zoom).toBe(zoom);
  env.env.state = "running";
  env.env.size.height = 0;
  env.tick(99);
  expect(motion.progress).toBe(0.2);
  env.env.size.height = 400;
  env.tick(0.8);
  expect((await motion.finished).status).toBe("completed");
});

test("invalid and pre-aborted orthographic requests retain an existing valid transition", async () => {
  const env = fixture(true),
    first = env.start();
  expect(() => env.start({ duration: 0 })).toThrow(RangeError);
  expect(() => transitionOrthographicToObject(env.app, new Group())).toThrow("bounds");
  const abort = new AbortController();
  abort.abort();
  expect(await env.start({ signal: abort.signal }).finished).toEqual({ status: "cancelled" });
  expect(first.state).toBe("running");
  expect(env.updates.size).toBe(2);
  first.cancel();
});

test("replacement and instantaneous orthographic fitting end previous subscriptions and preserve control leases", async () => {
  const env = fixture(true),
    first = env.start();
  env.tick(0.2);
  const second = env.start();
  expect(await first.finished).toEqual({ status: "cancelled" });
  expect(env.updates.size).toBe(2);
  expect(env.controls!.enabled).toBe(false);
  const frame = fitOrthographicObject(env.app, env.object, { controls: env.controls });
  expect(await second.finished).toEqual({ status: "cancelled" });
  expect(env.camera.zoom).toBe(frame.zoom);
  expect(env.updates.size).toBe(1);
  expect(env.controls!.enabled).toBe(true);
  expect(env.controls!.enableDamping).toBe(true);
});

test("external orthographic zoom, frustum, viewport and control zoom constraints cancel without overwrite", async () => {
  const changes: Array<(env: ReturnType<typeof fixture>) => void> = [
    (env) => {
      env.camera.zoom = 3;
    },
    (env) => {
      env.camera.left -= 1;
    },
    (env) => {
      env.camera.top += 1;
    },
    (env) => {
      env.env.size.width = 300;
    },
    (env) => {
      env.controls!.maxZoom = 3;
    },
    (env) => {
      env.controls!.minZoom = 0.1;
    },
  ];
  for (const change of changes) {
    const env = fixture(true),
      motion = env.start();
    env.tick(0.2);
    change(env);
    const zoom = env.camera.zoom,
      left = env.camera.left;
    env.tick(0.1);
    expect(await motion.finished).toEqual({ status: "cancelled" });
    expect(env.camera.zoom).toBe(zoom);
    expect(env.camera.left).toBe(left);
    expect(env.controls!.enabled).toBe(true);
    expect(env.updates.size).toBe(1);
  }
});

test("orthographic pointer/wheel and signal cancellation retain the sampled zoom and clear listeners once", async () => {
  for (const mode of ["pointerdown", "wheel", "signal"] as const) {
    const env = fixture(true),
      abort = new AbortController(),
      remove = vi.spyOn(env.canvas, "removeEventListener");
    const motion = env.start({ signal: abort.signal });
    env.tick(0.3);
    const zoom = env.camera.zoom;
    if (mode === "signal") abort.abort();
    else env.canvas.dispatchEvent(new Event(mode));
    expect(await motion.finished).toEqual({ status: "cancelled" });
    motion.cancel();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(env.camera.zoom).toBe(zoom);
    expect(env.controls!.enabled).toBe(true);
  }
});

test("orthographic scope disposal stops only its own transition and restores borrowed controls", async () => {
  const a = fixture(true),
    b = fixture(true),
    first = a.start(),
    second = b.start();
  a.env.resources.dispose();
  expect(await first.finished).toEqual({ status: "cancelled" });
  expect(a.controls!.enabled).toBe(true);
  expect(a.updates.size).toBe(1);
  b.tick(1);
  expect((await second.finished).status).toBe("completed");
});

test("orthographic native update exceptions resolve failed and clean the motion before propagating", async () => {
  const env = fixture(true),
    motion = env.start();
  vi.spyOn(env.controls!, "update")
    .mockImplementationOnce(() => false)
    .mockImplementationOnce(() => {
      throw new Error("native");
    });
  expect(() => env.tick(0.1)).toThrow("native");
  expect((await motion.finished).status).toBe("failed");
  expect(env.controls!.enabled).toBe(true);
  expect(env.updates.size).toBe(1);
  expect(() => fitOrthographicObject(env.app, env.object)).not.toThrow();
});

test("orthographic preparation callbacks reject same-camera reentry without leaking the lock", async () => {
  const env = fixture(),
    original = env.object.getVertexPosition.bind(env.object);
  const probe = vi.spyOn(env.object, "getVertexPosition").mockImplementation((index, target) => {
    expect(() => env.start()).toThrow("in progress");
    return original(index, target);
  });
  const motion = env.start();
  probe.mockRestore();
  motion.cancel();
  expect(await motion.finished).toEqual({ status: "cancelled" });
  expect(() => fitOrthographicObject(env.app, env.object)).not.toThrow();
});

test("orthographic motion may retain existing zero-near clipping and does not tighten it on completion", async () => {
  const env = fixture(),
    motion = env.start({ adjustClipping: false });
  env.tick(1);
  expect((await motion.finished).status).toBe("completed");
  expect([env.camera.near, env.camera.far]).toEqual([0, 1000]);
});

test("orthographic transitions keep tiny target zoom positive and exact at completion", async () => {
  const env = fixture();
  env.object.scale.setScalar(1e6);
  const motion = env.start();
  env.tick(1 - 1e-10);
  expect(env.camera.zoom).toBeGreaterThan(0);
  env.tick(1e-9);
  const result = await motion.finished;
  if (result.status !== "completed") throw new Error("Expected completion");
  expect(env.camera.zoom).toBe(result.frame.zoom);
  expect(env.camera.zoom).toBeLessThan(0.00001);
});
