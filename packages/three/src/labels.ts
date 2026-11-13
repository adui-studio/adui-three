import { Vector3 } from "three";
import type { Object3D } from "three";
import type { AnyThreeApp } from "./three-app.ts";

export interface DOMLabelOptions {
  /** Borrowed object in app.scene; a detached or hidden ancestor hides the label. */
  object: Object3D;
  /** Detached element from the canvas document. Content/styles/listeners stay application-owned. */
  element: HTMLElement;
  /** Local-space position relative to object. Default [0, 0, 0]. */
  offset?: readonly [number, number, number];
  /** Normalized label anchor. Default [0.5, 1] (bottom center). */
  anchor?: readonly [number, number];
  /** Allow pointer events on the label wrapper. Default false. */
  interactive?: boolean;
}

export interface DOMLabelHandle {
  readonly object: Object3D;
  readonly element: HTMLElement;
  /** Mutable local-space offset; call layer.update() when the app is stopped. */
  readonly offset: Vector3;
  visible: boolean;
  readonly disposed: boolean;
  dispose(): void;
}

export interface DOMLabelsHandle {
  readonly disposed: boolean;
  add(options: DOMLabelOptions): DOMLabelHandle;
  /** Refresh immediately, also while ready/stopped. Resize refreshes automatically. */
  update(): void;
  clear(): void;
  dispose(): void;
}

const elements = new WeakSet<HTMLElement>();

function cleanup(actions: readonly (() => void)[], message: string): void {
  const errors: unknown[] = [];
  for (const action of actions) {
    try {
      action();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, message);
}

/** Screen-space HTML labels in an application-provided positioned overlay (no border/padding). */
export function attachDOMLabels(app: AnyThreeApp, container: HTMLElement): DOMLabelsHandle {
  const assertHost = (): void => {
    if (app.state === "disposed" || app.resources.disposed)
      throw new Error("ThreeApp has been disposed");
  };
  assertHost();
  const canvas = app.renderer.domElement;
  const document = canvas.ownerDocument;
  if (!container || container === canvas || container.ownerDocument !== document)
    throw new TypeError("A separate overlay from the canvas document is required");
  const view = document.defaultView!;
  const root = document.createElement("div");
  root.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none";
  const labels = new Map<DOMLabelHandle, HTMLElement>();
  const projected = new Vector3();
  let disposed = false;
  let unsubscribe = (): void => {};
  let observer: ResizeObserver | undefined;
  const active = (): void => {
    if (disposed) throw new Error("DOM labels have been disposed");
    assertHost();
  };
  const attachedAndVisible = (object: Object3D): boolean => {
    for (let node: Object3D | null = object; node; node = node.parent) {
      if (!node.visible) return false;
      if (node === app.scene) return true;
    }
    return false;
  };
  const update = (): void => {
    active();
    const viewport = canvas.getBoundingClientRect();
    const overlay = container.getBoundingClientRect();
    const width = container.clientWidth;
    const height = container.clientHeight;
    const drawable =
      viewport.width > 0 &&
      viewport.height > 0 &&
      overlay.width > 0 &&
      overlay.height > 0 &&
      width > 0 &&
      height > 0;
    app.camera.updateWorldMatrix(true, false);
    for (const [label, wrapper] of labels) {
      if (
        !drawable ||
        !label.visible ||
        !attachedAndVisible(label.object) ||
        !label.object.layers.test(app.camera.layers)
      ) {
        wrapper.hidden = true;
        continue;
      }
      label.object.updateWorldMatrix(true, false);
      projected
        .copy(label.offset)
        .applyMatrix4(label.object.matrixWorld)
        .applyMatrix4(app.camera.matrixWorldInverse);
      // Reject points on/behind the camera before perspective division.
      if (projected.z >= 0) {
        wrapper.hidden = true;
        continue;
      }
      projected.applyMatrix4(app.camera.projectionMatrix);
      if (
        ![projected.x, projected.y, projected.z].every(Number.isFinite) ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1 ||
        projected.z < (app.camera.reversedDepth ? 0 : -1) ||
        projected.z > 1
      ) {
        wrapper.hidden = true;
        continue;
      }
      const x =
        ((viewport.left - overlay.left + ((projected.x + 1) * viewport.width) / 2) * width) /
        overlay.width;
      const y =
        ((viewport.top - overlay.top + ((1 - projected.y) * viewport.height) / 2) * height) /
        overlay.height;
      wrapper.style.left = `${x}px`;
      wrapper.style.top = `${y}px`;
      wrapper.hidden = false;
    }
  };
  const handle: DOMLabelsHandle = {
    get disposed(): boolean {
      return disposed;
    },
    add(options): DOMLabelHandle {
      active();
      const {
        object,
        element,
        offset = [0, 0, 0],
        anchor = [0.5, 1],
        interactive = false,
      } = options;
      if (
        offset.length !== 3 ||
        !offset.every(Number.isFinite) ||
        anchor.length !== 2 ||
        !anchor.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
      )
        throw new RangeError("Label offset must be finite and anchor must be within [0, 1]");
      if (
        element.ownerDocument !== document ||
        element.parentNode ||
        elements.has(element) ||
        element.contains(root)
      )
        throw new TypeError("Label element must be detached, unique and from the canvas document");
      const wrapper = document.createElement("div");
      wrapper.hidden = true;
      wrapper.style.cssText = `position:absolute;left:0;top:0;transform:translate(${-anchor[0] * 100}%,${-anchor[1] * 100}%);pointer-events:${interactive ? "auto" : "none"}`;
      let removed = false;
      const label: DOMLabelHandle = {
        object,
        element,
        offset: new Vector3(...offset),
        visible: true,
        get disposed(): boolean {
          return removed;
        },
        dispose(): void {
          if (removed) return;
          removed = true;
          labels.delete(label);
          elements.delete(element);
          cleanup(
            [
              () => wrapper.remove(),
              () => {
                if (element.parentNode === wrapper) element.remove();
              },
            ],
            "DOM label cleanup failed",
          );
        },
      };
      labels.set(label, wrapper);
      elements.add(element);
      try {
        root.appendChild(wrapper);
        wrapper.appendChild(element);
        active();
        if (removed) throw new Error("DOM label was disposed during mounting");
        update();
        return label;
      } catch (error) {
        try {
          label.dispose();
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "DOM label mounting and rollback failed");
        }
        throw error;
      }
    },
    update,
    clear(): void {
      cleanup(
        Array.from(labels.keys(), (label) => () => label.dispose()),
        "DOM labels cleanup failed",
      );
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      cleanup(
        [
          unsubscribe,
          () => observer?.disconnect(),
          () => handle.clear(),
          () => root.remove(),
          () => {
            app.resources.untrack(handle);
          },
        ],
        "DOM labels cleanup failed",
      );
    },
  };
  try {
    app.resources.track(handle);
    unsubscribe = app.onAfterRender(update);
    observer = new view.ResizeObserver(() => {
      if (!disposed && app.state !== "disposed" && !app.resources.disposed) update();
    });
    observer.observe(canvas);
    observer.observe(container);
    container.appendChild(root);
    update();
    return handle;
  } catch (error) {
    try {
      handle.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "DOM labels initialization and rollback failed",
      );
    }
    throw error;
  }
}
