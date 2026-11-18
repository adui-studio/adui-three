import { afterEach, expect, test } from "vite-plus/test";
import { BoxGeometry, Mesh, Vector3 } from "three";
import { createCollisionWorld } from "../src/collision.ts";
import { createCharacterBody } from "../src/navigation/character-body.ts";
import type { CharacterBodyOptions } from "../src/navigation/character-body.ts";
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

test("tiny host steps retain ground support across the collision skin and do not drop jump commands", () => {
  const { body } = fixture();
  const idle = new Vector3();
  for (let i = 0; i < 10; i++) body.step(1 / 60, idle, false, live);
  const floor = body.position.y;
  for (let i = 0; i < 30; i++) {
    body.step(1e-6, idle, false, live);
    expect(body.grounded).toBe(true);
    expect(body.position.y).toBeCloseTo(floor, 6);
  }
  body.step(1 / 60, idle, true, live);
  expect(body.position.y).toBeGreaterThan(0.05);
  expect(body.velocity.y).toBeGreaterThan(0);
});
test("support probes do not ground an ascent or a capsule beyond the floor", () => {
  const { body } = fixture();
  const idle = new Vector3();
  body.teleport(new Vector3(16, 0.01, 0), live);
  body.step(1e-6, idle, false, live);
  expect(body.grounded).toBe(false);
  expect(body.position.x).toBe(16);
  body.teleport(new Vector3(0, 0.01, 0), live);
  for (let i = 0; i < 10; i++) body.step(1 / 60, idle, false, live);
  body.step(1e-4, idle, true, live);
  expect(body.grounded).toBe(false);
  expect(body.velocity.y).toBeGreaterThan(0);
});
test("ending the owner during the extra support probe discards all candidate motion", () => {
  const { body, world } = fixture();
  const idle = new Vector3();
  for (let i = 0; i < 10; i++) body.step(1 / 60, idle, false, live);
  const old = body.position.clone(),
    query = world.resolveCapsule;
  let calls = 0,
    alive = true;
  world.resolveCapsule = (segment, radius) => {
    const result = query(segment, radius);
    if (++calls === 2) alive = false;
    return result;
  };
  expect(body.step(1e-6, idle, false, () => alive)).toBe(false);
  expect(calls).toBe(2);
  expect(body.position.equals(old)).toBe(true);
});
test("mixed frame steps retain support while moving against a wall", () => {
  const { body } = fixture();
  const move = new Vector3(4, 0, 0),
    idle = new Vector3();
  for (let i = 0; i < 120; i++) body.step(1 / 60, move, false, live);
  for (let i = 0; i < 30; i++)
    for (const delta of [1e-6, 1 / 120, 1 / 60, 0.004, 1 / 30]) {
      body.step(delta, move, false, live);
      expect(body.grounded).toBe(true);
    }
  body.step(1 / 60, idle, true, live);
  expect(body.position.y).toBeGreaterThan(0.05);
});
