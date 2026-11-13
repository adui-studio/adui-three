import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  BatchedMesh,
  Bone,
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import type { Object3D } from "three";
import { computeObjectBounds } from "../src/geometry.ts";
import { ResourceScope } from "../src/resources.ts";

const scopes: ResourceScope[] = [];
function fixture() {
  const scope = new ResourceScope();
  scopes.push(scope);
  const geometry = scope.track(new BoxGeometry(2, 4, 6));
  const material = scope.track(new MeshBasicMaterial());
  return { scope, geometry, material, mesh: new Mesh(geometry, material) };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const scope of scopes.splice(0)) scope.dispose();
});

test("world bounds include transformed parents and hidden descendants in native world axes", () => {
  const env = fixture(),
    parent = new Group(),
    root = new Group();
  parent.position.set(10, 20, 30);
  parent.scale.set(-2, 3, 0.5);
  parent.add(root);
  root.position.set(2, 1, -4);
  root.add(env.mesh);
  env.mesh.visible = false;
  const box = computeObjectBounds(root);
  expect(box.min.toArray()).toEqual([4, 17, 26.5]);
  expect(box.max.toArray()).toEqual([8, 29, 29.5]);
  expect(box.getSize(new Vector3()).toArray()).toEqual([4, 12, 3]);
});

test("paused skin and morph bounds refresh sibling bones and attached binding without GPU bone textures", () => {
  const env = fixture();
  const geometry = env.scope.track(new BufferGeometry());
  geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute(
    "skinIndex",
    new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  );
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = [new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 0], 3)];
  const skin = new SkinnedMesh(geometry, env.material),
    parent = new Group(),
    bone = new Bone();
  parent.add(skin, bone);
  parent.updateMatrixWorld(true);
  const skeleton = env.scope.track(new Skeleton([bone]));
  skin.bind(skeleton);
  skin.computeBoundingBox();
  bone.position.x = 3;
  parent.position.set(10, 20, 0);
  parent.scale.setScalar(2);
  skin.morphTargetInfluences![0] = 1;
  const box = computeObjectBounds(skin);
  expect(box.min.toArray()).toEqual([16, 20, 0]);
  expect(box.max.toArray()).toEqual([20, 22, 0]);
  expect(skeleton.boneTexture).toBeNull();
  expect(geometry.getAttribute("position").getX(1)).toBe(1);
});

test("native instance matrices, active count and edited geometry invalidate stale cached bounds", () => {
  const env = fixture();
  const mesh = env.scope.track(new InstancedMesh(env.geometry, env.material, 2));
  mesh.setMatrixAt(0, new Matrix4());
  mesh.setMatrixAt(1, new Matrix4().makeTranslation(20, 0, 0));
  mesh.computeBoundingBox();
  mesh.setMatrixAt(0, new Matrix4().makeTranslation(5, 0, 0));
  mesh.count = 1;
  env.geometry.getAttribute("position").setXYZ(0, 4, 2, 3);
  const version = mesh.instanceMatrix.version;
  const box = computeObjectBounds(mesh);
  expect(box.min.x).toBe(4);
  expect(box.max.x).toBe(9);
  expect(mesh.instanceMatrix.version).toBe(version);
  expect((env.geometry.getAttribute("position") as Float32BufferAttribute).version).toBe(0);
  mesh.count = 0;
  expect(() => computeObjectBounds(mesh)).toThrow("no finite bounds");
});

test("native batch bounds follow current matrices and deletion without retaining a stale aggregate", () => {
  const env = fixture();
  const mesh = env.scope.track(new BatchedMesh(2, 24, 36, env.material));
  const geometry = mesh.addGeometry(env.geometry),
    a = mesh.addInstance(geometry),
    b = mesh.addInstance(geometry);
  mesh.setMatrixAt(a, new Matrix4());
  mesh.setMatrixAt(b, new Matrix4().makeTranslation(20, 0, 0));
  mesh.computeBoundingBox();
  mesh.deleteInstance(b);
  mesh.setMatrixAt(a, new Matrix4().makeTranslation(-5, 0, 0));
  const box = computeObjectBounds(mesh);
  expect(box.min.toArray()).toEqual([-6, -2, -3]);
  expect(box.max.toArray()).toEqual([-4, 2, 3]);
});

test("results are independent mutable snapshots and borrowed geometry/material stay owned by the caller", () => {
  const env = fixture();
  const geometry = vi.spyOn(env.geometry, "dispose"),
    material = vi.spyOn(env.material, "dispose");
  const first = computeObjectBounds(env.mesh);
  first.min.setScalar(-100);
  const second = computeObjectBounds(env.mesh);
  expect(second.min.toArray()).toEqual([-1, -2, -3]);
  env.mesh.position.x = 10;
  expect(computeObjectBounds(env.mesh).min.x).toBe(9);
  expect(second.min.x).toBe(-1);
  expect(geometry).not.toHaveBeenCalled();
  expect(material).not.toHaveBeenCalled();
});

test("zero extent is measurable but empty, nonfinite and invalid inputs reject", () => {
  const env = fixture();
  const point = env.scope.track(new BufferGeometry());
  point.setAttribute("position", new Float32BufferAttribute([2, 3, 4], 3));
  const box = computeObjectBounds(new Mesh(point, env.material));
  expect(box.min.toArray()).toEqual([2, 3, 4]);
  expect(box.getSize(new Vector3()).toArray()).toEqual([0, 0, 0]);
  expect(() => computeObjectBounds(new Group())).toThrow("no finite bounds");
  expect(() => computeObjectBounds(null as unknown as Object3D)).toThrow(TypeError);
  point.getAttribute("position").setX(0, NaN);
  expect(() => computeObjectBounds(new Mesh(point, env.material))).toThrow("no finite bounds");
});

test("same-root reentry rejects and preparation errors release the guard for a later request", () => {
  const env = fixture();
  vi.spyOn(env.mesh, "updateWorldMatrix").mockImplementationOnce(() => {
    expect(() => computeObjectBounds(env.mesh)).toThrow("in progress");
    throw new Error("native preparation");
  });
  expect(() => computeObjectBounds(env.mesh)).toThrow("native preparation");
  expect(computeObjectBounds(env.mesh).min.toArray()).toEqual([-1, -2, -3]);
});
