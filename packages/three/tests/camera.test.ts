import { expect, test, vi } from "vite-plus/test";
import {
  Bone,
  BoxGeometry,
  BufferGeometry,
  DetachedBindMode,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import type { Box3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { computeObjectFrame, fitObject } from "../src/camera.ts";
import type { FitObjectOptions } from "../src/camera.ts";
import type { ThreeApp, ThreeAppState } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";

function fixture() {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  camera.position.set(4, 3, 5);
  camera.lookAt(0, 0, 0);
  const object = new Mesh(new BoxGeometry(2, 4, 3), new MeshBasicMaterial());
  const state = {
    camera,
    state: "stopped" as ThreeAppState,
    size: { width: 640, height: 360, pixelRatio: 2 },
    resources: new ResourceScope(),
    start: vi.fn(),
    onUpdate: vi.fn(),
    renderer: { render: vi.fn() },
  };
  return { camera, object, state, app: state as unknown as ThreeApp };
}

function contained(camera: PerspectiveCamera, bounds: Box3): void {
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new Vector3(x, y, z).project(camera);
        for (const value of point.toArray()) {
          expect(Number.isFinite(value)).toBe(true);
          expect(Math.abs(value)).toBeLessThanOrEqual(1 + 1e-6);
        }
      }
}

function skinnedFixture(externalBones: boolean) {
  const env = fixture();
  const geometry = new BoxGeometry(2, 4, 3);
  const count = geometry.attributes.position!.count;
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let index = 0; index < count; index++) weights[index * 4] = 1;
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const bone = new Bone();
  const skin = new SkinnedMesh(geometry, env.object.material);
  const parent = new Group();
  parent.add(skin);
  if (externalBones) parent.add(bone);
  else skin.add(bone);
  parent.updateMatrixWorld(true);
  skin.bind(new Skeleton([bone]));
  return { ...env, bone, skin, parent };
}

test("framing a skinned subtree refreshes sibling bones before sampling the current pose", () => {
  const env = skinnedFixture(true);
  env.bone.position.x = 7;
  const frame = computeObjectFrame(env.camera, env.skin);
  expect(frame.center.x).toBeCloseTo(7);
  expect(frame.bounds.min.x).toBeCloseTo(6);
  expect(frame.bounds.max.x).toBeCloseTo(8);
  env.bone.position.x = -4;
  const fit = fitObject(env.app, env.skin);
  expect(fit.center.x).toBeCloseTo(-4);
  contained(env.camera, fit.bounds);
});

test("framing refreshes attached bind inverses after parent movement without a render", () => {
  for (const external of [false, true]) {
    const env = skinnedFixture(external);
    env.parent.position.set(10, 20, -5);
    env.bone.position.x = 3;
    const frame = computeObjectFrame(env.camera, env.skin);
    expect(frame.center.toArray()).toEqual([13, 20, -5]);
    expect(env.skin.bindMatrixInverse.elements[12]).toBe(-10);
    expect(frame.bounds.getSize(new Vector3()).toArray()).toEqual([2, 4, 3]);
  }
});

test("detached bind mode preserves its bind matrix when the mesh and skeleton move independently", () => {
  const env = skinnedFixture(true);
  env.bone.removeFromParent();
  env.skin.bindMode = DetachedBindMode;
  env.bone.position.x = 3;
  env.parent.position.set(10, 20, -5);
  const frame = computeObjectFrame(env.camera, env.skin);
  expect(frame.center.toArray()).toEqual([13, 20, -5]);
  expect(env.skin.bindMatrixInverse).toEqual(env.skin.bindMatrix.clone().invert());
});

test("skinned pose preparation does not claim shared skeleton data or move an invalidated host camera", () => {
  const env = skinnedFixture(true);
  const inverses = env.skin.skeleton.boneInverses.map((matrix) => matrix.clone());
  const before = env.camera.position.clone();
  const update = env.bone.updateWorldMatrix.bind(env.bone);
  vi.spyOn(env.bone, "updateWorldMatrix").mockImplementationOnce((parents, children) => {
    update(parents, children);
    env.state.resources.dispose();
  });
  expect(() => fitObject(env.app, env.skin)).toThrow("disposed");
  expect(env.camera.position).toEqual(before);
  expect(env.skin.skeleton.boneInverses).toEqual(inverses);
  expect(env.skin.skeleton.boneTexture).toBeNull();
  expect(env.state.start).not.toHaveBeenCalled();
  expect(env.state.renderer.render).not.toHaveBeenCalled();
});

test("planning updates ancestor transforms and returns independent snapshots without moving the camera", () => {
  const env = fixture();
  const parent = new Group();
  parent.position.set(20, -30, 15);
  parent.rotation.y = 0.4;
  parent.scale.set(3, 2, 4);
  env.object.position.set(2, 1, -3);
  parent.add(env.object);
  const before = env.camera.position.clone();
  const rotation = env.camera.quaternion.clone();
  const frame = computeObjectFrame(env.camera, env.object);
  expect(frame.center.distanceTo(env.object.getWorldPosition(new Vector3()))).toBeLessThan(1e-10);
  expect(env.camera.position).toEqual(before);
  expect(env.camera.quaternion.toArray()).toEqual(rotation.toArray());
  expect(env.camera.near).toBe(0.1);
  frame.position.set(100, 100, 100);
  expect(env.camera.position).toEqual(before);
});

test("world bounds fit both viewport axes with zoom, large offsets and varied scales", () => {
  for (const aspect of [2.4, 0.35])
    for (const scale of [0.001, 1, 1000]) {
      const env = fixture();
      env.camera.aspect = aspect;
      env.camera.zoom = 2.5;
      env.object.scale.setScalar(scale);
      env.object.position.set(100 * scale, -25 * scale, 60 * scale);
      env.object.rotation.set(0.3, 0.6, 0.1);
      const frame = fitObject(env.app, env.object);
      contained(env.camera, frame.bounds);
      expect(env.camera.position.distanceTo(frame.center)).toBeCloseTo(frame.distance, 7);
      expect(env.camera.near).toBe(frame.near);
      expect(env.camera.far).toBe(frame.far);
    }
});

test("narrow viewport and larger zoom require greater framing distance", () => {
  const { camera, object } = fixture();
  const wide = computeObjectFrame(camera, object).distance;
  camera.aspect = 0.4;
  const narrow = computeObjectFrame(camera, object).distance;
  camera.zoom = 3;
  expect(narrow).toBeGreaterThan(wide);
  expect(computeObjectFrame(camera, object).distance).toBeGreaterThan(narrow);
});

test("custom directions are normalized and a distance floor is honored", () => {
  const env = fixture();
  const frame = fitObject(env.app, env.object, {
    direction: [1e200, 1e200, 1e200],
    minimumDistance: 100,
  });
  expect(frame.distance).toBe(100);
  expect(
    frame.position
      .clone()
      .sub(frame.center)
      .normalize()
      .distanceTo(new Vector3(1, 1, 1).normalize()),
  ).toBeLessThan(1e-12);
  contained(env.camera, frame.bounds);
});

test("empty, zero-size and nonfinite geometry reject before camera pose or clipping changes", () => {
  const env = fixture();
  for (const values of [[], [0, 0, 0], [NaN, 1, 2]]) {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(values, 3));
    const object = new Mesh(geometry, new MeshBasicMaterial());
    const before = env.camera.position.clone();
    expect(() => fitObject(env.app, object)).toThrow(RangeError);
    expect(env.camera.position).toEqual(before);
    expect(env.camera.near).toBe(0.1);
  }
  expect(() => fitObject(env.app, new Group())).toThrow(RangeError);
  env.object.position.set(1e20, 0, 0);
  expect(() => fitObject(env.app, env.object)).toThrow("numeric range");
});

test("invalid framing options reject without changing the camera", () => {
  const env = fixture();
  const before = env.camera.position.clone();
  const invalid: FitObjectOptions[] = [
    { padding: 0.9 },
    { padding: Infinity },
    { minimumDistance: -1 },
    { minimumDistance: NaN },
    { direction: [0, 0, 0] },
    { direction: [NaN, 0, 1] },
  ];
  for (const options of invalid)
    expect(() => fitObject(env.app, env.object, options)).toThrow(RangeError);
  expect(env.camera.position).toEqual(before);
});

test("unsupported camera transforms and off-axis or invalid frusta reject", () => {
  const mutations: Array<(camera: PerspectiveCamera) => void> = [
    (camera) => {
      camera.aspect = 0;
    },
    (camera) => {
      camera.zoom = 0;
    },
    (camera) => {
      camera.fov = 180;
    },
    (camera) => {
      camera.up.set(0, 0, 0);
    },
    (camera) => {
      camera.filmOffset = 2;
    },
    (camera) => {
      camera.setViewOffset(640, 360, 0, 0, 320, 360);
    },
    (camera) => {
      camera.scale.setScalar(2);
    },
    (camera) => {
      new Group().add(camera);
    },
    (camera) => {
      camera.matrixAutoUpdate = false;
    },
    (camera) => {
      camera.matrixWorldAutoUpdate = false;
    },
  ];
  for (const mutate of mutations) {
    const env = fixture();
    mutate(env.camera);
    const before = env.camera.position.clone();
    expect(() => fitObject(env.app, env.object)).toThrow(RangeError);
    expect(env.camera.position).toEqual(before);
  }
});

test("stopped hosts fit synchronously without starting, rendering, subscribing or adopting resources", () => {
  const a = fixture();
  const b = fixture();
  const before = b.camera.position.clone();
  const disposal = vi.spyOn(a.object.geometry, "dispose");
  fitObject(a.app, a.object);
  expect(a.state.start).not.toHaveBeenCalled();
  expect(a.state.onUpdate).not.toHaveBeenCalled();
  expect(a.state.renderer.render).not.toHaveBeenCalled();
  expect(b.camera.position).toEqual(before);
  a.state.resources.dispose();
  expect(disposal).not.toHaveBeenCalled();
  expect(() => fitObject(a.app, a.object)).toThrow("disposed");
  b.state.size.height = 0;
  expect(() => fitObject(b.app, b.object)).toThrow("nonzero");
  b.state.state = "disposed";
  expect(() => fitObject(b.app, b.object)).toThrow("disposed");
});

test("keeping existing clipping succeeds only when it contains the full frame", () => {
  const env = fixture();
  env.camera.near = 0.001;
  env.camera.far = 100;
  fitObject(env.app, env.object, { adjustClipping: false });
  expect(env.camera.near).toBe(0.001);
  expect(env.camera.far).toBe(100);
  env.object.scale.setScalar(10000);
  const before = env.camera.position.clone();
  expect(() => fitObject(env.app, env.object, { adjustClipping: false })).toThrow("clipping");
  expect(env.camera.position).toEqual(before);
});

test("native OrbitControls consume damping and pan inertia, retarget and stay stable after fitting", () => {
  const env = fixture();
  const controls = new OrbitControls(env.camera);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.minDistance = 20;
  controls.maxDistance = 50;
  controls.rotateLeft(0.5);
  controls.domElement = { clientHeight: 360, clientWidth: 640 } as HTMLElement;
  controls.pan(12, 8);
  env.object.position.set(5, 6, -10);
  const frame = fitObject(env.app, env.object, { controls });
  expect(controls.target.distanceTo(frame.center)).toBeLessThan(1e-10);
  expect(controls.getDistance()).toBeCloseTo(20, 9);
  expect(controls.enableDamping).toBe(true);
  expect(controls.autoRotate).toBe(true);
  const before = env.camera.position.clone();
  controls.autoRotate = false;
  for (let index = 0; index < 4; index++) controls.update(0.016);
  expect(env.camera.position.distanceTo(before)).toBeLessThan(1e-9);
  contained(env.camera, frame.bounds);
});

test("foreign controls and infeasible native distance/target constraints reject before mutation", () => {
  const env = fixture();
  const controls = new OrbitControls(env.camera);
  const before = env.camera.position.clone();
  controls.maxDistance = 0.01;
  expect(() => fitObject(env.app, env.object, { controls })).toThrow("constraints");
  controls.maxDistance = Infinity;
  controls.maxTargetRadius = 1;
  env.object.position.set(10, 0, 0);
  expect(() => fitObject(env.app, env.object, { controls })).toThrow("constraints");
  controls.maxTargetRadius = Infinity;
  expect(() => fitObject(env.app, env.object, { controls, minimumDistance: -1 })).toThrow(
    RangeError,
  );
  const foreign = new OrbitControls(new PerspectiveCamera());
  expect(() => fitObject(env.app, env.object, { controls: foreign })).toThrow("different camera");
  expect(env.camera.position).toEqual(before);
});

test("a native change event may dispose the host during inertia flush without subsequent fit writes", () => {
  const env = fixture();
  const controls = new OrbitControls(env.camera);
  controls.enableDamping = true;
  controls.rotateLeft(0.4);
  controls.addEventListener("change", () => {
    env.state.state = "disposed";
  });
  expect(() => fitObject(env.app, env.object, { controls })).toThrow("disposed");
  expect(env.camera.near).toBe(0.1);
  expect(env.camera.far).toBe(1000);
  expect(controls.enableDamping).toBe(true);
});

test("reentrant framing is rejected and native callback errors restore flags and release the guard", () => {
  const env = fixture();
  const controls = new OrbitControls(env.camera);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.rotateLeft(0.4);
  const failure = new Error("consumer change callback");
  const changed = (): void => {
    expect(() => fitObject(env.app, env.object, { controls })).toThrow("already in progress");
    throw failure;
  };
  controls.addEventListener("change", changed);
  expect(() => fitObject(env.app, env.object, { controls })).toThrow(failure);
  expect(controls.enableDamping).toBe(true);
  expect(controls.autoRotate).toBe(true);
  controls.removeEventListener("change", changed);
  expect(() => fitObject(env.app, env.object, { controls })).not.toThrow();
});
