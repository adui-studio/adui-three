import { Box3 } from "three";
import type { BatchedMesh, InstancedMesh, Object3D, SkinnedMesh } from "three";

// Native Box3 shares scratch vectors across roots; nested CPU samples would overwrite the caller's vertex.
let preparing = false;

/**
 * Independent finite world AABB, including hidden descendants. Refreshes native matrices/caches.
 * Mesh vertices use the current CPU skin/morph pose; instances/batches use conservative native boxes.
 * No rendering, animation advance, GPU upload or ownership. Empty/nonfinite bounds throw RangeError.
 * Synchronous reentry through this helper is rejected across all roots to protect native scratch data.
 */
export function computeObjectBounds(object: Object3D): Box3 {
  if (!object?.isObject3D) throw new TypeError("An Object3D is required");
  if (preparing) throw new Error("Object bounds preparation is already in progress");
  preparing = true;
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
    preparing = false;
  }
}
