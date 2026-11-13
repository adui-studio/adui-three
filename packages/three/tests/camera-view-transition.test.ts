import { expect, test, vi } from "vite-plus/test";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  captureCameraView,
  restoreCameraView,
  transitionToCameraView,
  transitionToObject,
  transitionOrthographicToObject,
} from "../src/camera.ts";
import type { CameraView, CameraViewTransitionOptions } from "../src/camera.ts";
import type {
  AnyThreeApp,
  FrameInfo,
  OrthographicThreeApp,
  ThreeApp,
  ThreeAppState,
} from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";

function fixture(orthographic = false, orbit = false) {
  const camera = orthographic
    ? new OrthographicCamera(-8, 8, 4, -4, 0, 1000)
    : new PerspectiveCamera(50, 2, 0.1, 1000);
  camera.position.set(3, 2, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const controls = orbit ? new OrbitControls(camera) : undefined;
  controls?.update(0);
  const updates = new Set<(frame: FrameInfo) => void>(),
    canvas = new EventTarget();
  const value = {
    camera,
    state: "stopped" as ThreeAppState,
    resources: new ResourceScope(),
    size: { width: 800, height: 400, pixelRatio: 2 },
    renderer: { domElement: canvas, render: vi.fn() },
    start: vi.fn(),
    onUpdate(callback: (frame: FrameInfo) => void) {
      updates.add(callback);
      return () => {
        updates.delete(callback);
      };
    },
  };
  const app = value as unknown as AnyThreeApp;
  const capture = () => captureCameraView(app, { controls });
  const saved = capture();
  const source = (): void => {
    if (controls) controls.target.set(2, 0, 1);
    else camera.up.set(0, 0, 1);
    camera.position.set(8, 4, 9);
    camera.lookAt(controls?.target ?? new Vector3());
    camera.zoom = 2;
    camera.near = orthographic ? 0.2 : 0.3;
    camera.far = 500;
    if (camera instanceof PerspectiveCamera) {
      camera.fov = 70;
      camera.aspect = 1.5;
    } else {
      camera.left = -12;
      camera.right = 12;
      camera.top = 6;
      camera.bottom = -6;
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
  };
  return {
    app,
    value,
    camera,
    controls,
    canvas,
    updates,
    saved,
    source,
    capture,
    start(options: CameraViewTransitionOptions = {}, view: CameraView = saved) {
      return transitionToCameraView(app, view, { duration: 1, controls, ...options });
    },
    tick(delta: number): void {
      if (value.state !== "running") return;
      for (const callback of Array.from(updates))
        if (updates.has(callback)) callback({ delta, elapsed: delta });
    },
  };
}

function expectPose(actual: CameraView, expected: CameraView): void {
  expect(actual.kind).toBe(expected.kind);
  for (const field of ["zoom", "near", "far"] as const)
    expect(actual[field]).toBeCloseTo(expected[field], 8);
  actual.position.forEach((value, index) =>
    expect(value).toBeCloseTo(expected.position[index]!, 8),
  );
  actual.up.forEach((value, index) => expect(value).toBeCloseTo(expected.up[index]!, 8));
  expect(
    Math.abs(
      new Quaternion()
        .fromArray(actual.quaternion)
        .dot(new Quaternion().fromArray(expected.quaternion)),
    ),
  ).toBeCloseTo(1, 8);
  if (actual.kind === "perspective" && expected.kind === "perspective")
    expect(actual.fov).toBe(expected.fov);
  if (actual.kind === "orthographic" && expected.kind === "orthographic") {
    expect(actual.top).toBe(expected.top);
    expect(actual.bottom).toBe(expected.bottom);
    expect(actual.centerX).toBe(expected.centerX);
  }
}

test.each([false, true])(
  "bookmark easing is sampled across native lens fields, orthographic=%s",
  (orthographic) => {
    for (const easing of ["linear", "smoothstep", undefined] as const) {
      const env = fixture(orthographic);
      env.source();
      const motion = env.start({ easing });
      env.value.state = "running";
      env.tick(0.25);
      const t = easing === "linear" ? 0.25 : 0.15625;
      expect(env.camera.zoom).toBeCloseTo(2 - t);
      if (env.camera instanceof PerspectiveCamera) expect(env.camera.fov).toBeCloseTo(70 - 20 * t);
      else expect(env.camera.top).toBeCloseTo(6 - 2 * t);
      expect(motion.progress).toBe(0.25);
      motion.cancel();
      env.value.resources.dispose();
    }
  },
);

test("invalid bookmark easing and aborting its getter do not replace the current motion", () => {
  const env = fixture(),
    first = env.start();
  expect(() => env.start({ easing: "bad" as CameraViewTransitionOptions["easing"] })).toThrow(
    RangeError,
  );
  expect(first.state).toBe("running");
  const abort = new AbortController();
  const next = transitionToCameraView(env.app, env.saved, {
    signal: abort.signal,
    get easing(): "linear" {
      abort.abort();
      return "linear";
    },
  });
  expect(next.state).toBe("cancelled");
  expect(first.state).toBe("running");
  first.cancel();
  env.value.resources.dispose();
});

test("view getters aborted during preparation preserve an already paused camera lease", () => {
  const env = fixture(),
    first = env.start(),
    abort = new AbortController();
  first.pause();
  const input = {
    ...env.saved,
    get zoom() {
      abort.abort();
      return 1;
    },
  };
  const next = transitionToCameraView(env.app, input, { signal: abort.signal });
  expect(next.state).toBe("cancelled");
  expect(first.state).toBe("paused");
  first.cancel();
  env.value.resources.dispose();
});

test.each([false, true])(
  "same-kind bookmark transition restores pose and projection without drawing, orthographic=%s",
  async (orthographic) => {
    const env = fixture(orthographic);
    env.source();
    const input = JSON.parse(JSON.stringify(env.saved)) as CameraView;
    const start = env.camera.position.clone(),
      up = env.camera.up.clone();
    const motion = env.start({}, input);
    Object.assign(input, { position: [99, 99, 99], zoom: 99 });
    expect(env.value.state).toBe("stopped");
    expect(env.value.start).not.toHaveBeenCalled();
    env.tick(0.5);
    expect(motion.progress).toBe(0);
    env.value.state = "running";
    env.tick(0.5);
    expect(motion.progress).toBe(0.5);
    expect(env.camera.zoom).toBe(1.5);
    expect(env.camera.position.x).toBeCloseTo((start.x + env.saved.position[0]) / 2);
    expect(env.camera.up.equals(up)).toBe(true);
    if (env.camera instanceof PerspectiveCamera) {
      expect(env.camera.fov).toBe(60);
      expect(env.camera.aspect).toBe(1.75);
    } else expect(env.camera.top).toBe(5);
    env.tick(0.5);
    const result = await motion.finished;
    expect(result.status).toBe("completed");
    if (result.status === "completed") expectPose(result.view, env.saved);
    expect(env.updates.size).toBe(0);
    expect(env.value.renderer.render).not.toHaveBeenCalled();
    env.value.resources.dispose();
  },
);

test.each([false, true])(
  "native orbit bookmarks interpolate target/radius and restore their lease, orthographic=%s",
  async (orthographic) => {
    const env = fixture(orthographic, true);
    env.source();
    const controls = env.controls!;
    controls.enableDamping = controls.autoRotate = true;
    const motion = env.start();
    expect([controls.enabled, controls.enableDamping, controls.autoRotate]).toEqual([
      false,
      false,
      false,
    ]);
    env.value.state = "running";
    env.tick(0.5);
    expect(controls.target.x).toBeCloseTo(1);
    expect(env.camera.position.equals(controls.target)).toBe(false);
    env.tick(0.5);
    const result = await motion.finished;
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expectPose(result.view, env.saved);
      expect(result.view.target).toEqual([0, 0, 0]);
    }
    expect([controls.enabled, controls.enableDamping, controls.autoRotate]).toEqual([
      true,
      true,
      true,
    ]);
    expect(env.updates.size).toBe(0);
    env.value.resources.dispose();
  },
);

test("bookmark transition pause follows host delta and the final view is independent", async () => {
  const env = fixture();
  env.source();
  const motion = env.start();
  env.value.state = "running";
  env.tick(0.25);
  const position = env.camera.position.clone();
  env.value.state = "stopped";
  env.tick(20);
  expect(motion.progress).toBe(0.25);
  expect(env.camera.position.equals(position)).toBe(true);
  env.value.state = "running";
  env.tick(0);
  env.tick(0.75);
  const result = await motion.finished;
  expect(result.status).toBe("completed");
  if (result.status === "completed") {
    Object.assign(result.view, { zoom: 99 });
    expect(env.camera.zoom).toBe(1);
  }
  motion.cancel();
  motion.dispose();
  expect(motion.state).toBe("completed");
  env.value.resources.dispose();
});

test.each([false, true])(
  "bookmark, framing and immediate restoration share one camera lease, orthographic=%s",
  async (orthographic) => {
    const env = fixture(orthographic, true);
    const object = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const frame = () =>
      orthographic
        ? transitionOrthographicToObject(env.app as OrthographicThreeApp, object, {
            controls: env.controls,
          })
        : transitionToObject(env.app as ThreeApp, object, { controls: env.controls });
    const first = frame();
    expect(() => env.start({ duration: 0 })).toThrow();
    const wrongKind = fixture(!orthographic).saved;
    expect(() => env.start({}, wrongKind)).toThrow(/kind/);
    expect(first.state).toBe("running");
    const aborted = new AbortController();
    aborted.abort();
    expect(env.start({ signal: aborted.signal }).state).toBe("cancelled");
    expect(first.state).toBe("running");
    const view = env.start();
    expect(await first.finished).toMatchObject({ status: "cancelled" });
    const second = frame();
    expect(await view.finished).toEqual({ status: "cancelled" });
    const third = env.start();
    expect(second.state).toBe("cancelled");
    restoreCameraView(env.app, env.saved, { controls: env.controls });
    expect(await third.finished).toEqual({ status: "cancelled" });
    expect(env.updates.size).toBe(0);
    env.value.resources.dispose();
    object.geometry.dispose();
    object.material.dispose();
  },
);

test.each(["abort", "pointerdown", "wheel", "scope"] as const)(
  "bookmark cancellation releases subscriptions and controls: %s",
  async (reason) => {
    const env = fixture(false, true),
      abort = new AbortController();
    env.source();
    const motion = env.start({ signal: abort.signal });
    env.value.state = "running";
    env.tick(0.25);
    const position = env.camera.position.clone();
    if (reason === "abort") abort.abort();
    else if (reason === "scope") env.value.resources.dispose();
    else env.canvas.dispatchEvent(new Event(reason));
    expect(await motion.finished).toEqual({ status: "cancelled" });
    expect(env.controls!.enabled).toBe(true);
    expect(env.updates.size).toBe(0);
    env.tick(1);
    expect(env.camera.position.equals(position)).toBe(true);
    env.value.resources.dispose();
  },
);

test.each([
  "position",
  "rotation",
  "zoom",
  "lens",
  "up",
  "size",
  "parent",
  "target",
  "constraints",
  "enabled",
] as const)("outside changes cancel without overwriting the consumer: %s", async (change) => {
  const env = fixture(false, true);
  env.source();
  const motion = env.start();
  env.value.state = "running";
  env.tick(0.2);
  if (change === "position") env.camera.position.x += 1;
  if (change === "rotation") env.camera.rotateY(0.1);
  if (change === "zoom") env.camera.zoom = 3;
  if (change === "lens") (env.camera as PerspectiveCamera).fov = 45;
  if (change === "up") env.camera.up.set(0, 0, 1);
  if (change === "size") env.value.size.width = 600;
  if (change === "parent") new Group().add(env.camera);
  if (change === "target") env.controls!.target.x += 1;
  if (change === "constraints") env.controls!.maxDistance = 100;
  if (change === "enabled") env.controls!.enabled = true;
  const position = env.camera.position.clone(),
    rotation = env.camera.quaternion.clone();
  env.tick(0.2);
  expect(await motion.finished).toEqual({ status: "cancelled" });
  expect(env.camera.position.equals(position)).toBe(true);
  expect(env.camera.quaternion.equals(rotation)).toBe(true);
  expect(env.updates.size).toBe(0);
  env.value.resources.dispose();
});

test.each([false, true])(
  "restoration uses the current CSS aspect, orthographic=%s",
  async (orthographic) => {
    const env = fixture(orthographic);
    env.source();
    env.value.size.width = 400;
    const motion = env.start();
    env.value.state = "running";
    env.tick(1);
    expect((await motion.finished).status).toBe("completed");
    if (env.camera instanceof PerspectiveCamera) expect(env.camera.aspect).toBe(1);
    else expect(env.camera.right - env.camera.left).toBe(env.camera.top - env.camera.bottom);
    env.value.resources.dispose();
  },
);

test("invalid orbit endpoints preserve the existing motion and source getters cannot replace the owner", () => {
  const env = fixture(false, true);
  const first = env.start();
  const invalid = { ...env.saved, position: [0, 0, 0] } as CameraView;
  expect(() => env.start({}, invalid)).toThrow();
  expect(first.state).toBe("running");
  const other = new PerspectiveCamera();
  const malicious = {
    ...env.saved,
    get zoom() {
      env.value.camera = other;
      return 1;
    },
  };
  expect(() => env.start({}, malicious)).toThrow(/camera changed/);
  expect(first.state).toBe("running");
  env.value.camera = env.camera;
  first.cancel();
  const next = env.start();
  next.cancel();
  env.value.resources.dispose();
});

test("native update reentry is locked and cancellation stops remaining writes", async () => {
  const env = fixture(false, true);
  env.source();
  const motion = env.start();
  const original = env.controls!.update.bind(env.controls);
  const stop = vi.spyOn(env.controls!, "update").mockImplementation((delta) => {
    expect(() => env.start()).toThrow(/progress/);
    motion.cancel();
    return original(delta);
  });
  env.value.state = "running";
  env.tick(0.5);
  expect(await motion.finished).toEqual({ status: "cancelled" });
  expect(env.updates.size).toBe(0);
  stop.mockRestore();
  env.start().cancel();
  env.value.resources.dispose();
});

test("failed native updates settle, release the write lock and keep all cleanup failures", async () => {
  const env = fixture(false, true);
  const motion = env.start();
  const failure = new Error("native update failed");
  const update = vi.spyOn(env.controls!, "update").mockImplementation(() => {
    throw failure;
  });
  const remove = vi.spyOn(env.canvas, "removeEventListener").mockImplementation(() => {
    throw new Error("listener cleanup failed");
  });
  env.value.state = "running";
  expect(() => env.tick(0.5)).toThrow(AggregateError);
  const result = await motion.finished;
  expect(result.status).toBe("failed");
  if (result.status === "failed")
    expect((result.error as AggregateError).errors).toContain(failure);
  expect(env.controls!.enabled).toBe(true);
  expect(env.updates.size).toBe(0);
  update.mockRestore();
  remove.mockRestore();
  env.start().cancel();
  env.value.resources.dispose();
});

test("clipping is widened during motion and cancellation keeps the current projection", () => {
  const env = fixture();
  env.source();
  const motion = env.start();
  expect(env.camera.near).toBe(0.1);
  expect(env.camera.far).toBe(1000);
  env.value.state = "running";
  env.tick(0.3);
  motion.cancel();
  expect(env.camera.near).toBe(0.1);
  expect(env.camera.far).toBe(1000);
  env.value.resources.dispose();
});

test.each([false, true])(
  "reverse depth uses the native readonly mode throughout restoration, orthographic=%s",
  async (orthographic) => {
    const env = fixture(orthographic);
    Object.defineProperty(env.camera, "reversedDepth", { get: () => true });
    env.source();
    const motion = env.start();
    env.value.state = "running";
    env.tick(0.5);
    expect(motion.state).toBe("running");
    expect(
      [
        ...env.camera.projectionMatrix.elements,
        ...env.camera.projectionMatrixInverse.elements,
      ].every(Number.isFinite),
    ).toBe(true);
    env.tick(0.5);
    expect((await motion.finished).status).toBe("completed");
    const nearPoint = new Vector3(0, 0, -env.camera.near).applyMatrix4(env.camera.projectionMatrix);
    const farPoint = new Vector3(0, 0, -env.camera.far).applyMatrix4(env.camera.projectionMatrix);
    expect(nearPoint.z).toBeCloseTo(1);
    expect(farPoint.z).toBeCloseTo(0);
    env.value.resources.dispose();
  },
);

test("owner disposal from a native matrix callback stops final projection writes", async () => {
  const env = fixture();
  const motion = env.start();
  const projection = vi.spyOn(env.camera, "updateProjectionMatrix");
  vi.spyOn(env.camera, "updateWorldMatrix").mockImplementationOnce(() => {
    env.value.resources.dispose();
  });
  env.value.state = "running";
  env.tick(1);
  expect(await motion.finished).toEqual({ status: "cancelled" });
  expect(projection).toHaveBeenCalledTimes(1);
  expect(env.updates.size).toBe(0);
});

test("invalid frame delta fails the motion without poisoning later camera commands", async () => {
  const env = fixture();
  const motion = env.start();
  env.value.state = "running";
  expect(() => env.tick(NaN)).toThrow(/delta/);
  expect((await motion.finished).status).toBe("failed");
  env.start().cancel();
  env.value.resources.dispose();
});

test("native angle constraints are reflected in the actual completed snapshot", async () => {
  const env = fixture(false, true);
  env.controls!.maxPolarAngle = 0.3;
  const motion = env.start();
  env.value.state = "running";
  env.tick(1);
  const result = await motion.finished;
  expect(result.status).toBe("completed");
  expect(env.controls!.getPolarAngle()).toBeCloseTo(0.3);
  if (result.status === "completed") expect(result.view.position).toEqual(env.capture().position);
  env.value.resources.dispose();
});
