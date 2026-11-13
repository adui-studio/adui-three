import { Color, InstancedMesh, Matrix4, Object3D } from "three";
import type { BufferAttribute, BufferGeometry, Material } from "three";
import type { AnyThreeApp } from "./three-app.ts";
import { ResourceScope } from "./resources.ts";

export interface CreateInstancedMeshOptions {
  /** Borrowed. The caller keeps geometry/material/textures alive. */
  geometry: BufferGeometry;
  material: Material | readonly Material[];
  capacity: number;
  /** Active prefix of slots. Default 0; prepare matrices before increasing it. */
  count?: number;
  addToScene?: boolean;
}

export interface InstancedMeshHandle {
  readonly mesh: InstancedMesh;
  readonly capacity: number;
  readonly resources: ResourceScope;
  readonly disposed: boolean;
  setCount(count: number): void;
  /** Copies a finite, Float32-representable affine matrix with positive nonzero determinant. */
  setMatrixAt(index: number, matrix: Matrix4): void;
  /** Copies linear RGB; does not change the borrowed material. */
  setColorAt(index: number, color: Color): void;
  dispose(): void;
}

function materialList(value: Material | readonly Material[]): value is readonly Material[] {
  return Array.isArray(value);
}

/** Attribute-local upload tracking; native or callback changes conservatively request full data. */
function attributeUpdates(): (attribute: BufferAttribute, start: number, count: number) => void {
  const states = new WeakMap<
    BufferAttribute,
    {
      uploaded: boolean;
      full: boolean;
      version: number;
      callback: () => void;
    }
  >();
  return (attribute, start, count): void => {
    let state = states.get(attribute);
    if (!state) {
      const previous = attribute.onUploadCallback.bind(attribute);
      const tracked = {
        uploaded: false,
        full: false,
        version: attribute.version,
        callback: (): void => {},
      };
      tracked.callback = (): void => {
        tracked.uploaded = true;
        tracked.full = false;
        tracked.version = attribute.version;
        attribute.clearUpdateRanges();
        previous();
      };
      attribute.onUpload(tracked.callback);
      states.set(attribute, tracked);
      state = tracked;
    }
    if (attribute.version !== state.version || attribute.onUploadCallback !== state.callback)
      state.full = true;
    if (!state.uploaded || state.full) attribute.clearUpdateRanges();
    else {
      // Keep one bounded pending interval. It includes unchanged slots between sparse edits.
      const ranges = attribute.updateRanges;
      if (ranges.length === 0) attribute.addUpdateRange(start, count);
      else {
        let lower = start,
          upper = start + count;
        for (const range of ranges) {
          lower = Math.min(lower, range.start);
          upper = Math.max(upper, range.start + range.count);
        }
        ranges[0]!.start = lower;
        ranges[0]!.count = upper - lower;
        ranges.splice(1);
      }
    }
    attribute.needsUpdate = true;
    state.version = attribute.version;
  };
}

/** Own the instance object/buffers, borrow its reusable geometry/material. No updates or rendering. */
export function createInstancedMesh(
  app: AnyThreeApp,
  options: CreateInstancedMeshOptions,
): InstancedMeshHandle {
  const { geometry, material, capacity, count = 0, addToScene = true } = options;
  const owners = (): void => {
    if (app.state === "disposed" || app.resources.disposed || app.signal.aborted)
      throw new Error("ThreeApp has been disposed");
  };
  owners();
  const materials = materialList(material) ? [...material] : material;
  if (
    !geometry?.isBufferGeometry ||
    !(Array.isArray(materials)
      ? materials.length && materials.every((entry) => entry?.isMaterial)
      : materials?.isMaterial)
  )
    throw new TypeError("Instancing requires borrowed geometry and material(s)");
  if (
    !Number.isInteger(capacity) ||
    capacity <= 0 ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > capacity
  )
    throw new RangeError("Capacity must be positive and count must be within [0,capacity]");
  if (typeof addToScene !== "boolean") throw new TypeError("addToScene must be boolean");
  const mesh = new InstancedMesh(geometry, materials as Material | Material[], capacity);
  mesh.count = count;
  const resources = new ResourceScope();
  const matrixCopy = new Matrix4();
  const colorCopy = new Color();
  const mark = attributeUpdates();
  let disposed = false;
  const active = (): void => {
    if (disposed || resources.disposed) throw new Error("Instanced mesh has been disposed");
    owners();
  };
  const slot = (index: number): void => {
    if (!Number.isInteger(index) || index < 0 || index >= capacity)
      throw new RangeError("Instance index must be within capacity");
  };
  const invalidate = (): void => {
    mesh.boundingSphere = null;
    mesh.boundingBox = null;
  };
  const handle: InstancedMeshHandle = {
    mesh,
    capacity,
    resources,
    get disposed(): boolean {
      return disposed;
    },
    setCount(value): void {
      active();
      if (!Number.isInteger(value) || value < 0 || value > capacity)
        throw new RangeError("Instance count must be within [0,capacity]");
      mesh.count = value;
      invalidate();
    },
    setMatrixAt(index, matrix): void {
      active();
      slot(index);
      const values = matrix.elements.map(Math.fround);
      if (
        !values.every(Number.isFinite) ||
        values[3] !== 0 ||
        values[7] !== 0 ||
        values[11] !== 0 ||
        values[15] !== 1
      )
        throw new RangeError("Instance matrix must be a finite Float32 affine transform");
      matrixCopy.fromArray(values);
      const determinant = matrixCopy.determinant();
      if (!Number.isFinite(determinant) || determinant <= 0)
        throw new RangeError("Instance transform must have positive nonzero determinant");
      mesh.setMatrixAt(index, matrixCopy);
      active();
      mark(mesh.instanceMatrix, index * 16, 16);
      invalidate();
    },
    setColorAt(index, color): void {
      active();
      slot(index);
      const values = [color.r, color.g, color.b].map(Math.fround);
      if (!values.every((value) => Number.isFinite(value) && value >= 0))
        throw new RangeError("Instance color must be finite nonnegative Float32 linear RGB");
      colorCopy.setRGB(values[0]!, values[1]!, values[2]!);
      mesh.setColorAt(index, colorCopy);
      active();
      mark(mesh.instanceColor!, index * 3, 3);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      app.resources.untrack(handle);
      const errors: unknown[] = [];
      for (const cleanup of [
        () => resources.dispose(),
        () => mesh.removeFromParent(),
        () => Object3D.prototype.dispose.call(mesh),
        () => mesh.instanceMatrix.dispose(),
        () => mesh.instanceColor?.dispose(),
        () => {
          const texture = mesh.morphTexture;
          mesh.morphTexture = null;
          texture?.dispose();
        },
      ]) {
        try {
          cleanup();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) throw new AggregateError(errors, "Instanced mesh cleanup failed");
    },
  };
  try {
    app.resources.track(handle);
    if (addToScene) app.scene.add(mesh);
    active();
    return handle;
  } catch (error) {
    try {
      handle.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Instancing initialization and rollback failed",
      );
    }
    throw error;
  }
}
