import { afterEach, expect, test } from "vite-plus/test";
import { BufferGeometry, LineCurve3, QuadraticBezierCurve3, TubeGeometry, Vector3 } from "three";
import {
  createPathCurve,
  createPathRibbon,
  createPathTube,
} from "../src/geometry/path-geometry.ts";
const geometries: BufferGeometry[] = [];
afterEach(() => {
  for (const geometry of geometries.splice(0)) geometry.dispose();
});
const own = <T extends BufferGeometry>(geometry: T): T => {
  geometries.push(geometry);
  return geometry;
};
const line = () => new LineCurve3(new Vector3(), new Vector3(4, 0, 0));
function allFinite(geometry: BufferGeometry) {
  for (const name of ["position", "normal", "uv"])
    expect(Array.from(geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
}
test("rounded curves own points and trim each corner without changing open endpoints", () => {
  const points = [new Vector3(), new Vector3(2, 0, 0), new Vector3(2, 0, 2)];
  const curve = createPathCurve(points, { cornerTrim: 1 });
  expect(curve.curves).toHaveLength(3);
  const corner = curve.curves[1] as QuadraticBezierCurve3;
  expect(corner).toBeInstanceOf(QuadraticBezierCurve3);
  expect(corner.v0.toArray()).toEqual([1, 0, 0]);
  expect(corner.v1.toArray()).toEqual([2, 0, 0]);
  expect(corner.v2.toArray()).toEqual([2, 0, 1]);
  const length = curve.getLength();
  points[1]!.setScalar(99);
  points.length = 0;
  expect(curve.getLength()).toBe(length);
  expect(curve.getPointAt(0).toArray()).toEqual([0, 0, 0]);
  expect(curve.getPointAt(1).toArray()).toEqual([2, 0, 2]);
});
test("closed rounded curves accept an optional duplicate endpoint and cap trim at half short edges", () => {
  const points = [new Vector3(), new Vector3(2, 0, 0), new Vector3(2, 0, 2), new Vector3()];
  const curve = createPathCurve(points, { closed: true, cornerTrim: 100 });
  expect(curve.getPointAt(0).distanceTo(curve.getPointAt(1))).toBeLessThan(1e-8);
  expect(curve.getLength()).toBeGreaterThan(4);
  expect(curve.getLength()).toBeLessThan(7);
});
test("duplicates, reversals and invalid corners reject without poisoning future builds", () => {
  expect(() => createPathCurve([new Vector3(), new Vector3()])).toThrow();
  expect(() => createPathCurve([new Vector3(), new Vector3(1, 0, 0), new Vector3()])).toThrow(
    /reversals/,
  );
  expect(() => createPathCurve([new Vector3(), new Vector3(1, 0, 0)], { closed: true })).toThrow();
  expect(() => createPathCurve([new Vector3(), new Vector3(Infinity, 0, 0)])).toThrow();
  expect(() =>
    createPathCurve([new Vector3(), new Vector3(1, 0, 0)], { cornerTrim: -1 }),
  ).toThrow();
  expect(createPathCurve([new Vector3(), new Vector3(1, 0, 0)]).getLength()).toBe(1);
});
for (const side of ["both", "left", "right"] as const)
  test("ribbon has physical width, UV repeats and upward winding on side " + side, () => {
    const geometry = own(createPathRibbon(line(), { width: 2, segments: 2, side, uvScale: 2 }));
    expect(geometry.getAttribute("position").count).toBe(6);
    expect(geometry.index!.count).toBe(12);
    expect(geometry.boundingBox!.min.z).toBe(side === "right" ? 0 : side === "left" ? -2 : -1);
    expect(geometry.boundingBox!.max.z).toBe(side === "left" ? 0 : side === "right" ? 2 : 1);
    expect(geometry.getAttribute("uv").getX(4)).toBe(2);
    for (let i = 0; i < 6; i++) expect(geometry.getAttribute("normal").getY(i)).toBeCloseTo(1, 6);
    allFinite(geometry);
  });
test("progress samples a real arc-length prefix and zero progress has empty valid bounds", () => {
  const geometry = own(createPathRibbon(line(), { segments: 8, progress: 0.25, uvScale: 2 }));
  expect(geometry.boundingBox!.max.x).toBe(1);
  expect(geometry.getAttribute("position").count).toBe(6);
  for (const build of [createPathRibbon, createPathTube]) {
    const empty = own(build(line(), { progress: 0 }));
    expect(empty.index!.count).toBe(0);
    expect(empty.getAttribute("position").count).toBe(0);
    expect(empty.boundingBox!.isEmpty()).toBe(true);
    expect(empty.boundingSphere!.radius).toBe(0);
  }
});
test("arrow shoulders, tip, UV and one-sided alignment follow visible progress", () => {
  const geometry = own(
    createPathRibbon(line(), {
      width: 1,
      segments: 4,
      side: "left",
      arrow: true,
      arrowLength: 2,
      arrowWidth: 4,
    }),
  );
  const position = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  expect(position.count).toBe(9);
  expect(position.getX(6)).toBe(2);
  expect(position.getZ(6)).toBe(-2.5);
  expect(position.getZ(7)).toBe(1.5);
  expect(position.getX(8)).toBe(4);
  expect(position.getZ(8)).toBe(-0.5);
  expect(uv.getX(8)).toBe(4);
  expect(uv.getY(8)).toBe(0.5);
  const short = own(createPathRibbon(line(), { progress: 0.1, arrow: true, arrowLength: 2 }));
  expect(short.getAttribute("position").count).toBe(3);
  allFinite(short);
});
test("vertical paths have deterministic finite transported frames", () => {
  const geometry = own(
    createPathRibbon(new LineCurve3(new Vector3(), new Vector3(0, 4, 0)), { width: 0.5 }),
  );
  allFinite(geometry);
  const normal = geometry.getAttribute("normal");
  expect(Math.hypot(normal.getX(0), normal.getY(0), normal.getZ(0))).toBeCloseTo(1, 6);
});
test("tube buffers match the native TubeGeometry sweep and do not retain the borrowed curve", () => {
  const curve = line(),
    geometry = own(
      createPathTube(curve, {
        segments: 4,
        progress: 0.5,
        radius: 0.2,
        radialSegments: 8,
        uvScale: 2,
      }),
    );
  const native = own(
    new TubeGeometry(new LineCurve3(new Vector3(), new Vector3(2, 0, 0)), 2, 0.2, 8, false),
  );
  const actual = geometry.getAttribute("position").array,
    expected = native.getAttribute("position").array;
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) expect(actual[i]).toBeCloseTo(expected[i]!, 6);
  expect(geometry.type).toBe("BufferGeometry");
  expect(geometry.getAttribute("uv").getX(18)).toBe(1);
  const snapshot = Array.from(actual);
  curve.v2.setScalar(99);
  expect(Array.from(actual)).toEqual(snapshot);
  allFinite(geometry);
});
test("closed full tube duplicates its seam and a partial closed path remains open", () => {
  const curve = createPathCurve(
    [new Vector3(), new Vector3(2, 0, 0), new Vector3(2, 0, 2), new Vector3(0, 0, 2)],
    { cornerTrim: 0.3, closed: true },
  );
  const geometry = own(createPathTube(curve, { closed: true, segments: 32, radialSegments: 8 })),
    p = geometry.getAttribute("position");
  for (let i = 0; i < 9; i++)
    expect(
      new Vector3()
        .fromBufferAttribute(p, i)
        .distanceTo(new Vector3().fromBufferAttribute(p, 32 * 9 + i)),
    ).toBeLessThan(1e-7);
  const partial = own(createPathTube(curve, { closed: true, progress: 0.5 }));
  allFinite(partial);
  expect(() => createPathRibbon(curve, { closed: true, arrow: true })).toThrow(/arrow/);
});
test.each([
  { width: 0 },
  { segments: 0 },
  { segments: 4097 },
  { progress: NaN },
  { progress: 2 },
  { uvScale: 0 },
  { up: new Vector3() },
  { closed: true },
  { arrowWidth: 0 },
])("invalid ribbon options reject before returning geometry: %j", (options) => {
  expect(() => createPathRibbon(line(), options)).toThrow();
  expect(() => own(createPathRibbon(line()))).not.toThrow();
});
test.each([{ radialSegments: 2 }, { radius: 0 }, { radialSegments: 129 }])(
  "invalid tube options reject: %j",
  (options) => {
    expect(() => createPathTube(line(), options)).toThrow();
  },
);
test("nonfinite points and reentrant custom curves fail without retaining the build lock", () => {
  const curve = line();
  curve.getPointAt = () => new Vector3(NaN, 0, 0);
  expect(() => createPathTube(curve)).toThrow(/nonfinite/);
  const nested = line(),
    original = nested.getPointAt.bind(nested);
  let calls = 0;
  nested.getPointAt = (u, target) => {
    calls++;
    expect(() => createPathRibbon(line())).toThrow(/in progress/);
    return original(u, target);
  };
  allFinite(own(createPathTube(nested)));
  expect(calls).toBeGreaterThan(0);
  expect(() => own(createPathRibbon(line()))).not.toThrow();
});

test("a sharp closed ribbon duplicates its seam positions and smooths the duplicate normals", () => {
  const curve = createPathCurve(
    [new Vector3(), new Vector3(2, 0, 0), new Vector3(2, 0, 2), new Vector3(0, 0, 2)],
    { closed: true },
  );
  const geometry = own(createPathRibbon(curve, { closed: true, segments: 16, width: 0.2 }));
  for (const name of ["position", "normal"]) {
    const a = geometry.getAttribute(name);
    for (let side = 0; side < 2; side++)
      expect(
        new Vector3()
          .fromBufferAttribute(a, side)
          .distanceTo(new Vector3().fromBufferAttribute(a, 32 + side)),
      ).toBeLessThan(1e-7);
  }
  expect(() => createPathTube(curve, { closed: true, segments: 1 })).toThrow(/segments/);
});
test("Float32 overflow and UV overflow reject, then construction remains usable", () => {
  expect(() => createPathTube(line(), { radius: 1e40 })).toThrow(/Float32/);
  expect(() => createPathRibbon(line(), { uvScale: 1e-300 })).toThrow(/Float32/);
  expect(() => own(createPathTube(line()))).not.toThrow();
});
test("zero tangents are rejected instead of producing collapsed native frames", () => {
  const curve = line();
  curve.getTangentAt = (_u, target = new Vector3()) => target.set(0, 0, 0);
  expect(() => createPathRibbon(curve)).toThrow(/tangent/);
  expect(() => createPathTube(curve)).toThrow(/tangent/);
});

test("segment getters are read once before sampling and micro open paths cannot claim closure", () => {
  let reads = 0;
  const options = {
    get segments() {
      reads++;
      return reads === 1 ? 8 : Infinity;
    },
  };
  const geometry = own(createPathRibbon(line(), options));
  expect(reads).toBe(1);
  expect(geometry.getAttribute("position").count).toBe(18);
  expect(() =>
    createPathTube(new LineCurve3(new Vector3(), new Vector3(4e-10, 0, 0)), { closed: true }),
  ).toThrow(/endpoints/);
});
test("point snapshots use bounded array indices rather than an overridden iterator", () => {
  const points = [new Vector3(), new Vector3(1, 0, 0)];
  points[Symbol.iterator] = () => {
    throw new Error("Unexpected custom iterator");
  };
  expect(createPathCurve(points).getLength()).toBe(1);
});
