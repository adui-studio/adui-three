import { Box3 } from "three";
import type { BatchedMesh, InstancedMesh, Object3D, SkinnedMesh } from "three";

const preparing = new WeakSet<Object3D>();

/**
 * Independent finite world AABB, including hidden descendants. Refreshes native matrices/caches.
 * Mesh vertices use the current CPU skin/morph pose; instances/batches use conservative native boxes.
 * No rendering, animation advance, GPU upload or ownership. Empty/nonfinite bounds throw RangeError.
 */
export function computeObjectBounds(object: Object3D): Box3 {
  if (!object?.isObject3D) throw new TypeError("An Object3D is required");
  if (preparing.has(object)) throw new Error("Object bounds preparation is already in progress");
  preparing.add(object);
  try {
    object.updateWorldMatrix(true, true);
    object.traverse((node) => {
      const skin = node as SkinnedMesh;
      if (skin.isSkinnedMesh) {
        // Bones can be siblings of the requested subtree, and attached binding needs refreshing.
        for (const bone of skin.skeleton.bones) bone.updateWorldMatrix(true, false);
        skin.updateMatrixWorld(true);
      }
      const instance = node as InstancedMesh;
      if (instance.isInstancedMesh) {
        instance.geometry.computeBoundingBox();
        instance.computeBoundingBox();
      } else {
        const batch = node as BatchedMesh;
        if (batch.isBatchedMesh) batch.computeBoundingBox();
      }
    });
    const bounds = new Box3().setFromObject(object, true);
    if (
      bounds.isEmpty() ||
      ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
    )
      throw new RangeError("Object has no finite bounds");
    return bounds;
  } finally {
    preparing.delete(object);
  }
}
