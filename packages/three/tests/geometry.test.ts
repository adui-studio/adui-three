import { expect, test, vi } from "vite-plus/test";
import {
  BoxGeometry,
  Color,
  DataTexture,
  Group,
  Matrix4,
  MeshBasicMaterial,
  Raycaster,
  Scene,
  Vector3,
} from "three";
import type { Material } from "three";
import type { ThreeApp } from "../src/three-app.ts";
import { ResourceScope } from "../src/resources.ts";
import { createInstancedMesh } from "../src/geometry.ts";

function fixture() {
  const controller = new AbortController();
  const value = {
    state: "ready",
    resources: new ResourceScope(),
    scene: new Scene(),
    signal: controller.signal,
  };
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial();
  const app = value as unknown as ThreeApp;
  return {
    app,
    value,
    geometry,
    material,
    controller,
    create: (capacity = 4) => createInstancedMesh(app, { geometry, material, capacity }),
  };
}

test("instances start with zero count, fixed capacity and borrowed geometry/material", () => {
  const env = fixture();
  const handle = env.create();
  expect(handle.capacity).toBe(4);
  expect(handle.mesh.count).toBe(0);
  expect(handle.mesh.instanceMatrix.count).toBe(4);
  expect(handle.mesh.parent).toBe(env.value.scene);
  expect(handle.mesh.geometry).toBe(env.geometry);
  expect(handle.mesh.material).toBe(env.material);
  handle.dispose();
});

test("matrix/count edits invalidate native bounds and upload versions without retaining inputs", () => {
  const env = fixture();
  const handle = env.create();
  const matrix = new Matrix4().makeTranslation(2, 0, 0);
  const version = handle.mesh.instanceMatrix.version;
  handle.setMatrixAt(0, matrix);
  matrix.makeTranslation(100, 0, 0);
  handle.setCount(1);
  handle.mesh.computeBoundingSphere();
  handle.mesh.computeBoundingBox();
  expect(handle.mesh.boundingSphere!.center.x).toBeCloseTo(2);
  expect(handle.mesh.instanceMatrix.version).toBe(version + 1);
  handle.setMatrixAt(0, new Matrix4().makeTranslation(-2, 0, 0));
  expect(handle.mesh.boundingSphere).toBeNull();
  expect(handle.mesh.boundingBox).toBeNull();
  handle.mesh.getMatrixAt(0, matrix);
  expect(matrix.elements[12]).toBe(-2);
  handle.mesh.computeBoundingSphere();
  handle.setCount(0);
  expect(handle.mesh.boundingSphere).toBeNull();
  handle.dispose();
});

test("invalid slot, count, nonfinite/projective/degenerate/reflected Float32 transforms preserve data", () => {
  const env = fixture();
  const handle = env.create(2);
  const before = handle.mesh.instanceMatrix.array.slice();
  for (const index of [-1, 2, 0.5, NaN])
    expect(() => handle.setMatrixAt(index, new Matrix4())).toThrow(RangeError);
  for (const count of [-1, 3, 0.5, Infinity])
    expect(() => handle.setCount(count)).toThrow(RangeError);
  const projected = new Matrix4();
  projected.elements[3] = 1;
  for (const matrix of [
    projected,
    new Matrix4().makeScale(0, 1, 1),
    new Matrix4().makeScale(-1, 1, 1),
    new Matrix4().makeScale(1e-50, 1, 1),
    new Matrix4().makeTranslation(1e100, 0, 0),
  ])
    expect(() => handle.setMatrixAt(0, matrix)).toThrow(RangeError);
  expect(handle.mesh.instanceMatrix.array).toEqual(before);
  expect(handle.mesh.count).toBe(0);
  handle.dispose();
});

test("linear colors are copied into lazy instance storage and never mutate borrowed material", () => {
  const env = fixture();
  const handle = env.create();
  const color = new Color(0xff0000);
  const original = env.material.color.clone();
  handle.setColorAt(3, color);
  color.set(0x00ff00);
  const result = new Color();
  handle.mesh.getColorAt(3, result);
  expect(result.r).toBe(1);
  expect(result.g).toBe(0);
  expect(handle.mesh.instanceColor!.count).toBe(4);
  expect(handle.mesh.instanceColor!.version).toBe(1);
  expect(env.material.color.equals(original)).toBe(true);
  expect(() => handle.setColorAt(0, new Color().setRGB(-1, 0, 0))).toThrow(RangeError);
  expect(() => handle.setColorAt(0, new Color().setRGB(Infinity, 0, 0))).toThrow(RangeError);
  handle.dispose();
});

test("native raycasting sees newly moved bounds and returns the instance id", () => {
  const env = fixture();
  const handle = env.create();
  handle.setMatrixAt(2, new Matrix4().makeTranslation(3, 0, 0));
  handle.setCount(3);
  handle.mesh.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(3, 0, 5), new Vector3(0, 0, -1));
  expect(ray.intersectObject(handle.mesh)[0]!.instanceId).toBe(2);
  handle.setMatrixAt(2, new Matrix4().makeTranslation(-3, 0, 0));
  expect(ray.intersectObject(handle.mesh)).toHaveLength(0);
  ray.set(new Vector3(-3, 0, 5), new Vector3(0, 0, -1));
  expect(ray.intersectObject(handle.mesh)[0]!.instanceId).toBe(2);
  handle.dispose();
});

test("cleanup owns only the node/instance attributes/morph texture and continues after listener errors", () => {
  const env = fixture();
  const handle = env.create();
  handle.setColorAt(0, new Color(0xffffff));
  handle.mesh.morphTexture = new DataTexture();
  const texture = vi.spyOn(handle.mesh.morphTexture, "dispose");
  const matrix = vi.spyOn(handle.mesh.instanceMatrix, "dispose");
  const color = vi.spyOn(handle.mesh.instanceColor!, "dispose");
  const geometry = vi.spyOn(env.geometry, "dispose");
  const material = vi.spyOn(env.material, "dispose");
  const child = new Group();
  const borrowed = vi.spyOn(child, "dispose");
  handle.mesh.add(child);
  handle.resources.track({
    dispose: () => {
      throw new Error("extension");
    },
  });
  handle.mesh.addEventListener("dispose", () => {
    throw new Error("node listener");
  });
  expect(() => handle.dispose()).toThrow(AggregateError);
  expect(matrix).toHaveBeenCalledOnce();
  expect(color).toHaveBeenCalledOnce();
  expect(texture).toHaveBeenCalledOnce();
  expect(geometry).not.toHaveBeenCalled();
  expect(material).not.toHaveBeenCalled();
  expect(borrowed).not.toHaveBeenCalled();
  expect(handle.mesh.parent).toBeNull();
  expect(handle.disposed).toBe(true);
  expect(() => handle.dispose()).not.toThrow();
});

test("detached handles remain app-owned and material arrays snapshot references", () => {
  const env = fixture();
  const materials = [env.material];
  const handle = createInstancedMesh(env.app, {
    geometry: env.geometry,
    material: materials,
    capacity: 2,
    count: 1,
    addToScene: false,
  });
  materials.push(new MeshBasicMaterial());
  expect(handle.mesh.material).toHaveLength(1);
  expect(handle.mesh.parent).toBeNull();
  env.value.resources.dispose();
  expect(handle.disposed).toBe(true);
  expect(() => handle.setCount(1)).toThrow("disposed");
});

test("invalid configuration and ended owners reject before attachment", () => {
  const env = fixture();
  for (const capacity of [0, -1, 0.5, Infinity])
    expect(() => env.create(capacity)).toThrow(RangeError);
  expect(() =>
    createInstancedMesh(env.app, {
      geometry: env.geometry,
      material: [] as Material[],
      capacity: 2,
    }),
  ).toThrow(TypeError);
  expect(() =>
    createInstancedMesh(env.app, {
      geometry: env.geometry,
      material: env.material,
      capacity: 2,
      count: 3,
    }),
  ).toThrow(RangeError);
  expect(env.value.scene.children).toHaveLength(0);
  env.controller.abort();
  expect(() => env.create()).toThrow("disposed");
});

test("synchronous attachment disposal rolls back the instance without taking borrowed assets", () => {
  const env = fixture();
  const geometry = vi.spyOn(env.geometry, "dispose");
  env.value.scene.addEventListener("childadded", () => env.value.resources.dispose());
  expect(() => env.create()).toThrow("disposed");
  expect(env.value.scene.children).toHaveLength(0);
  expect(geometry).not.toHaveBeenCalled();
});
