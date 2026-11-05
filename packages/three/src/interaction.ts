import { Raycaster, Vector2 } from "three";
import type { Intersection, Object3D } from "three";
import type { ThreeApp } from "./three-app.ts";

export interface PickingOptions {
  /** Explicit borrowed targets, read again for each pick (e.g. after replacing a model). */
  objects: () => readonly Object3D[];
  /** Include target descendants. Default true. */
  recursive?: boolean;
  /** Maximum movement from pointerdown in CSS pixels. Default 4. */
  dragThreshold?: number;
}

export interface PickingEvent {
  /** Nearest visible hit, or null for empty space / hover exit. */
  readonly intersection: Intersection | null;
  readonly originalEvent: PointerEvent;
}

export interface PickingHandle {
  /** Native configuration for layers, near/far and line/point thresholds. */
  readonly raycaster: Raycaster;
  readonly disposed: boolean;
  /** Viewport-relative CSS coordinates, like PointerEvent.clientX/clientY. */
  pick(clientX: number, clientY: number): Intersection | null;
  /** Hover fires only when the nearest object changes; click includes empty space. */
  on(type: "click" | "hover", callback: (event: PickingEvent) => void): () => void;
  dispose(): void;
}

function visible(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/** Canvas-local CPU picking. Does not capture pointers, own targets or start a frame loop. */
export function attachPicking(app: ThreeApp, options: PickingOptions): PickingHandle {
  if (app.state === "disposed") throw new Error("ThreeApp has been disposed");
  if (app.resources.disposed) throw new Error("ThreeApp resource scope has been disposed");
  const { objects, recursive = true, dragThreshold = 4 } = options;
  if (!Number.isFinite(dragThreshold) || dragThreshold < 0)
    throw new RangeError("dragThreshold must be non-negative and finite");
  const canvas = app.renderer.domElement;
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const listeners = {
    click: new Set<(event: PickingEvent) => void>(),
    hover: new Set<(event: PickingEvent) => void>(),
  };
  let disposed = false;
  let hovered: Object3D | null = null;
  let press: { id: number; x: number; y: number; object: Object3D | null } | null = null;

  const active = (): void => {
    if (disposed) throw new Error("Picking handle has been disposed");
    if (app.state === "disposed" || app.resources.disposed)
      throw new Error("ThreeApp has been disposed");
  };
  const inside = (x: number, y: number): boolean => {
    const rect = canvas.getBoundingClientRect();
    return (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      rect.width > 0 &&
      rect.height > 0 &&
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  };
  const pick = (x: number, y: number): Intersection | null => {
    active();
    if (!inside(x, y)) return null;
    const rect = canvas.getBoundingClientRect();
    const targets = [...new Set(objects())];
    active();
    pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    // Picking also works before the first render and while the host is stopped.
    app.camera.updateWorldMatrix(true, false);
    for (const target of targets) target.updateWorldMatrix(true, true);
    raycaster.setFromCamera(pointer, app.camera);
    return (
      raycaster.intersectObjects(targets, recursive).find((hit) => visible(hit.object)) ?? null
    );
  };
  const emit = (type: "click" | "hover", event: PickingEvent): void => {
    const subscriptions = Array.from(listeners[type]);
    for (const callback of subscriptions) {
      if (disposed || app.state === "disposed" || app.resources.disposed) return;
      if (listeners[type].has(callback)) callback(event);
    }
  };
  const hover = (intersection: Intersection | null, event: PointerEvent): void => {
    const object = intersection?.object ?? null;
    if (object === hovered) return;
    hovered = object;
    emit("hover", { intersection, originalEvent: event });
  };
  const down = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0 || press) {
      press = null;
      return;
    }
    if (!inside(event.clientX, event.clientY)) return;
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      object: pick(event.clientX, event.clientY)?.object ?? null,
    };
  };
  const moved = (event: PointerEvent): void => {
    if (
      press &&
      press.id === event.pointerId &&
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > dragThreshold
    )
      press = null;
  };
  const move = (event: PointerEvent): void => {
    moved(event);
    if (!event.isPrimary || event.pointerType === "touch" || event.buttons !== 0) return;
    hover(pick(event.clientX, event.clientY), event);
  };
  const up = (event: PointerEvent): void => {
    moved(event);
    const previous = press;
    press = null;
    if (
      !previous ||
      previous.id !== event.pointerId ||
      !event.isPrimary ||
      event.button !== 0 ||
      !inside(event.clientX, event.clientY)
    )
      return;
    const intersection = pick(event.clientX, event.clientY);
    if ((intersection?.object ?? null) === previous.object)
      emit("click", { intersection, originalEvent: event });
  };
  const leave = (event: PointerEvent): void => {
    press = null;
    hover(null, event);
  };
  const blur = (): void => {
    press = null;
    hovered = null;
  };
  const bindings = {
    pointerdown: down,
    pointermove: move,
    pointerup: up,
    pointerleave: leave,
    pointercancel: leave,
  };
  const handle: PickingHandle = {
    raycaster,
    get disposed(): boolean {
      return disposed;
    },
    pick,
    on(type, callback): () => void {
      active();
      const subscription = (event: PickingEvent): void => callback(event);
      listeners[type].add(subscription);
      return () => {
        listeners[type].delete(subscription);
      };
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const [type, callback] of Object.entries(bindings))
        canvas.removeEventListener(type, callback as EventListener);
      canvas.ownerDocument.defaultView?.removeEventListener("blur", blur);
      listeners.click.clear();
      listeners.hover.clear();
      press = null;
      hovered = null;
      app.resources.untrack(handle);
    },
  };
  for (const [type, callback] of Object.entries(bindings))
    canvas.addEventListener(type, callback as EventListener);
  canvas.ownerDocument.defaultView?.addEventListener("blur", blur);
  app.resources.track(handle);
  return handle;
}
