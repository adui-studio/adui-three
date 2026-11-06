import { expect, test, vi } from "vite-plus/test";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  captureCameraView,
  restoreCameraView,
  transitionOrthographicToObject,
  transitionToObject,
} from "../src/camera.ts";
import type { CameraView, CameraViewOptions } from "../src/camera.ts";
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
  const updates = new Set<(frame: FrameInfo) => void>();
  const state = {
    camera,
    resources: new ResourceScope(),
    state: "stopped" as ThreeAppState,
    size: { width: 800, height: 400, pixelRatio: 2 },
    renderer: { domElement: new EventTarget(), render: vi.fn() },
    start: vi.fn(),
    onUpdate(callback: (frame: FrameInfo) => void) {
      updates.add(callback);
      return () => {
        updates.delete(callback);
      };
    },
  };
  // Unconnected native controls install no DOM or GPU resources.
  const controls = orbit ? new OrbitControls(camera) : undefined;
  return { camera, controls, state, updates, app: state as unknown as AnyThreeApp };
}

test("camera views copy JSON-compatible values without updating, drawing or retaining native objects", () => {
  const env = fixture(),
    before = env.camera.toJSON();
  const view = captureCameraView(env.app);
  expect(JSON.parse(JSON.stringify(view))).toMatchObject({
    version: 1,
    kind: "perspective",
    position: [3, 2, 5],
    near: 0.1,
    far: 1000,
  });
  expect(env.camera.toJSON()).toEqual(before);
  expect(env.updates.size).toBe(0);
  env.camera.position.x = 99;
  expect(view.position[0]).toBe(3);
  const restored = restoreCameraView(env.app, view);
  expect(restored.position).toEqual(view.position);
  expect(env.camera.position.toArray()).toEqual([3, 2, 5]);
  expect(env.state.renderer.render).not.toHaveBeenCalled();
  expect(env.state.start).not.toHaveBeenCalled();
});

test("perspective restoration uses current viewport aspect and captured vertical lens settings", () => {
  const env = fixture();
  if (!(env.camera instanceof PerspectiveCamera)) throw new Error("Expected perspective");
  env.camera.fov = 35;
  env.camera.zoom = 2;
  const view = captureCameraView(env.app);
  env.state.size.width = 400;
  env.state.size.height = 800;
  env.camera.fov = 99;
  const restored = restoreCameraView(env.app, view);
  expect(env.camera.aspect).toBe(0.5);
  expect(env.camera.fov).toBe(35);
  expect(env.camera.zoom).toBe(2);
  expect(restored.kind).toBe("perspective");
});

test("orthographic restoration preserves vertical window, horizontal center, zoom and zero near", () => {
  const env = fixture(true);
  if (!(env.camera instanceof OrthographicCamera)) throw new Error("Expected orthographic");
  Object.assign(env.camera, { left: -2, right: 10, top: 8, bottom: 2, zoom: 2 });
  const view = captureCameraView(env.app);
  env.state.size.width = 400;
  env.state.size.height = 800;
  Object.assign(env.camera, { top: 10, bottom: -10, zoom: 1 });
  const restored = restoreCameraView(env.app, view);
  expect([
    env.camera.left,
    env.camera.right,
    env.camera.top,
    env.camera.bottom,
    env.camera.zoom,
    env.camera.near,
  ]).toEqual([2.5, 5.5, 8, 2, 2, 0]);
  expect(restored).toMatchObject({ kind: "orthographic", centerX: 4, top: 8, bottom: 2 });
});

test("a JSON view can outlive its original host and be applied to a matching second host", () => {
  for (const ortho of [false, true]) {
    const a = fixture(ortho),
      b = fixture(ortho);
    const serialized = JSON.stringify(captureCameraView(a.app));
    a.state.resources.dispose();
    b.camera.position.set(100, 100, 100);
    const result = restoreCameraView(b.app, JSON.parse(serialized) as CameraView);
    expect(result.position).toEqual([3, 2, 5]);
    expect(b.state.resources.disposed).toBe(false);
  }
});

test("invalid snapshots and mismatched camera kinds reject before native pose writes", () => {
  const env = fixture(),
    view = captureCameraView(env.app),
    before = env.camera.toJSON();
  const invalid = [
    { ...view, version: 2 },
    { ...view, kind: "unknown" },
    { ...view, zoom: 0 },
    { ...view, near: 0 },
    { ...view, far: NaN },
    { ...view, fov: 180 },
    { ...view, position: [0, 1] },
    { ...view, position: Array(3) },
    { ...view, quaternion: [0, 0, 0, 2] },
    { ...view, up: [0, 0, 0] },
    captureCameraView(fixture(true).app),
  ];
  for (const input of invalid) {
    expect(() => restoreCameraView(env.app, input as CameraView)).toThrow();
    expect(env.camera.toJSON()).toEqual(before);
  }
});

test("view lifecycle rejects closed hosts and unsupported camera layouts while zero-size capture remains possible", () => {
  const env = fixture(),
    view = captureCameraView(env.app);
  env.state.size.width = 0;
  expect(() => captureCameraView(env.app)).not.toThrow();
  expect(() => restoreCameraView(env.app, view)).toThrow("nonzero");
  env.state.size.width = 800;
  new Group().add(env.camera);
  expect(() => captureCameraView(env.app)).toThrow("unparented");
  env.camera.removeFromParent();
  env.state.resources.dispose();
  expect(() => captureCameraView(env.app)).toThrow("disposed");
  expect(() => restoreCameraView(env.app, view)).toThrow("disposed");
});

test("orbit views restore their target and consume inertia while preserving borrowed control settings", () => {
  const env = fixture(false, true),
    controls = env.controls!;
  controls.enableDamping = true;
  const view = captureCameraView(env.app, { controls });
  controls.rotateLeft(0.5);
  controls.update(0.1);
  controls.target.set(3, 0, -2);
  const result = restoreCameraView(env.app, view, { controls });
  expect(result.target).toEqual([0, 0, 0]);
  expect(controls.target.toArray()).toEqual([0, 0, 0]);
  expect(controls.enableDamping).toBe(true);
  expect(controls.autoRotate).toBe(false);
  expect(env.camera.position.distanceTo(new Vector3(3, 2, 5))).toBeLessThan(1e-9);
  const pose = env.camera.position.clone();
  controls.update(0.1);
  expect(env.camera.position.distanceTo(pose)).toBeLessThan(1e-9);
});

test("restoration preserves the native renderer's reversed-depth mode without writing its readonly flag", () => {
  for (const orthographic of [false, true]) {
    const env = fixture(orthographic);
    vi.spyOn(env.camera, "reversedDepth", "get").mockReturnValue(true);
    env.camera.updateProjectionMatrix();
    const view = captureCameraView(env.app);
    env.camera.zoom = 2;
    restoreCameraView(env.app, view);
    expect(env.camera.reversedDepth).toBe(true);
    expect(
      new Vector3(0, 0, -env.camera.near).applyMatrix4(env.camera.projectionMatrix).z,
    ).toBeCloseTo(1);
    expect(
      new Vector3(0, 0, -env.camera.far).applyMatrix4(env.camera.projectionMatrix).z,
    ).toBeCloseTo(0);
  }
});

test("reversed-depth numeric overflow is rejected before restoring a view", () => {
  const env = fixture(true);
  env.state.size.width = 400;
  env.state.size.height = 400;
  vi.spyOn(env.camera, "reversedDepth", "get").mockReturnValue(true);
  const view = {
    ...captureCameraView(env.app),
    kind: "orthographic" as const,
    top: 1e100,
    bottom: -1e100,
    centerX: 0,
    far: 2e108,
  };
  const before = env.camera.position.toArray();
  const ordinary = fixture(true);
  ordinary.state.size.width = 400;
  ordinary.state.size.height = 400;
  expect(() => restoreCameraView(ordinary.app, view)).not.toThrow();
  expect(ordinary.camera.projectionMatrixInverse.elements.every(Number.isFinite)).toBe(true);
  expect(() => restoreCameraView(env.app, view)).toThrow("finite and invertible");
  expect(env.camera.position.toArray()).toEqual(before);
});

test("orbit restoration requires a compatible captured target, up vector and control owner", () => {
  const env = fixture(false, true),
    controls = env.controls!;
  const plain = captureCameraView(env.app),
    view = captureCameraView(env.app, { controls });
  expect(() => restoreCameraView(env.app, plain, { controls })).toThrow("orbit target");
  expect(() => restoreCameraView(env.app, { ...view, up: [0, 0, 1] }, { controls })).toThrow();
  expect(() => restoreCameraView(env.app, { ...view, up: [0, 2, 0] }, { controls })).toThrow(
    "unit up",
  );
  expect(() => restoreCameraView(env.app, { ...view, target: [3, 2, 5] }, { controls })).toThrow(
    "distance",
  );
  const other = fixture(false, true).controls!;
  expect(() => restoreCameraView(env.app, view, { controls: other })).toThrow("different camera");
});

test("orbit distance, zoom and target constraints are checked before restoration writes", () => {
  const env = fixture(true, true),
    controls = env.controls!,
    view = captureCameraView(env.app, { controls });
  for (const configure of [
    () => {
      controls.minZoom = 2;
    },
    () => {
      controls.maxDistance = 1;
    },
    () => {
      controls.maxTargetRadius = -1;
    },
    () => {
      controls.minDistance = NaN;
    },
  ]) {
    Object.assign(controls, {
      minZoom: 0,
      maxDistance: Infinity,
      maxTargetRadius: Infinity,
      minDistance: 0,
    });
    configure();
    const pose = env.camera.position.toArray();
    expect(() => restoreCameraView(env.app, view, { controls })).toThrow("constraints");
    expect(env.camera.position.toArray()).toEqual(pose);
  }
});

test("native orbit angle limits may adjust the restored pose and the returned snapshot reports it", () => {
  const env = fixture(false, true),
    controls = env.controls!,
    view = captureCameraView(env.app, { controls });
  controls.minPolarAngle = Math.PI / 2;
  controls.maxPolarAngle = Math.PI / 2;
  const result = restoreCameraView(env.app, view, { controls });
  expect(Math.abs(result.position[1])).toBeLessThan(1e-9);
  expect(result.position).toEqual(env.camera.position.toArray());
});

test("valid restoration cancels an active transition after validation and restores its original control lease", async () => {
  for (const ortho of [false, true]) {
    const env = fixture(ortho, true),
      controls = env.controls!;
    controls.enableDamping = true;
    const view = captureCameraView(env.app, { controls });
    const object = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    object.position.x = 20;
    const motion = ortho
      ? transitionOrthographicToObject(env.app as OrthographicThreeApp, object, { controls })
      : transitionToObject(env.app as ThreeApp, object, { controls });
    expect(() => restoreCameraView(env.app, { ...view, zoom: -1 }, { controls })).toThrow();
    expect(motion.state).toBe("running");
    restoreCameraView(env.app, view, { controls });
    expect(await motion.finished).toEqual({ status: "cancelled" });
    expect(controls.enableDamping).toBe(true);
    expect(controls.enabled).toBe(true);
    expect(env.updates.size).toBe(0);
    object.geometry.dispose();
    object.material.dispose();
  }
});

test("snapshot getters and native callbacks cannot reenter restoration and exceptions release the guard", () => {
  const env = fixture(false, true),
    controls = env.controls!,
    view = captureCameraView(env.app, { controls });
  const options: CameraViewOptions = {
    get controls(): OrbitControls {
      expect(() => restoreCameraView(env.app, view)).toThrow("in progress");
      throw new Error("options");
    },
  };
  expect(() => restoreCameraView(env.app, view, options)).toThrow("options");
  controls.enableDamping = true;
  controls.rotateLeft(0.4);
  const changed = () => {
    expect(() => restoreCameraView(env.app, view)).toThrow("in progress");
    throw new Error("native");
  };
  controls.addEventListener("change", changed);
  expect(() => restoreCameraView(env.app, view, { controls })).toThrow("native");
  expect(controls.enableDamping).toBe(true);
  controls.removeEventListener("change", changed);
  expect(() => restoreCameraView(env.app, view, { controls })).not.toThrow();
});
