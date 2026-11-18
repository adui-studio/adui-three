import { afterEach, expect, test } from "vite-plus/test";
import { BoxGeometry, Mesh, Vector3 } from "three";
import { createCollisionWorld } from "../src/collision.ts";
import { createCharacterBody } from "../src/character-body.ts";
import type { CharacterBodyOptions } from "../src/character-body.ts";
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});
function fixture(overrides: Partial<CharacterBodyOptions> = {}) {
  const floor = new Mesh(new BoxGeometry(30, 1, 30));
  floor.position.y = -0.5;
  const wall = new Mesh(new BoxGeometry(0.5, 5, 20));
  wall.position.set(2, 2, 0);
  const roof = new Mesh(new BoxGeometry(30, 0.5, 30));
  roof.position.y = 3.25;
  const world = createCollisionWorld([floor, wall, roof]);
  cleanup.push(() => {
    world.dispose();
    for (const mesh of [floor, wall, roof]) {
      mesh.geometry.dispose();
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        material.dispose();
    }
  });
  const body = createCharacterBody({
    position: new Vector3(0, 0.01, 0),
    world,
    radius: 0.3,
    height: 1.8,
    gravity: 20,
    jumpSpeed: 8,
    terminalSpeed: 20,
    maxSubsteps: 32,
    groundCosine: Math.cos(Math.PI / 4),
    ...overrides,
  });
  return { body, world };
}
const live = () => true;
test("real BVH motor lands, slides along a wall and keeps a supported capsule", () => {
  const { body } = fixture();
  for (let i = 0; i < 120; i++) body.step(1 / 60, new Vector3(4, 0, -1), false, live);
  expect(body.position.x).toBeCloseTo(1.45, 3);
  expect(body.position.z).toBeLessThan(-1.8);
  expect(body.position.y).toBeCloseTo(0, 3);
  expect(body.grounded).toBe(true);
  expect(body.velocity.x).toBeCloseTo(0, 6);
});
test("jump is grounded only, a ceiling cancels upward velocity and gravity lands again", () => {
  const { body } = fixture();
  const idle = new Vector3();
  for (let i = 0; i < 10; i++) body.step(1 / 60, idle, false, live);
  expect(body.grounded).toBe(true);
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    body.step(1 / 60, idle, i === 0, live);
    peak = Math.max(peak, body.position.y);
  }
  expect(peak).toBeGreaterThan(0.9);
  expect(peak).toBeLessThanOrEqual(1.201);
  expect(body.position.y).toBeCloseTo(0, 3);
  expect(body.grounded).toBe(true);
});
test("oversized steps and disposed worlds do not partially commit character state", () => {
  const { body, world } = fixture();
  const original = body.position.clone();
  expect(() => body.step(10, new Vector3(4, 0, 0), false, live)).toThrow(/budget/);
  expect(body.position.equals(original)).toBe(true);
  expect(body.velocity.length()).toBe(0);
  world.dispose();
  expect(() => body.step(1 / 60, new Vector3(), false, live)).toThrow(/disposed/);
  expect(body.position.equals(original)).toBe(true);
});
test("ending the owner during a collision query discards the candidate", () => {
  const { body, world } = fixture();
  let alive = true;
  const query = world.resolveCapsule;
  world.resolveCapsule = (segment, radius) => {
    const result = query(segment, radius);
    alive = false;
    return result;
  };
  const old = body.position.clone();
  expect(body.step(1 / 60, new Vector3(3, 0, 0), false, () => alive)).toBe(false);
  expect(body.position.equals(old)).toBe(true);
});
test("teleport copies its input, resolves overlap and resets velocity", () => {
  const { body } = fixture();
  body.step(1 / 60, new Vector3(1, 0, 0), false, live);
  const target = new Vector3(1.6, -0.02, 1);
  const snapshot = target.clone();
  expect(body.teleport(target, live)).toBe(true);
  expect(target.equals(snapshot)).toBe(true);
  expect(body.position.x).toBeLessThanOrEqual(1.451);
  expect(body.position.y).toBeCloseTo(0, 3);
  expect(body.velocity.length()).toBe(0);
  target.x = 99;
  expect(body.position.x).toBeLessThan(2);
});
