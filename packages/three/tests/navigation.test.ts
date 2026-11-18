import { fitObject } from "../src/camera.ts";
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { attachFirstPersonControls, attachThirdPersonControls } from "../src/navigation.ts";
import { ResourceScope } from "../src/core/resources.ts";
import type { ThreeApp, FrameInfo } from "../src/index.ts";
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
  vi.restoreAllMocks();
});
function fixture() {
  const view = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    defaultView: view,
    hidden: false,
    pointerLockElement: null as unknown,
    activeElement: null as unknown,
    exitPointerLock: vi.fn(() => {
      doc.pointerLockElement = null;
      doc.dispatchEvent(new Event("pointerlockchange"));
    }),
  });
  const attrs = new Map<string, string>();
  const canvas = Object.assign(new EventTarget(), {
    ownerDocument: doc,
    style: { touchAction: "pan-y" },
    clientWidth: 800,
    clientHeight: 400,
    getRootNode: () => doc,
    getAttribute: (n: string) => attrs.get(n) ?? null,
    setAttribute: (n: string, v: string) => {
      attrs.set(n, v);
    },
    removeAttribute: (n: string) => {
      attrs.delete(n);
    },
    focus: () => {
      doc.activeElement = canvas;
    },
    requestPointerLock: vi.fn(async () => {
      doc.pointerLockElement = canvas;
      doc.dispatchEvent(new Event("pointerlockchange"));
    }),
  });
  const camera = new PerspectiveCamera(50, 2, 0.1, 100);
  camera.position.set(0, 1.6, 4);
  const resources = new ResourceScope(),
    scope = new ResourceScope(),
    controller = new AbortController(),
    updates = new Set<(f: FrameInfo) => void>();
  const scene = new Scene(),
    actor = new Group();
  scene.add(actor);
  const value = {
    camera,
    scene,
    resources,
    signal: controller.signal,
    state: "running",
    size: { width: 800, height: 400 },
    renderer: { domElement: canvas },
    onUpdate(fn: (f: FrameInfo) => void) {
      updates.add(fn);
      return () => {
        updates.delete(fn);
      };
    },
  };
  cleanup.push(() => {
    scope.dispose();
    resources.dispose();
    controller.abort();
  });
  return {
    app: value as unknown as ThreeApp,
    value,
    scope,
    actor,
    canvas,
    doc,
    view,
    updates,
    tick(delta = 1 / 60) {
      for (const fn of Array.from(updates)) if (updates.has(fn)) fn({ delta, elapsed: delta });
    },
    key(code: string) {
      const event = Object.assign(new Event("keydown", { cancelable: true }), {
        code,
        repeat: false,
      });
      doc.dispatchEvent(event);
      return event;
    },
  };
}
test("native first-person controls move on the host clock, normalize diagonals and copy diagnostics", () => {
  const e = fixture(),
    h = attachFirstPersonControls(e.app, { keyboard: false });
  expect(h.controls).toBeInstanceOf(PointerLockControls);
  h.setInput({ forward: 1, right: 1 });
  for (let i = 0; i < 60; i++) e.tick();
  expect(h.position.distanceTo(new Vector3(0, 0, 4))).toBeCloseTo(4, 6);
  const p = h.position;
  p.setScalar(99);
  expect(h.position.x).toBeLessThan(4);
  expect(e.value.camera.position.y).toBeCloseTo(1.6);
  h.setEnabled(false);
  const old = h.position;
  e.tick();
  expect(h.position.equals(old)).toBe(true);
  h.setEnabled(true);
  e.tick();
  expect(h.position.equals(old)).toBe(true);
});
test("first-person keyboard requires this canvas's pointer lock; blur clears and unlocks", async () => {
  const e = fixture(),
    h = attachFirstPersonControls(e.app);
  e.key("KeyW");
  e.tick();
  expect(h.position.z).toBe(4);
  await h.lock();
  expect(h.locked).toBe(true);
  expect(e.key("KeyW").defaultPrevented).toBe(true);
  e.tick();
  expect(h.position.z).toBeLessThan(4);
  const old = h.position;
  e.view.dispatchEvent(new Event("blur"));
  expect(h.locked).toBe(false);
  e.tick();
  expect(h.position.equals(old)).toBe(true);
  e.doc.pointerLockElement = {};
  h.dispose();
  expect(e.doc.pointerLockElement).not.toBeNull();
});
test("third-person follows an owned actor; moving focus to another element stops keyboard movement", () => {
  const e = fixture(),
    h = attachThirdPersonControls(e.app, e.actor, { position: new Vector3(0, 0, 4) });
  expect(h.controls).toBeInstanceOf(OrbitControls);
  e.canvas.focus();
  e.key("KeyW");
  e.tick();
  expect(e.actor.position.z).toBeLessThan(4);
  expect(e.actor.position.equals(h.position)).toBe(true);
  const old = h.position;
  e.doc.activeElement = {};
  e.tick();
  expect(h.position.equals(old)).toBe(true);
  h.teleport(new Vector3(3, 0, 2));
  expect(e.actor.position.toArray()).toEqual([3, 0, 2]);
  expect(h.controls.target.distanceTo(new Vector3(3, 1.6, 2))).toBeLessThan(1e-10);
});
test("scope disposal detaches callbacks, restores canvas configuration and permits switching modes", () => {
  const e = fixture(),
    h = attachThirdPersonControls(e.app, e.actor, { scope: e.scope });
  expect(e.canvas.getAttribute("tabindex")).toBe("0");
  expect(e.canvas.style.touchAction).toBe("none");
  expect(() => attachFirstPersonControls(e.app)).toThrow(/already own/);
  e.scope.dispose();
  expect(h.disposed).toBe(true);
  expect(e.updates.size).toBe(0);
  expect(e.canvas.getAttribute("tabindex")).toBeNull();
  expect(e.canvas.style.touchAction).toBe("pan-y");
  expect(() => attachFirstPersonControls(e.app)).not.toThrow();
});
test("external actor writes fail before movement and release the camera; invalid input preserves controls", () => {
  const e = fixture(),
    h = attachThirdPersonControls(e.app, e.actor);
  expect(() => h.setInput({ right: NaN })).toThrow();
  expect(h.disposed).toBe(false);
  e.actor.position.x++;
  expect(() => e.tick()).toThrow(/externally/);
  expect(h.disposed).toBe(true);
  expect(e.updates.size).toBe(0);
  expect(() => attachFirstPersonControls(e.app)).not.toThrow();
});
test("late pointer-lock acquisition after disposal exits only this canvas", async () => {
  const e = fixture();
  let finish!: () => void;
  e.canvas.requestPointerLock.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = () => {
          e.doc.pointerLockElement = e.canvas;
          resolve();
        };
      }),
  );
  const h = attachFirstPersonControls(e.app),
    pending = h.lock();
  h.dispose();
  finish();
  await expect(pending).rejects.toThrow(/ended/);
  expect(e.doc.pointerLockElement).toBeNull();
});
test("native enabled reflects visibility, size and host state without changing the requested value", () => {
  const e = fixture(),
    h = attachFirstPersonControls(e.app);
  expect(h.controls.enabled).toBe(true);
  e.value.state = "stopped";
  expect(h.controls.enabled).toBe(false);
  expect(h.enabled).toBe(true);
  e.value.state = "running";
  e.doc.hidden = true;
  expect(h.controls.enabled).toBe(false);
  e.doc.hidden = false;
  e.value.size.width = 0;
  expect(h.controls.enabled).toBe(false);
});

test("pending lock leases survive disposal, block replacement requests and release after completion", async () => {
  const e = fixture();
  let finish!: () => void;
  e.canvas.requestPointerLock.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = () => {
          e.doc.pointerLockElement = e.canvas;
          resolve();
        };
      }),
  );
  const old = attachFirstPersonControls(e.app),
    pending = old.lock();
  old.dispose();
  const next = attachFirstPersonControls(e.app);
  await expect(next.lock()).rejects.toThrow(/in progress/);
  finish();
  await expect(pending).rejects.toThrow(/ended/);
  e.canvas.requestPointerLock.mockImplementation(async () => {
    e.doc.pointerLockElement = e.canvas;
    e.doc.dispatchEvent(new Event("pointerlockchange"));
  });
  await next.lock();
  expect(next.locked).toBe(true);
  e.key("Escape");
  expect(next.locked).toBe(false);
});
test("disposing third-person controls borrows the actor and releases the shared camera lease", () => {
  const e = fixture(),
    h = attachThirdPersonControls(e.app, e.actor);
  h.dispose();
  expect(e.actor.parent).toBe(e.value.scene);
  expect(e.updates.size).toBe(0);
  expect(() => h.teleport(new Vector3())).toThrow(/disposed/);
  expect(() => attachFirstPersonControls(e.app)).not.toThrow();
});

test("instant framing hands the shared camera lease away from navigation", () => {
  const e = fixture(),
    h = attachFirstPersonControls(e.app);
  const geometry = new BoxGeometry(),
    material = new MeshBasicMaterial();
  try {
    fitObject(e.app, new Mesh(geometry, material));
    expect(h.disposed).toBe(true);
    expect(e.updates.size).toBe(0);
  } finally {
    geometry.dispose();
    material.dispose();
  }
});
