import {
  BufferGeometry,
  Curve,
  CurvePath,
  Float32BufferAttribute,
  LineCurve3,
  QuadraticBezierCurve3,
  Quaternion,
  TubeGeometry,
  Vector3,
} from "three";

export interface PathCurveOptions {
  /** Distance trimmed from each side of a corner, capped at half either adjacent edge. Not a circular radius. */
  cornerTrim?: number;
  closed?: boolean;
}
export interface PathGeometryOptions {
  /** Full-path segment budget, 1..4096. Visible geometry uses ceil(segments * progress). */
  segments?: number;
  progress?: number;
  /** Must describe a closed curve; closed frames are used only at full progress. */
  closed?: boolean;
  /** World units per longitudinal UV repeat. Default 1. */
  uvScale?: number;
}
export interface PathRibbonOptions extends PathGeometryOptions {
  width?: number;
  side?: "both" | "left" | "right";
  /** Preferred initial surface normal. Subsequent normals use native parallel transport. */
  up?: Vector3;
  arrow?: boolean;
  arrowLength?: number;
  arrowWidth?: number;
}
export interface PathTubeOptions extends PathGeometryOptions {
  radius?: number;
  radialSegments?: number;
}

let busy = false;
function enter(): () => void {
  if (busy) throw new Error("Path geometry construction is already in progress");
  busy = true;
  return () => {
    busy = false;
  };
}
function positive(value: number, name: string, zero = false): number {
  if (!Number.isFinite(value) || (zero ? value < 0 : value <= 0))
    throw new RangeError(name + " must be finite and " + (zero ? "nonnegative" : "positive"));
  return value;
}
function finite(value: Vector3): boolean {
  return value?.isVector3 === true && value.toArray().every(Number.isFinite);
}
function flag(value: boolean, name: string): boolean {
  if (typeof value !== "boolean") throw new TypeError(name + " must be boolean");
  return value;
}
/** New independent native curves; never retains the input array or its vectors. */
export function createPathCurve(
  points: readonly Vector3[],
  options: PathCurveOptions = {},
): CurvePath<Vector3> {
  const release = enter();
  try {
    const trim = positive(options.cornerTrim ?? 0, "cornerTrim", true);
    const closed = flag(options.closed ?? false, "closed");
    if (!Array.isArray(points)) throw new TypeError("Path points must be an array");
    const inputCount: number = points.length;
    if (!Number.isInteger(inputCount) || inputCount > 4096 || inputCount < 2)
      throw new RangeError("A path requires 2..4096 points");
    const values: Vector3[] = [];
    for (let i = 0; i < inputCount; i++) {
      const point: Vector3 = points[i];
      if (!finite(point)) throw new RangeError("Path points must be finite Vector3 values");
      values.push(point.clone());
    }
    if (closed && values[0]!.equals(values.at(-1)!)) values.pop();
    if (closed && values.length < 3)
      throw new RangeError("A closed path requires three distinct corners");
    const count = values.length;
    const entries: Vector3[] = [],
      exits: Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const point = values[i]!;
      if (!closed && (i === 0 || i === count - 1)) {
        const edge = point.distanceTo(values[i === 0 ? 1 : i - 1]!);
        positive(edge, "Adjacent edge length");
        entries.push(point.clone());
        exits.push(point.clone());
        continue;
      }
      const previous = values[(i - 1 + count) % count]!,
        next = values[(i + 1) % count]!;
      const incoming = point.clone().sub(previous),
        outgoing = next.clone().sub(point);
      const before = positive(incoming.length(), "Adjacent edge length"),
        after = positive(outgoing.length(), "Adjacent edge length");
      incoming.divideScalar(before);
      outgoing.divideScalar(after);
      if (incoming.dot(outgoing) < -1 + 1e-8)
        throw new RangeError("Path reversals require separate paths");
      const cut = Math.min(trim, before * 0.5, after * 0.5);
      entries.push(point.clone().addScaledVector(incoming, -cut));
      exits.push(point.clone().addScaledVector(outgoing, cut));
    }
    const path = new CurvePath<Vector3>();
    let cursor = closed ? exits[0]!.clone() : values[0]!.clone();
    const lineTo = (point: Vector3): void => {
      if (!cursor.equals(point)) path.add(new LineCurve3(cursor.clone(), point.clone()));
      cursor.copy(point);
    };
    const start = 1,
      end = closed ? count : count - 1;
    for (let i = start; i <= end; i++) {
      const index = i % count;
      lineTo(entries[index]!);
      if (!entries[index]!.equals(exits[index]!)) {
        path.add(
          new QuadraticBezierCurve3(
            entries[index]!.clone(),
            values[index]!.clone(),
            exits[index]!.clone(),
          ),
        );
        cursor.copy(exits[index]!);
      }
    }
    positive(path.getLength(), "Path length");
    return path;
  } finally {
    release();
  }
}

/** An arc-length prefix; native TubeGeometry and Curve frames perform the sweep. */
class PrefixCurve extends Curve<Vector3> {
  constructor(
    readonly source: Curve<Vector3>,
    readonly end: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new Vector3()): Vector3 {
    return this.getPointAt(t, target);
  }
  override getPointAt(u: number, target = new Vector3()): Vector3 {
    const result = this.source.getPointAt(u * this.end, target);
    if (!finite(result)) throw new RangeError("Curve returned a nonfinite point");
    return target.copy(result);
  }
  override getTangentAt(u: number, target = new Vector3()): Vector3 {
    const result = this.source.getTangentAt(u * this.end, target);
    if (!finite(result) || !Number.isFinite(result.length()) || result.lengthSq() === 0)
      throw new RangeError("Curve returned an invalid tangent");
    return target.copy(result).normalize();
  }
}
function prepare(curve: Curve<Vector3>, options: PathGeometryOptions) {
  if (!(curve instanceof Curve))
    throw new TypeError("A native three-dimensional Curve is required");
  const segments = options.segments ?? 64,
    progress = options.progress ?? 1;
  const uvScale = positive(options.uvScale ?? 1, "uvScale"),
    closed = flag(options.closed ?? false, "closed");
  if (
    !Number.isInteger(segments) ||
    segments < 1 ||
    segments > 4096 ||
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 1
  )
    throw new RangeError("Invalid path segment count or progress");
  const length = positive(curve.getLength(), "Curve length"),
    prefix = new PrefixCurve(curve, progress);
  if (closed) {
    if (progress === 1 && segments < 3)
      throw new RangeError("Closed geometry requires at least three segments");
    const full = new PrefixCurve(curve, 1);
    const first = full.getPointAt(0),
      last = full.getPointAt(1);
    if (!finite(first) || !finite(last) || first.distanceTo(last) > length * 1e-8)
      throw new RangeError("Closed geometry requires matching curve endpoints");
  }
  return {
    fullSegments: segments,
    segments: Math.max(1, Math.ceil(segments * progress)),
    progress,
    uvScale,
    closed: closed && progress === 1,
    length,
    prefix,
  };
}
function finish(geometry: BufferGeometry): BufferGeometry {
  for (const name of ["position", "normal", "uv"]) {
    const attribute = geometry.getAttribute(name);
    for (let i = 0; i < attribute.array.length; i++)
      if (!Number.isFinite(attribute.array[i]))
        throw new RangeError("Path geometry exceeds the Float32 range");
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere && !Number.isFinite(geometry.boundingSphere.radius))
    throw new RangeError("Path bounds exceed the numeric range");
  return geometry;
}
function empty(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([], 3));
  geometry.setAttribute("normal", new Float32BufferAttribute([], 3));
  geometry.setAttribute("uv", new Float32BufferAttribute([], 2));
  geometry.setIndex([]);
  return finish(geometry);
}

/** Caller owns the returned geometry. Progress 0 yields an empty indexed geometry. */
export function createPathTube(
  curve: Curve<Vector3>,
  options: PathTubeOptions = {},
): BufferGeometry {
  const release = enter();
  let geometry: BufferGeometry | undefined;
  try {
    const radius = positive(options.radius ?? 0.1, "radius"),
      radial = options.radialSegments ?? 8;
    if (!Number.isInteger(radial) || radial < 3 || radial > 128)
      throw new RangeError("radialSegments must be 3..128");
    const prepared = prepare(curve, options);
    if (prepared.progress === 0) return empty();
    const tube = new TubeGeometry(
      prepared.prefix,
      prepared.segments,
      radius,
      radial,
      prepared.closed,
    );
    geometry = new BufferGeometry();
    geometry.setIndex(tube.index);
    for (const [name, attribute] of Object.entries(tube.attributes))
      geometry.setAttribute(name, attribute);
    tube.dispose();
    const uv = geometry.getAttribute("uv");
    const repeats = (prepared.length * prepared.progress) / prepared.uvScale;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeats);
    finish(geometry);
    return geometry;
  } catch (error) {
    geometry?.dispose();
    throw error;
  } finally {
    release();
  }
}

export function createPathRibbon(
  curve: Curve<Vector3>,
  options: PathRibbonOptions = {},
): BufferGeometry {
  const release = enter();
  let geometry: BufferGeometry | undefined;
  try {
    const width = positive(options.width ?? 1, "width"),
      side = options.side ?? "both";
    const arrow = flag(options.arrow ?? false, "arrow");
    const arrowLength = positive(options.arrowLength ?? width * 2, "arrowLength");
    const arrowWidth = positive(options.arrowWidth ?? width * 2, "arrowWidth");
    const up = options.up?.clone() ?? new Vector3(0, 1, 0);
    if (
      !["both", "left", "right"].includes(side) ||
      !finite(up) ||
      !Number.isFinite(up.length()) ||
      up.lengthSq() === 0
    )
      throw new RangeError("Invalid ribbon side or up vector");
    up.normalize();
    const prepared = prepare(curve, options),
      { length, progress, uvScale } = prepared;
    if (prepared.closed && arrow) throw new RangeError("A closed ribbon cannot have an arrow");
    if (progress === 0) return empty();
    const bodyEnd = arrow ? Math.max(0, progress - arrowLength / length) : progress;
    const body = new PrefixCurve(curve, bodyEnd);
    const segments = Math.max(1, Math.ceil(prepared.fullSegments * bodyEnd));
    // Even an arrow-only ribbon needs one native frame at the start.
    const frames =
      bodyEnd > 0
        ? body.computeFrenetFrames(segments, prepared.closed)
        : new PrefixCurve(curve, progress).computeFrenetFrames(1, false);
    const tangent = frames.tangents[0]!,
      normal = frames.normals[0]!;
    const projected = up.addScaledVector(tangent, -up.dot(tangent));
    let roll = 0;
    if (projected.lengthSq() > 1e-12) {
      projected.normalize();
      roll = Math.atan2(tangent.dot(normal.clone().cross(projected)), normal.dot(projected));
    }
    const positions: number[] = [],
      uvs: number[] = [],
      indices: number[] = [];
    const widthAt = (index: number): Vector3 => {
      const t = frames.tangents[index]!,
        n = frames.normals[index]!.clone().applyAxisAngle(t, roll);
      return t.clone().cross(n).normalize();
    };
    const append = (point: Vector3, u: number, v: number): void => {
      positions.push(point.x, point.y, point.z);
      uvs.push(u, v);
    };
    const left = side === "right" ? 0 : side === "left" ? width : width / 2;
    const right = side === "left" ? 0 : side === "right" ? width : width / 2;
    if (bodyEnd > 0)
      for (let i = 0; i <= segments; i++) {
        const u = i / segments,
          center = body.getPointAt(prepared.closed && i === segments ? 0 : u),
          across = widthAt(prepared.closed && i === segments ? 0 : i);
        append(center.clone().addScaledVector(across, -left), (u * bodyEnd * length) / uvScale, 0);
        append(center.clone().addScaledVector(across, right), (u * bodyEnd * length) / uvScale, 1);
        if (i < segments) {
          const a = i * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    if (arrow) {
      const at = bodyEnd > 0 ? segments : 0,
        across = widthAt(at),
        base = curve.getPointAt(bodyEnd, new Vector3());
      const end = prepared.prefix.getPointAt(1),
        offset = (right - left) / 2,
        first = positions.length / 3;
      base.addScaledVector(across, offset);
      const tipTangent = prepared.prefix.getTangentAt(1);
      const tipAcross = across
        .clone()
        .applyQuaternion(new Quaternion().setFromUnitVectors(frames.tangents[at]!, tipTangent));
      append(
        base.clone().addScaledVector(across, -arrowWidth / 2),
        (bodyEnd * length) / uvScale,
        0,
      );
      append(base.clone().addScaledVector(across, arrowWidth / 2), (bodyEnd * length) / uvScale, 1);
      append(end.addScaledVector(tipAcross, offset), (progress * length) / uvScale, 0.5);
      indices.push(first, first + 1, first + 2);
    }
    geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    if (prepared.closed) {
      const normals = geometry.getAttribute("normal");
      for (let side = 0; side < 2; side++) {
        const last = segments * 2 + side;
        const normal = new Vector3()
          .fromBufferAttribute(normals, side)
          .add(new Vector3().fromBufferAttribute(normals, last))
          .normalize();
        normals.setXYZ(side, normal.x, normal.y, normal.z);
        normals.setXYZ(last, normal.x, normal.y, normal.z);
      }
    }
    finish(geometry);
    return geometry;
  } catch (error) {
    geometry?.dispose();
    throw error;
  } finally {
    release();
  }
}
