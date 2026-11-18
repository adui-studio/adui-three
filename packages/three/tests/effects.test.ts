import { afterEach, expect, test, vi } from "vite-plus/test";
import { LineCurve3, Scene, Vector3 } from "three";
import { ResourceScope } from "../src/resources.ts";
import { attachFlyLine, attachLightWall, attachRadar } from "../src/effects.ts";
import { renderWithRetirement } from "../src/render-retirement.ts";
import type { AnyThreeApp, FrameInfo } from "../src/index.ts";
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanups.splice(0).reverse()) fn();
});
function fixture() {
  const resources = new ResourceScope(),
    scope = new ResourceScope(),
    updates = new Set<(f: FrameInfo) => void>(),
    scene = new Scene(),
    renderer = {};
  const value = {
    resources,
    scene,
    renderer,
    state: "running",
    onUpdate(fn: (f: FrameInfo) => void) {
      updates.add(fn);
      return () => {
        updates.delete(fn);
      };
    },
  };
  cleanups.push(() => {
    scope.dispose();
    resources.dispose();
  });
  return {
    app: value as unknown as AnyThreeApp,
    ...value,
    scope,
    updates,
    tick(delta: number) {
      for (const fn of Array.from(updates)) if (updates.has(fn)) fn({ delta, elapsed: delta });
    },
  };
}
const factories = [
  (app: AnyThreeApp) =>
    attachFlyLine(app, { curve: new LineCurve3(new Vector3(), new Vector3(4, 1, 0)) }),
  (app: AnyThreeApp) =>
    attachLightWall(app, { points: [new Vector3(), new Vector3(2, 0, 0), new Vector3(2, 0, 2)] }),
  (app: AnyThreeApp) => attachRadar(app),
];
for (const [index, create] of factories.entries()) {
  test(
    "effect " + index + " shares the host clock, freezes independently and seeks without drawing",
    () => {
      const e = fixture(),
        h = create(e.app),
        peer = attachRadar(e.app);
      e.tick(1);
      expect(h.phase).toBe(0.25);
      h.pause();
      e.tick(1);
      expect(h.phase).toBe(0.25);
      expect(peer.phase).toBe(0.5);
      h.seek(0.8);
      expect(h.phase).toBe(0.8);
      h.setSpeed(2);
      h.resume();
      e.tick(0.2);
      expect(h.phase).toBeCloseTo(0.2);
      h.setSpeed(0);
      e.tick(10);
      expect(h.phase).toBeCloseTo(0.2);
      expect(h.state).toBe("running");
    },
  );
  test(
    "effect " + index + " releases only its own GPU resources after a native draw finishes",
    () => {
      const e = fixture(),
        h = create(e.app),
        geometry = vi.spyOn(h.mesh.geometry, "dispose"),
        material = vi.spyOn(h.mesh.material, "dispose");
      renderWithRetirement(e.renderer, () => {
        h.dispose();
        expect(h.disposed).toBe(true);
        expect(h.mesh.parent).toBe(e.scene);
        expect(geometry).not.toHaveBeenCalled();
      });
      expect(geometry).toHaveBeenCalledOnce();
      expect(material).toHaveBeenCalledOnce();
      expect(e.updates.size).toBe(0);
      h.dispose();
      expect(() => h.seek(0)).toThrow(/disposed/);
    },
  );
}
test("scope ownership, hidden placement and early mounting disposal roll back all resources", () => {
  const e = fixture(),
    h = attachRadar(e.app, { scope: e.scope, addToScene: false });
  expect(h.mesh.parent).toBeNull();
  e.scene.add(h.mesh);
  e.scope.dispose();
  expect(h.disposed).toBe(true);
  expect(e.scene.children).toHaveLength(0);
  expect(e.updates.size).toBe(0);
  const ended = fixture();
  ended.scene.addEventListener("childadded", () => ended.resources.dispose());
  expect(() => attachRadar(ended.app)).toThrow(/disposed/);
  expect(ended.scene.children).toHaveLength(0);
});
test("invalid parameters allocate no managed nodes and overflowing time ends the effect", () => {
  const e = fixture();
  for (const radius of [0, NaN, Infinity]) expect(() => attachRadar(e.app, { radius })).toThrow();
  expect(() => attachRadar(e.app, { tail: 0 })).toThrow();
  expect(() => attachLightWall(e.app, { points: [new Vector3(), new Vector3(0, 2, 0)] })).toThrow(
    /vertical/,
  );
  expect(e.scene.children).toHaveLength(0);
  const h = attachRadar(e.app);
  expect(() => h.setSpeed(-1)).toThrow();
  expect(() => h.seek(2)).toThrow();
  h.setSpeed(Number.MAX_VALUE);
  expect(() => e.tick(2)).toThrow(/numeric/);
  expect(h.disposed).toBe(true);
});

test("GPU uniforms reject Float32 overflow and a tail that would quantize to zero", () => {
  const e = fixture();
  expect(() => attachRadar(e.app, { intensity: 1e100 })).toThrow(/Float32/);
  expect(() => attachRadar(e.app, { tail: 1e-100 })).toThrow(/tail/);
  expect(() =>
    attachFlyLine(e.app, { curve: new LineCurve3(new Vector3(), new Vector3(1e-100, 0, 0)) }),
  ).toThrow(/Float32/);
  expect(e.scene.children).toHaveLength(0);
});
