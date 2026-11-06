import type { BufferGeometry, Material, Object3D } from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { TransformControlsMode } from "three/addons/controls/TransformControls.js";
import type { AnyThreeApp } from "./three-app.ts";
import { ResourceScope } from "./resources.ts";

export interface TransformControlsOptions {
  object?: Object3D;
  /** Borrowed controls for this app's camera/canvas. Disabled only while dragging. */
  orbitControls?: OrbitControls;
  mode?: TransformControlsMode;
  space?: "world" | "local";
  /** Positive finite gizmo scale. Default 1. */
  size?: number;
}

export interface TransformControlsHandle {
  readonly controls: TransformControls;
  readonly helper: Object3D;
  readonly disposed: boolean;
  attach(object: Object3D): void;
  detach(): void;
  dispose(this: void): void;
}

const attached = new WeakMap<AnyThreeApp, TransformControlsHandle>();

/** Own the native gizmo/listeners; borrow the transformed object and optional OrbitControls. */
export function attachTransformControls(
  app: AnyThreeApp,
  options: TransformControlsOptions = {},
): TransformControlsHandle {
  if (app.signal.aborted || app.resources.disposed) throw new Error("ThreeApp has been disposed");
  if (attached.has(app)) throw new Error("TransformControls are already attached");
  const { object, orbitControls: orbit, mode = "translate", space = "world", size = 1 } = options;
  const canvas = app.renderer.domElement;
  if (
    !["translate", "rotate", "scale"].includes(mode) ||
    !["world", "local"].includes(space) ||
    !Number.isFinite(size) ||
    size <= 0
  )
    throw new RangeError("Invalid TransformControls options");
  if (orbit && (orbit.object !== app.camera || orbit.domElement !== canvas))
    throw new Error("OrbitControls must use this app's camera and canvas");
  const validate = (target: Object3D): void => {
    let parent: Object3D | null = target;
    while (parent && parent !== app.scene) parent = parent.parent;
    if (!target?.isObject3D || target === app.scene || parent !== app.scene)
      throw new Error("Transform target must be a descendant of this app's scene");
  };
  if (object) validate(object);
  // Construct disconnected so partial DOM initialization can be rolled back explicitly.
  const controls = new TransformControls(app.camera);
  const helper = controls.getHelper();
  const assets = new ResourceScope();
  // Snapshot only native-owned resources, before consumers can add borrowed nodes to the helper.
  helper.traverse((node) => {
    const drawable = node as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    if (drawable.geometry) assets.track(drawable.geometry);
    if (drawable.material)
      for (const material of Array.isArray(drawable.material)
        ? drawable.material
        : [drawable.material])
        assets.track(material);
  });
  let connected = false;
  let disposed = false;
  let orbitState: { enabled: boolean; enableDamping: boolean; autoRotate: boolean } | undefined;
  let pointer: number | undefined;
  const touchAction = canvas.style.touchAction;
  const restoreOrbit = (): void => {
    if (orbit && orbitState) {
      for (const key of ["enabled", "enableDamping", "autoRotate"] as const)
        if (orbit[key] === false) orbit[key] = orbitState[key];
    }
    orbitState = undefined;
  };
  const dragging = ({ value }: { value: unknown }): void => {
    if (disposed) return;
    if (value === true && orbit && orbitState === undefined) {
      orbitState = {
        enabled: orbit.enabled,
        enableDamping: orbit.enableDamping,
        autoRotate: orbit.autoRotate,
      };
      orbit.enabled = false;
      orbit.enableDamping = false;
      orbit.autoRotate = false;
      try {
        orbit.update(0);
      } catch (error) {
        restoreOrbit();
        throw error;
      }
    } else if (value === false) restoreOrbit();
  };
  const down = (event: PointerEvent): void => {
    if (controls.dragging) pointer = event.pointerId;
  };
  const up = (): void => {
    // Native pointerup ignores disabled controls; still release our borrowed orbit lease.
    end();
  };
  const end = (): void => {
    const errors: unknown[] = [];
    const attempt = (callback: () => void): void => {
      try {
        callback();
      } catch (error) {
        errors.push(error);
      }
    };
    if (controls.dragging) attempt(() => controls.pointerUp(null));
    restoreOrbit();
    if (pointer !== undefined) {
      const id = pointer;
      pointer = undefined;
      attempt(() => {
        if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      });
    }
    if (errors.length) throw new AggregateError(errors, "Transform drag cleanup failed");
  };
  const cancel = (): void => {
    if (!disposed) end();
  };
  const active = (): void => {
    if (disposed || app.signal.aborted || app.resources.disposed)
      throw new Error("TransformControls have been disposed");
  };
  const handle: TransformControlsHandle = {
    controls,
    helper,
    get disposed() {
      return disposed;
    },
    attach(target): void {
      active();
      validate(target);
      let parent: Object3D | null = target;
      while (parent) {
        if (parent === helper) throw new Error("Cannot transform the owned helper");
        parent = parent.parent;
      }
      end();
      if (disposed) throw new Error("TransformControls have been disposed");
      controls.attach(target);
      if (disposed) {
        helper.visible = false;
        throw new Error("TransformControls were disposed during attachment");
      }
    },
    detach(): void {
      if (disposed) return;
      const errors: unknown[] = [];
      try {
        end();
      } catch (error) {
        errors.push(error);
      }
      try {
        controls.detach();
      } catch (error) {
        errors.push(error);
      }
      helper.visible = false;
      if (errors.length) throw new AggregateError(errors, "Transform detach failed");
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (attached.get(app) === handle) attached.delete(app);
      app.resources.untrack(handle);
      const errors: unknown[] = [];
      const attempt = (callback: () => void): void => {
        try {
          callback();
        } catch (error) {
          errors.push(error);
        }
      };
      controls.removeEventListener("dragging-changed", dragging);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", cancel);
      canvas.ownerDocument.defaultView?.removeEventListener("blur", cancel);
      attempt(end);
      attempt(() => {
        controls.enabled = false;
      });
      attempt(() => controls.detach());
      helper.visible = false;
      attempt(() => helper.removeFromParent());
      // disconnect writes touchAction unconditionally; preserve externally edited values.
      const currentTouchAction = canvas.style.touchAction;
      if (connected && controls.domElement) attempt(() => controls.disconnect());
      attempt(() => assets.dispose());
      canvas.style.touchAction = currentTouchAction === "none" ? touchAction : currentTouchAction;
      if (errors.length) throw new AggregateError(errors, "TransformControls cleanup failed");
    },
  };
  try {
    attached.set(app, handle);
    app.resources.track(handle);
    controls.setMode(mode);
    controls.setSpace(space);
    controls.setSize(size);
    controls.addEventListener("dragging-changed", dragging);
    connected = true;
    controls.connect(canvas);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("lostpointercapture", cancel);
    canvas.ownerDocument.defaultView?.addEventListener("blur", cancel);
    app.scene.add(helper);
    active();
    if (object) handle.attach(object);
    return handle;
  } catch (error) {
    try {
      handle.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Transform initialization and rollback failed",
      );
    }
    throw error;
  }
}
