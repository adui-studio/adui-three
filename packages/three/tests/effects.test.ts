import { afterEach, expect, test, vi } from "vite-plus/test";
import { LineCurve3, Scene, Vector3 } from "three";
import { ResourceScope } from "../src/resources.ts";
import {
  attachFlyLine,
  attachLightWall,
  attachRadar,
  attachRipple,
  attachLightPillar,
  attachShield,
  attachFlyPoints,
  attachFlowLine,
} from "../src/effects.ts";
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
  (app: AnyThreeApp) => attachRipple(app),
  (app: AnyThreeApp) => attachLightPillar(app),
  (app: AnyThreeApp) => attachShield(app),
  (app: AnyThreeApp) =>
    attachFlowLine(app, { curve: new LineCurve3(new Vector3(), new Vector3(4, 0, 0)) }),
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

test("new effects build native geometry with the documented local placement", () => {
  const e = fixture(),
    ring = attachRipple(e.app, { radius: 3, segments: 32, rings: 2 }),
    pillar = attachLightPillar(e.app, { radius: 0.5, height: 5, segments: 32 }),
    shield = attachShield(e.app, { radius: 3, segments: 32 });
  ring.mesh.geometry.computeBoundingBox();
  pillar.mesh.geometry.computeBoundingBox();
  shield.mesh.geometry.computeBoundingBox();
  expect(ring.mesh.geometry.boundingBox!.min.toArray()).toEqual([-3, expect.closeTo(0, 6), -3]);
  expect(ring.mesh.geometry.boundingBox!.max.toArray()).toEqual([3, expect.closeTo(0, 6), 3]);
  expect(pillar.mesh.geometry.boundingBox!.min.toArray()).toEqual([-0.5, 0, -0.5]);
  expect(pillar.mesh.geometry.boundingBox!.max.toArray()).toEqual([0.5, 5, 0.5]);
  expect(shield.mesh.geometry.boundingBox!.min.toArray()).toEqual([-3, -3, -3]);
  expect(shield.mesh.geometry.boundingBox!.max.toArray()).toEqual([3, 3, 3]);
  expect(pillar.mesh.geometry.index!.count).toBe(32 * 6);
  expect(shield.mesh.geometry.getAttribute("normal").count).toBe(
    shield.mesh.geometry.getAttribute("position").count,
  );
});
test.each([attachRipple, attachLightPillar, attachShield])(
  "new effects reject non-representable radii and unbounded subdivisions before mounting",
  (create) => {
    const e = fixture();
    for (const radius of [0, -1, NaN, Infinity, 1e-100, 1e100])
      expect(() => create(e.app, { radius })).toThrow();
    for (const segments of [15, 257, 16.5, NaN])
      expect(() => create(e.app, { segments })).toThrow();
    expect(e.scene.children).toHaveLength(0);
    expect(e.updates.size).toBe(0);
  },
);
test("new shader parameters fail before allocation and independent uniforms stay independent", () => {
  const e = fixture();
  for (const width of [0, 1e-100, 1.1, NaN]) expect(() => attachRipple(e.app, { width })).toThrow();
  for (const rings of [0, 17, 2.2]) expect(() => attachRipple(e.app, { rings })).toThrow();
  expect(() => attachLightPillar(e.app, { height: 1e100 })).toThrow(/Float32/);
  for (const fresnelPower of [0, 17, NaN])
    expect(() => attachShield(e.app, { fresnelPower })).toThrow();
  for (const gridSegments of [3, 65, 5.5])
    expect(() => attachShield(e.app, { gridSegments })).toThrow();
  expect(e.scene.children).toHaveLength(0);
  const first = attachShield(e.app),
    second = attachShield(e.app);
  first.mesh.material.uniforms.uGrid!.value = 24;
  first.seek(0.6);
  expect(second.mesh.material.uniforms.uGrid!.value).toBe(12);
  expect(second.phase).toBe(0);
});

test("point flight shares the clock, owns native Points and retires resources after drawing", () => {
  const e = fixture(),
    curve = new LineCurve3(new Vector3(), new Vector3(10, 2, 0)),
    h = attachFlyPoints(e.app, { curve, count: 5, scope: e.scope });
  expect(h.points.isPoints).toBe(true);
  expect(h.points.geometry.index).toBeNull();
  expect(Array.from(h.points.geometry.getAttribute("aProgress").array)).toEqual([
    0, 0.25, 0.5, 0.75, 1,
  ]);
  const position = h.points.geometry.getAttribute("position");
  expect([position.getX(2), position.getY(2), position.getZ(2)]).toEqual([5, 1, 0]);
  curve.v2.set(100, 0, 0);
  expect(position.getX(4)).toBe(10);
  e.tick(1);
  expect(h.phase).toBe(0.25);
  h.pause();
  e.tick(1);
  expect(h.phase).toBe(0.25);
  h.seek(0.8);
  h.setSpeed(2);
  h.resume();
  e.tick(0.2);
  expect(h.phase).toBeCloseTo(0.2);
  const geometry = vi.spyOn(h.points.geometry, "dispose"),
    material = vi.spyOn(h.points.material, "dispose");
  renderWithRetirement(e.renderer, () => {
    e.scope.dispose();
    expect(h.disposed).toBe(true);
    expect(geometry).not.toHaveBeenCalled();
  });
  expect(h.points.parent).toBeNull();
  expect(geometry).toHaveBeenCalledOnce();
  expect(material).toHaveBeenCalledOnce();
  expect(e.updates.size).toBe(0);
});
test("point and ribbon inputs fail without managed nodes; uploaded samples must remain finite", () => {
  const e = fixture(),
    curve = new LineCurve3(new Vector3(), new Vector3(4, 0, 0));
  for (const count of [1, 65537, 2.5])
    expect(() => attachFlyPoints(e.app, { curve, count })).toThrow();
  for (const size of [0, 65, NaN]) expect(() => attachFlyPoints(e.app, { curve, size })).toThrow();
  for (const pulses of [0, 33, 1.1])
    expect(() => attachFlowLine(e.app, { curve, pulses })).toThrow();
  expect(() =>
    attachFlyPoints(e.app, { curve: new LineCurve3(new Vector3(), new Vector3(1e100, 0, 0)) }),
  ).toThrow(/Float32/);
  expect(e.scene.children).toHaveLength(0);
  const h = attachFlowLine(e.app, { curve, segments: 10, width: 0.5, pulses: 4 });
  expect(h.mesh.geometry.index!.count).toBe(60);
  expect(h.mesh.material.uniforms.uPulses!.value).toBe(4);
});
