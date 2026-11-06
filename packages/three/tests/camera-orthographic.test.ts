import { expect, test, vi } from "vite-plus/test";
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import type { Box3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { computeOrthographicFrame, fitOrthographicObject } from "../src/camera.ts";
import type { OrthographicThreeApp, ThreeAppState } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";
import type { FitObjectOptions } from "../src/camera.ts";

// Native controls here stay unconnected: they install no DOM listeners or GPU resources.
function fixture() {
  const camera = new OrthographicCamera(-8, 8, 4, -4, 0, 1000);
  camera.position.set(4, 3, 8);
  camera.lookAt(0, 0, 0);
  const object = new Mesh(new BoxGeometry(2, 4, 3), new MeshBasicMaterial());
  const state = {
    camera,
    state: "stopped" as ThreeAppState,
    size: { width: 800, height: 400, pixelRatio: 2 },
    resources: new ResourceScope(),
    start: vi.fn(),
    onUpdate: vi.fn(),
    renderer: { render: vi.fn() },
  };
  return { camera, object, state, app: state as unknown as OrthographicThreeApp };
}

function contained(camera: OrthographicCamera, bounds: Box3): void {
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        for (const value of new Vector3(x, y, z).project(camera).toArray()) {
          expect(Number.isFinite(value)).toBe(true);
          expect(Math.abs(value)).toBeLessThanOrEqual(1 + 1e-6);
        }
}

test("orthographic planning leaves the camera unchanged and fits all world-bound corners", () => {
  const { camera, object } = fixture();
  object.position.set(7, 9, -2);
  object.rotation.set(0.3, 0.8, 0.2);
  const before = camera.toJSON();
  const frame = computeOrthographicFrame(camera, object, { direction: [1e300, 2e300, 1e300] });
  expect(camera.toJSON()).toEqual(before);
  expect(frame.center.toArray()).toEqual([7, 9, -2]);
  expect(frame.zoom).toBeGreaterThan(0);
  camera.position.copy(frame.position);
  camera.zoom = frame.zoom;
  camera.near = frame.near;
  camera.far = frame.far;
  camera.lookAt(frame.center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  contained(camera, frame.bounds);
});

test("a narrow orthographic viewport and larger padding reduce the recommended zoom", () => {
  const { camera, object } = fixture();
  const original = computeOrthographicFrame(camera, object);
  camera.left = -2;
  camera.right = 2;
  const narrow = computeOrthographicFrame(camera, object);
  expect(narrow.zoom).toBeCloseTo(original.zoom / 2);
  expect(computeOrthographicFrame(camera, object, { padding: 2.4 }).zoom).toBeCloseTo(
    narrow.zoom / 2,
  );
  camera.zoom = 20;
  expect(computeOrthographicFrame(camera, object).zoom).toBe(narrow.zoom);
});

test("orthographic fitting prepares externally parented bones and current bind inverses", () => {
  const { camera, object, app } = fixture();
  const geometry = object.geometry,
    count = geometry.attributes.position!.count;
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let index = 0; index < count; index++) weights[index * 4] = 1;
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const skin = new SkinnedMesh(geometry, object.material),
    bone = new Bone(),
    parent = new Group();
  parent.add(skin, bone);
  parent.updateMatrixWorld(true);
  skin.bind(new Skeleton([bone]));
  parent.position.set(10, 20, 30);
  parent.scale.setScalar(2);
  bone.position.x = 5;
  const frame = fitOrthographicObject(app, skin);
  expect(frame.center.toArray()).toEqual([20, 20, 30]);
  expect(frame.bounds.getSize(new Vector3()).toArray()).toEqual([4, 8, 6]);
  expect(skin.skeleton.boneTexture).toBeNull();
  contained(camera, frame.bounds);
  skin.skeleton.dispose();
});

test("orthographic fitting rejects unsupported camera layouts and invalid inputs before pose writes", () => {
  const mutations: Array<(camera: OrthographicCamera) => void> = [
    (camera) => {
      camera.left = -7;
    },
    (camera) => {
      camera.top = 0;
    },
    (camera) => {
      new Group().add(camera);
    },
    (camera) => {
      camera.scale.x = 2;
    },
    (camera) => {
      camera.matrixAutoUpdate = false;
    },
    (camera) => {
      camera.matrixWorldAutoUpdate = false;
    },
    (camera) => {
      camera.setViewOffset(800, 400, 0, 0, 400, 400);
    },
    (camera) => {
      camera.zoom = 0;
    },
    (camera) => {
      camera.up.set(0, 0, 0);
    },
  ];
  for (const mutate of mutations) {
    const { camera, object, app } = fixture(),
      position = camera.position.toArray();
    mutate(camera);
    expect(() => fitOrthographicObject(app, object)).toThrow(RangeError);
    expect(camera.position.toArray()).toEqual(position);
  }
  const { camera, object } = fixture();
  for (const options of [
    { padding: 0.9 },
    { padding: Infinity },
    { minimumDistance: -1 },
    { direction: [0, 0, 0] as const },
    { direction: [0, NaN, 1] as const },
  ])
    expect(() => computeOrthographicFrame(camera, object, options)).toThrow(RangeError);
  expect(() => computeOrthographicFrame(camera, new Group())).toThrow("bounds");
  object.scale.set(0, 0, 0);
  expect(() => computeOrthographicFrame(camera, object)).toThrow("numeric range");
});

test("an applied fit writes zoom and clipping but never draws, starts or subscribes", () => {
  const { app, camera, object, state } = fixture();
  const span = [camera.left, camera.right, camera.top, camera.bottom];
  const frame = fitOrthographicObject(app, object, { minimumDistance: 30 });
  expect(frame.distance).toBe(30);
  expect(camera.position.distanceTo(frame.center)).toBeCloseTo(30);
  expect(camera.zoom).toBe(frame.zoom);
  expect([camera.left, camera.right, camera.top, camera.bottom]).toEqual(span);
  expect(camera.near).toBe(frame.near);
  expect(camera.far).toBe(frame.far);
  expect(state.start).not.toHaveBeenCalled();
  expect(state.renderer.render).not.toHaveBeenCalled();
  expect(state.onUpdate).not.toHaveBeenCalled();
  expect(state.resources.disposed).toBe(false);
  contained(camera, frame.bounds);
});

test("native orthographic controls preserve configuration while respecting target, zoom and distance", () => {
  const { app, camera, object } = fixture(),
    controls = new OrbitControls(camera);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.minDistance = 20;
  controls.minZoom = 0.1;
  controls.maxZoom = 3;
  const frame = fitOrthographicObject(app, object, { controls });
  expect(frame.distance).toBe(20);
  expect(controls.target.toArray()).toEqual(frame.center.toArray());
  expect(controls.enableDamping).toBe(true);
  expect(controls.autoRotate).toBe(true);
  expect(controls.minZoom).toBe(0.1);
  expect(controls.maxZoom).toBe(3);
  expect(camera.zoom).toBeCloseTo(frame.zoom);
  contained(camera, frame.bounds);
});

test("impossible orthographic zoom, distance and target constraints reject without replacing the pose", () => {
  const mutations: Array<(controls: OrbitControls) => void> = [
    (controls) => {
      controls.minZoom = 10;
    },
    (controls) => {
      controls.maxZoom = 0.01;
    },
    (controls) => {
      controls.minZoom = NaN;
    },
    (controls) => {
      controls.maxDistance = 1;
    },
    (controls) => {
      controls.minDistance = Infinity;
    },
    (controls) => {
      controls.maxTargetRadius = -1;
    },
    (controls) => {
      controls.minPolarAngle = 4;
    },
    (controls) => {
      controls.cursor.x = NaN;
    },
  ];
  for (const mutate of mutations) {
    const { app, camera, object } = fixture(),
      controls = new OrbitControls(camera);
    mutate(controls);
    const pose = camera.position.toArray(),
      zoom = camera.zoom;
    expect(() => fitOrthographicObject(app, object, { controls })).toThrow(RangeError);
    expect(camera.position.toArray()).toEqual(pose);
    expect(camera.zoom).toBe(zoom);
  }
});

test("orthographic clipping can retain near zero but refuses an insufficient existing range", () => {
  const { app, camera, object } = fixture();
  fitOrthographicObject(app, object, { adjustClipping: false });
  expect([camera.near, camera.far]).toEqual([0, 1000]);
  camera.far = 1;
  const pose = camera.position.toArray();
  expect(() => fitOrthographicObject(app, object, { adjustClipping: false })).toThrow("clipping");
  expect(camera.position.toArray()).toEqual(pose);
});

test("orthographic fitting checks host lifetime, viewport and control ownership", () => {
  const { app, state, object } = fixture();
  state.size.width = 0;
  expect(() => fitOrthographicObject(app, object)).toThrow("nonzero");
  state.size.width = 800;
  const other = new OrbitControls(new OrthographicCamera());
  expect(() => fitOrthographicObject(app, object, { controls: other })).toThrow("different camera");

  state.resources.dispose();
  expect(() => fitOrthographicObject(app, object)).toThrow("disposed");
});

test("the orthographic write lock covers custom vertex preparation and releases after failure", () => {
  const { app, object } = fixture();
  const original = object.getVertexPosition.bind(object);
  const probe = vi.spyOn(object, "getVertexPosition").mockImplementation((index, target) => {
    expect(() => fitOrthographicObject(app, object)).toThrow("in progress");
    return original(index, target);
  });
  fitOrthographicObject(app, object);
  expect(probe).toHaveBeenCalled();
  probe.mockImplementationOnce(() => {
    throw new Error("vertex");
  });
  expect(() => fitOrthographicObject(app, object)).toThrow("vertex");
  probe.mockRestore();
  expect(() => fitOrthographicObject(app, object)).not.toThrow();
});

test("ending the model preparation owner rejects the fit before writing camera fields", () => {
  const { app, object, camera, state } = fixture(),
    pose = camera.position.toArray();
  const original = object.getVertexPosition.bind(object);
  vi.spyOn(object, "getVertexPosition").mockImplementation((index, target) => {
    state.resources.dispose();
    return original(index, target);
  });
  expect(() => fitOrthographicObject(app, object)).toThrow("disposed");
  expect(camera.position.toArray()).toEqual(pose);
});

test("throwing option getters cannot leak the orthographic fit lock", () => {
  const { app, object } = fixture();
  const options: FitObjectOptions = {
    get controls(): OrbitControls {
      throw new Error("options");
    },
  };
  expect(() => fitOrthographicObject(app, object, options)).toThrow("options");
  expect(() => fitOrthographicObject(app, object)).not.toThrow();
});

test("native control update errors restore damping and autorotation and release the fit lock", () => {
  const { app, object, camera } = fixture(),
    controls = new OrbitControls(camera);
  controls.enableDamping = true;
  controls.autoRotate = true;
  vi.spyOn(controls, "update").mockImplementationOnce(() => {
    throw new Error("controls");
  });
  expect(() => fitOrthographicObject(app, object, { controls })).toThrow("controls");
  expect(controls.enableDamping).toBe(true);
  expect(controls.autoRotate).toBe(true);
  expect(() => fitOrthographicObject(app, object)).not.toThrow();
});
