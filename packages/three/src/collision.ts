import { Box3, BufferGeometry, DoubleSide, Line3, Mesh, Ray, Vector3 } from "three";
import type { Object3D } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MeshBVH, SAH } from "three-mesh-bvh";

export interface CapsuleContact {
  readonly normal: Vector3;
  readonly point: Vector3;
  readonly depth: number;
}
export interface CapsuleCollision {
  readonly segment: Line3;
  readonly correction: Vector3;
  readonly contacts: readonly CapsuleContact[];
  readonly converged: boolean;
}
export interface CollisionRayHit {
  readonly distance: number;
  readonly point: Vector3;
  readonly normal: Vector3;
}
export interface CollisionWorld {
  readonly disposed: boolean;
  readonly triangleCount: number;
  readonly bounds: Box3;
  resolveCapsule(this: void, segment: Line3, radius: number): CapsuleCollision;
  raycast(this: void, ray: Ray, maxDistance?: number): CollisionRayHit | null;
  dispose(this: void): void;
}
export interface CollisionWorldOptions {
  /** Depenetration passes, integer 1..32. Default 8. Discrete surface queries, not CCD. */
  iterations?: number;
  /** Positive finite surface clearance, default 1e-5 world units. */
  skin?: number;
}

let busy = false;
function enter(): () => void {
  if (busy) throw new Error("A collision operation is already in progress");
  busy = true;
  return () => {
    busy = false;
  };
}
function finite(value: Vector3): boolean {
  return value?.isVector3 === true && value.toArray().every(Number.isFinite);
}

/** Own a position-only world-space snapshot and BVH; borrow source meshes. No prototype patches. */
export function createCollisionWorld(
  objects: readonly Object3D[],
  options: CollisionWorldOptions = {},
): CollisionWorld {
  const release = enter();
  const parts: BufferGeometry[] = [];
  let geometry: BufferGeometry | null = null;
  try {
    const { iterations = 8, skin = 1e-5 } = options;
    if (
      !Number.isInteger(iterations) ||
      iterations < 1 ||
      iterations > 32 ||
      !Number.isFinite(skin) ||
      skin <= 0
    )
      throw new RangeError(
        "Collision iterations must be 1..32 and skin must be positive and finite",
      );
    if (!Array.isArray(objects) || !objects.length)
      throw new TypeError("Explicit collision objects are required");
    const meshes = new Set<Mesh>();
    for (const object of Array.from<Object3D>(objects)) {
      if (!object?.isObject3D) throw new TypeError("Collision roots must be Object3D instances");
      object.updateWorldMatrix(true, true);
      object.traverse((child) => {
        if (!(child instanceof Mesh)) return;
        if (
          "isSkinnedMesh" in child ||
          "isInstancedMesh" in child ||
          "isBatchedMesh" in child ||
          child.geometry.morphAttributes.position?.length
        )
          throw new TypeError(
            "Bake skinned, morph, instanced and batched colliders before creating a static world",
          );
        meshes.add(child);
      });
    }
    if (!meshes.size) throw new RangeError("Collision objects contain no triangle meshes");
    for (const mesh of meshes) {
      if (
        !mesh.matrixWorld.elements.every(Number.isFinite) ||
        !Number.isFinite(mesh.matrixWorld.determinant()) ||
        mesh.matrixWorld.determinant() === 0
      )
        throw new RangeError("Collision world transforms must be finite and invertible");
      if (!mesh.geometry.getAttribute("position"))
        throw new TypeError("Collision geometry requires positions");
      let part = mesh.geometry.clone();
      for (const name of Object.keys(part.attributes))
        if (name !== "position") part.deleteAttribute(name);
      part.morphAttributes = {};
      part.clearGroups();
      if (part.index) {
        const indexed = part;
        part = indexed.toNonIndexed();
        indexed.dispose();
      }
      parts.push(part);
      part.applyMatrix4(mesh.matrixWorld);
      const position = part.getAttribute("position");
      if (position.itemSize !== 3 || position.count === 0 || position.count % 3 !== 0)
        throw new RangeError("Collision positions must form complete triangles");
      for (let i = 0; i < position.count; i++)
        if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite))
          throw new RangeError("Collision positions exceed the finite numeric range");
    }
    geometry = mergeGeometries(parts, false);
    if (!geometry) throw new Error("Collision geometry could not be merged");
    let tree: MeshBVH | null = new MeshBVH(geometry, { strategy: SAH, indirect: true });
    const bounds = tree.getBoundingBox(new Box3());
    const triangleCount = geometry.getAttribute("position").count / 3;
    let disposed = false;
    const owned = (): MeshBVH => {
      if (disposed || !tree) throw new Error("Collision world has been disposed");
      return tree;
    };
    let privateGeometry: BufferGeometry | null = geometry;
    const world: CollisionWorld = {
      get disposed() {
        return disposed;
      },
      get triangleCount() {
        return triangleCount;
      },
      get bounds() {
        return bounds.clone();
      },
      resolveCapsule(segment, radius): CapsuleCollision {
        const end = enter();
        try {
          owned();
          if (
            !(segment instanceof Line3) ||
            !finite(segment.start) ||
            !finite(segment.end) ||
            !Number.isFinite(radius) ||
            radius <= 0
          )
            throw new RangeError("A finite capsule segment and positive radius are required");
          const candidate = segment.clone(),
            original = candidate.start.clone();
          const bvh = owned(),
            box = new Box3(),
            trianglePoint = new Vector3(),
            capsulePoint = new Vector3(),
            normal = new Vector3(),
            center = new Vector3();
          const contacts: CapsuleContact[] = [];
          let converged = false;
          for (let pass = 0; pass < iterations; pass++) {
            let pushed = false;
            const updateBounds = (): void => {
              box
                .makeEmpty()
                .expandByPoint(candidate.start)
                .expandByPoint(candidate.end)
                .expandByScalar(radius);
            };
            updateBounds();
            bvh.shapecast({
              intersectsBounds: (bounds) => bounds.intersectsBox(box),
              intersectsTriangle: (triangle) => {
                const distance = triangle.closestPointToSegment(
                  candidate,
                  trianglePoint,
                  capsulePoint,
                );
                if (!Number.isFinite(distance) || distance < 0)
                  throw new RangeError("Collision query exceeded the numeric range");
                if (distance >= radius) return false;
                normal.subVectors(capsulePoint, trianglePoint);
                if (distance > 1e-12) normal.multiplyScalar(1 / distance);
                else {
                  triangle.getNormal(normal);
                  if (normal.lengthSq() === 0) return false;
                  candidate.getCenter(center).sub(triangle.a);
                  if (normal.dot(center) < 0) normal.negate();
                }
                const depth = radius - distance;
                candidate.start.addScaledVector(normal, depth + skin);
                candidate.end.addScaledVector(normal, depth + skin);
                if (!finite(candidate.start) || !finite(candidate.end))
                  throw new RangeError("Collision correction exceeded the numeric range");
                contacts.push({ normal: normal.clone(), point: trianglePoint.clone(), depth });
                pushed = true;
                updateBounds();
                return false;
              },
            });
            if (!pushed) {
              converged = true;
              break;
            }
          }
          owned();
          return {
            segment: candidate,
            correction: candidate.start.clone().sub(original),
            contacts,
            converged,
          };
        } finally {
          end();
        }
      },
      raycast(ray, maxDistance = Infinity): CollisionRayHit | null {
        const end = enter();
        try {
          owned();
          if (
            !(ray instanceof Ray) ||
            !finite(ray.origin) ||
            !finite(ray.direction) ||
            Math.max(
              Math.abs(ray.direction.x),
              Math.abs(ray.direction.y),
              Math.abs(ray.direction.z),
            ) === 0 ||
            typeof maxDistance !== "number" ||
            Number.isNaN(maxDistance) ||
            maxDistance < 0
          )
            throw new RangeError("A finite nonzero ray and nonnegative distance are required");
          const direction = ray.direction.clone();
          const magnitude = Math.max(
            Math.abs(direction.x),
            Math.abs(direction.y),
            Math.abs(direction.z),
          );
          direction.divideScalar(magnitude).normalize();
          const hit = owned().raycastFirst(
            new Ray(ray.origin.clone(), direction),
            DoubleSide,
            0,
            maxDistance,
          );
          owned();
          if (!hit) return null;
          const normal = hit.face!.normal.clone();
          if (normal.dot(direction) > 0) normal.negate();
          return { distance: hit.distance, point: hit.point.clone(), normal };
        } finally {
          end();
        }
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        tree = null;
        const current = privateGeometry;
        privateGeometry = null;
        current?.dispose();
      },
    };
    geometry = null;
    return world;
  } finally {
    try {
      geometry?.dispose();
      for (const part of parts) part.dispose();
    } finally {
      release();
    }
  }
}
