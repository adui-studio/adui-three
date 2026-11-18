import { expect, test, vi } from "vite-plus/test";
import {
  BoxGeometry,
  Group,
  Line3,
  Mesh,
  MeshBasicMaterial,
  Ray,
  SkinnedMesh,
  Vector3,
} from "three";
import { createCollisionWorld } from "../src/collision.ts";

function fixture() {
  const geometry = new BoxGeometry(20, 1, 20),
    material = new MeshBasicMaterial();
  const floor = new Mesh(geometry, material);
  floor.position.y = -0.5;
  const wall = new Mesh(new BoxGeometry(0.2, 5, 20), material);
  wall.position.set(2, 2, 0);
  return {
    floor,
    wall,
    end: () => {
      geometry.dispose();
      wall.geometry.dispose();
      material.dispose();
    },
  };
}
test("real BVH resolves floor and wall contacts without changing the input capsule", () => {
  const env = fixture(),
    world = createCollisionWorld([env.floor, env.wall]);
  const segment = new Line3(new Vector3(1.8, 0.1, 0), new Vector3(1.8, 1.3, 0));
  const result = world.resolveCapsule(segment, 0.3);
  expect(result.converged).toBe(true);
  expect(result.segment.start.y).toBeGreaterThanOrEqual(0.3);
  expect(result.segment.start.x).toBeLessThan(1.601);
  expect(segment.start.toArray()).toEqual([1.8, 0.1, 0]);
  expect(result.contacts.some((contact) => contact.normal.y > 0.9)).toBe(true);
  expect(result.contacts.some((contact) => contact.normal.x < -0.9)).toBe(true);
  world.dispose();
  env.end();
});
test("snapshot bakes parent transforms, accepts mixed indices, and leaves source buffers and prototypes alone", () => {
  const env = fixture(),
    parent = new Group();
  parent.position.set(0, 3, 0);
  parent.scale.set(2, 1, 0.5);
  parent.add(env.floor);
  const indices = env.floor.geometry.index!.array.slice(),
    prototype = Object.getOwnPropertyDescriptor(Mesh.prototype, "raycast");
  const other = new Mesh(env.wall.geometry.toNonIndexed(), env.wall.material);
  const sourceDispose = vi.spyOn(env.floor.geometry, "dispose");
  const world = createCollisionWorld([parent, env.floor, other]);
  expect(world.triangleCount).toBe(24);
  expect(world.bounds.max.y).toBeGreaterThanOrEqual(3);
  expect(env.floor.geometry.index!.array).toEqual(indices);
  expect(Object.getOwnPropertyDescriptor(Mesh.prototype, "raycast")).toEqual(prototype);
  env.floor.position.y = -100;
  const hit = world.raycast(new Ray(new Vector3(-5, 5, 0), new Vector3(0, -2, 0)));
  expect(hit!.point.y).toBeCloseTo(3);
  expect(hit!.distance).toBeCloseTo(2);
  world.dispose();
  world.dispose();
  expect(sourceDispose).not.toHaveBeenCalled();
  other.geometry.dispose();
  env.end();
});
test("queries and bounds return independent values, including after source disposal", () => {
  const env = fixture(),
    world = createCollisionWorld([env.floor]);
  env.floor.geometry.dispose();
  const ray = new Ray(new Vector3(0, 2, 0), new Vector3(0, -1, 0));
  const hit = world.raycast(ray)!;
  hit.point.y = 99;
  const bounds = world.bounds;
  bounds.max.setScalar(99);
  expect(world.raycast(ray)!.point.y).toBe(0);
  expect(world.bounds.max.y).toBeCloseTo(0, 5);
  expect(world.raycast(ray, 1)).toBeNull();
  world.dispose();
  expect(() => world.raycast(ray)).toThrow(/disposed/);
  env.end();
});
test.each([0, -1, NaN, Infinity])(
  "invalid capsule radius is rejected without poisoning later queries: %s",
  (radius) => {
    const env = fixture(),
      world = createCollisionWorld([env.floor]),
      segment = new Line3(new Vector3(0, 0.2, 0), new Vector3(0, 1.4, 0));
    expect(() => world.resolveCapsule(segment, radius)).toThrow(RangeError);
    expect(world.resolveCapsule(segment, 0.3).converged).toBe(true);
    world.dispose();
    env.end();
  },
);
test("empty and animated sources fail explicitly, and failures release the preparation guard", () => {
  expect(() => createCollisionWorld([])).toThrow();
  expect(() => createCollisionWorld([new Group()])).toThrow(/triangle/);
  const env = fixture(),
    skin = new SkinnedMesh(env.floor.geometry, env.floor.material);
  expect(() => createCollisionWorld([skin])).toThrow(/Bake/);
  env.floor.scale.x = 0;
  expect(() => createCollisionWorld([env.floor])).toThrow(/invertible/);
  env.floor.scale.x = 1;
  const world = createCollisionWorld([env.floor]);
  world.dispose();
  env.end();
});
test("exact surface crossings and sphere-shaped capsules remain finite", () => {
  const env = fixture(),
    world = createCollisionWorld([env.floor]);
  const result = world.resolveCapsule(new Line3(new Vector3(0, 0, 0), new Vector3(0, 0, 0)), 0.3);
  expect(result.segment.start.toArray().every(Number.isFinite)).toBe(true);
  expect(result.converged).toBe(true);
  world.dispose();
  env.end();
});
test("reentrant source reads are rejected and do not corrupt subsequent worlds", () => {
  const env = fixture();
  const update = env.floor.updateWorldMatrix.bind(env.floor);
  const spy = vi.spyOn(env.floor, "updateWorldMatrix").mockImplementation((parents, children) => {
    expect(() => createCollisionWorld([env.wall])).toThrow(/progress/);
    update(parents, children);
  });
  const world = createCollisionWorld([env.floor]);
  spy.mockRestore();
  expect(world.triangleCount).toBe(12);
  world.dispose();
  env.end();
});
