import { afterEach, expect, test, vi } from "vite-plus/test";
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene } from "three";
import type { BufferGeometry, Material, Object3D } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { ResourceScope } from "../src/resources.ts";
import { attachTransformControls } from "../src/controls.ts";
import type { ThreeApp } from "../src/three-app.ts";

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) {
    try {
      dispose();
    } catch {
      /* Failure cases assert their own errors. */
    }
  }
  vi.restoreAllMocks();
});

function fixture() {
  const controller = new AbortController();
  const view = new EventTarget();
  const document = Object.assign(new EventTarget(), { defaultView: view });
  const canvas = Object.assign(new EventTarget(), {
    style: { touchAction: "pan-y" },
    ownerDocument: document,
    getRootNode: () => document,
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
  const camera = new PerspectiveCamera();
  camera.position.set(4, 3, 5);
  camera.lookAt(0, 0, 0);
  const value = {
    scene: new Scene(),
    camera,
    signal: controller.signal,
    resources: new ResourceScope(),
    renderer: { domElement: canvas as unknown as HTMLCanvasElement },
  };
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  value.scene.add(mesh);
  const app = value as unknown as ThreeApp;
  const orbit = new OrbitControls(camera);
  // A disconnected borrowed native controls instance is enough for coordination tests.
  orbit.domElement = value.renderer.domElement;
  const dispose = (): void => {
    controller.abort();
    value.resources.dispose();
    mesh.geometry.dispose();
    mesh.material.dispose();
  };
  cleanup.push(dispose);
  return { app, ...value, mesh, canvas, view, orbit, dispose };
}

test("native helper mounts once with configured mode/space/size and borrows the model", () => {
  const env = fixture();
  const modelDisposal = vi.spyOn(env.mesh.geometry, "dispose");
  const handle = attachTransformControls(env.app, {
    object: env.mesh,
    mode: "rotate",
    space: "local",
    size: 1.5,
  });
  expect(handle.controls).toBeInstanceOf(TransformControls);
  expect(handle.helper.parent).toBe(env.scene);
  expect(handle.controls.object).toBe(env.mesh);
  expect(handle.controls.mode).toBe("rotate");
  expect(handle.controls.space).toBe("local");
  expect(handle.controls.size).toBe(1.5);
  expect(env.canvas.style.touchAction).toBe("none");
  handle.dispose();
  handle.dispose();
  expect(handle.disposed).toBe(true);
  expect(handle.helper.parent).toBeNull();
  expect(handle.controls.object).toBeUndefined();
  expect(env.mesh.parent).toBe(env.scene);
  expect(modelDisposal).not.toHaveBeenCalled();
  expect(env.canvas.style.touchAction).toBe("pan-y");
});

test("detached construction, attach/detach and identity-safe replacement preserve independent handles", () => {
  const env = fixture();
  const first = attachTransformControls(env.app);
  expect(first.helper.visible).toBe(false);
  first.attach(env.mesh);
  expect(first.helper.visible).toBe(true);
  first.detach();
  first.detach();
  expect(first.controls.object).toBeUndefined();
  expect(first.helper.visible).toBe(false);
  first.dispose();
  const second = attachTransformControls(env.app, { object: env.mesh });
  first.dispose();
  expect(second.helper.parent).toBe(env.scene);
  expect(() => first.attach(env.mesh)).toThrow("disposed");
});

test("invalid configuration, foreign targets/controls and duplicate attachment reject without mutation", () => {
  const env = fixture();
  const other = fixture();
  for (const size of [0, -1, NaN, Infinity])
    expect(() => attachTransformControls(env.app, { size })).toThrow("options");
  expect(() => attachTransformControls(env.app, { object: other.mesh })).toThrow("descendant");
  expect(() => attachTransformControls(env.app, { object: env.scene })).toThrow("descendant");
  expect(() => attachTransformControls(env.app, { orbitControls: other.orbit })).toThrow(
    "camera and canvas",
  );
  expect(env.scene.children).toEqual([env.mesh]);
  expect(env.canvas.style.touchAction).toBe("pan-y");
  const handle = attachTransformControls(env.app, { object: env.mesh });
  expect(() => attachTransformControls(env.app)).toThrow("already");
  expect(() => handle.attach(handle.helper.children[0]!)).toThrow("owned helper");
  expect(handle.controls.object).toBe(env.mesh);
});

test("dragging disables only the borrowed orbit and restores its previous enabled state", () => {
  const env = fixture();
  const other = fixture();
  const handle = attachTransformControls(env.app, { object: env.mesh, orbitControls: env.orbit });
  handle.controls.dispatchEvent({ type: "dragging-changed", value: true });
  expect(env.orbit.enabled).toBe(false);
  expect(other.orbit.enabled).toBe(true);
  handle.controls.dispatchEvent({ type: "dragging-changed", value: true });
  handle.controls.dispatchEvent({ type: "dragging-changed", value: false });
  expect(env.orbit.enabled).toBe(true);
  env.orbit.enabled = false;
  handle.controls.dispatchEvent({ type: "dragging-changed", value: true });
  handle.controls.dispatchEvent({ type: "dragging-changed", value: false });
  expect(env.orbit.enabled).toBe(false);
  env.orbit.enabled = true;
  handle.controls.dispatchEvent({ type: "dragging-changed", value: true });
  env.orbit.enabled = true;
  handle.dispose();
  expect(env.orbit.enabled).toBe(true);
});

test("pointer cancellation, capture loss and window blur release an active drag and orbit lease", () => {
  const env = fixture();
  const handle = attachTransformControls(env.app, { object: env.mesh, orbitControls: env.orbit });
  for (const type of ["pointercancel", "lostpointercapture", "blur"]) {
    handle.controls.pointerDown = vi.fn();
    // Native public pointerUp owns the dragging state. Set it through its runtime property descriptor for test setup.
    Reflect.set(handle.controls, "dragging", true);
    expect(env.orbit.enabled).toBe(false);
    (type === "blur" ? env.view : env.canvas).dispatchEvent(new Event(type));
    expect(handle.controls.dragging).toBe(false);
    expect(env.orbit.enabled).toBe(true);
  }
});

test("drag startup drains pending orbit motion once and restores damping/autorotation by value", () => {
  const env = fixture();
  env.orbit.enableDamping = true;
  env.orbit.autoRotate = true;
  const update = vi.spyOn(env.orbit, "update");
  const handle = attachTransformControls(env.app, { object: env.mesh, orbitControls: env.orbit });
  Reflect.set(handle.controls, "dragging", true);
  expect(update).toHaveBeenCalledExactlyOnceWith(0);
  expect(env.orbit.autoRotate).toBe(false);
  expect(env.orbit.enableDamping).toBe(false);
  env.orbit.update(1);
  const position = env.camera.position.clone();
  env.orbit.update(1);
  expect(env.camera.position.equals(position)).toBe(true);
  handle.detach();
  expect(env.orbit.enableDamping).toBe(true);
  expect(env.orbit.autoRotate).toBe(true);
});

test("orbit update failure releases all temporary flags before propagating", () => {
  const env = fixture();
  env.orbit.enableDamping = true;
  env.orbit.autoRotate = true;
  const handle = attachTransformControls(env.app, { orbitControls: env.orbit });
  const failure = new Error("native update");
  vi.spyOn(env.orbit, "update").mockImplementation(() => {
    throw failure;
  });
  expect(() => Reflect.set(handle.controls, "dragging", true)).toThrow(failure);
  expect(env.orbit.enabled).toBe(true);
  expect(env.orbit.enableDamping).toBe(true);
  expect(env.orbit.autoRotate).toBe(true);
  handle.dispose();
});

test("detach during drag releases capture without reverting the borrowed object's pose", () => {
  const env = fixture();
  const handle = attachTransformControls(env.app, { object: env.mesh, orbitControls: env.orbit });
  Reflect.set(handle.controls, "dragging", true);
  // Dispatch directly to the wrapper tracking listener while native DOM processing is disabled.
  handle.controls.enabled = false;
  const event = Object.assign(new Event("pointerdown"), { pointerId: 7 });
  env.canvas.dispatchEvent(event);
  env.mesh.position.set(1, 2, 3);
  handle.detach();
  expect(env.canvas.releasePointerCapture).toHaveBeenCalledWith(7);
  expect(env.orbit.enabled).toBe(true);
  expect(env.mesh.position.toArray()).toEqual([1, 2, 3]);
  expect(handle.controls.dragging).toBe(false);
});

test("disabling native input mid-drag still releases orbit on pointerup", () => {
  const env = fixture();
  const handle = attachTransformControls(env.app, { object: env.mesh, orbitControls: env.orbit });
  Reflect.set(handle.controls, "dragging", true);
  handle.controls.enabled = false;
  env.canvas.dispatchEvent(new Event("pointerup"));
  expect(env.orbit.enabled).toBe(true);
  expect(handle.controls.dragging).toBe(false);
});

test("all unique native GPU assets are released and foreign additions remain borrowed", () => {
  const env = fixture();
  const handle = attachTransformControls(env.app);
  const assets = new Set<BufferGeometry | Material>();
  handle.helper.traverse((node) => {
    const drawable = node as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    if (drawable.geometry) assets.add(drawable.geometry);
    if (drawable.material)
      for (const material of Array.isArray(drawable.material)
        ? drawable.material
        : [drawable.material])
        assets.add(material);
  });
  const disposals = [...assets].map((asset) => vi.spyOn(asset, "dispose"));
  const foreign = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const borrowed = vi.spyOn(foreign.geometry, "dispose");
  handle.helper.add(foreign);
  handle.dispose();
  expect(disposals.length).toBeGreaterThan(10);
  for (const release of disposals) expect(release).toHaveBeenCalledTimes(1);
  expect(borrowed).not.toHaveBeenCalled();
  foreign.geometry.dispose();
  foreign.material.dispose();
});

test("cleanup errors still restore orbit/style, detach helper, clear ownership and release remaining assets", () => {
  const env = fixture();
  const handle = attachTransformControls(env.app, { object: env.mesh, orbitControls: env.orbit });
  const resources: BufferGeometry[] = [];
  handle.helper.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.geometry) resources.push(mesh.geometry);
  });
  vi.spyOn(resources[0]!, "dispose").mockImplementation(() => {
    throw new Error("GPU cleanup");
  });
  const another = vi.spyOn(resources.at(-1)!, "dispose");
  Reflect.set(handle.controls, "dragging", true);
  expect(() => handle.dispose()).toThrow(AggregateError);
  expect(another).toHaveBeenCalled();
  expect(env.orbit.enabled).toBe(true);
  expect(env.canvas.style.touchAction).toBe("pan-y");
  expect(handle.helper.parent).toBeNull();
  expect(() => attachTransformControls(env.app)).not.toThrow();
});

test("external touch-action edits survive native disconnection", () => {
  const env = fixture();
  const handle = attachTransformControls(env.app);
  env.canvas.style.touchAction = "pan-x";
  handle.dispose();
  expect(env.canvas.style.touchAction).toBe("pan-x");
});

test("host/scope disposal releases listeners and refuses future attachment", () => {
  const env = fixture();
  const handle = attachTransformControls(env.app, { object: env.mesh, orbitControls: env.orbit });
  const remove = vi.spyOn(env.canvas, "removeEventListener");
  Reflect.set(handle.controls, "dragging", true);
  env.dispose();
  expect(handle.disposed).toBe(true);
  expect(env.orbit.enabled).toBe(true);
  expect(handle.helper.parent).toBeNull();
  expect(remove).toHaveBeenCalled();
  expect(() => attachTransformControls(env.app)).toThrow("disposed");
});

test("synchronous host destruction during helper mounting rolls back without a live handle", () => {
  const env = fixture();
  const original = env.scene.add.bind(env.scene);
  vi.spyOn(env.scene, "add").mockImplementation((...objects) => {
    original(...objects);
    env.dispose();
    return env.scene;
  });
  expect(() => attachTransformControls(env.app)).toThrow("disposed");
  expect(env.scene.children).toEqual([env.mesh]);
  expect(env.canvas.style.touchAction).toBe("pan-y");
});

test("native connect failure rolls back and releases the exclusive slot for retry", () => {
  const env = fixture();
  const failure = vi.spyOn(TransformControls.prototype, "connect").mockImplementationOnce(() => {
    throw new Error("connect failed");
  });
  expect(() => attachTransformControls(env.app)).toThrow("connect failed");
  failure.mockRestore();
  expect(env.scene.children).toEqual([env.mesh]);
  expect(env.canvas.style.touchAction).toBe("pan-y");
  expect(() => attachTransformControls(env.app)).not.toThrow();
});

test("synchronous disposal from native attachment events cannot revive the helper", () => {
  const env = fixture();
  const handle = attachTransformControls(env.app);
  handle.controls.addEventListener("object-changed", () => handle.dispose());
  expect(() => handle.attach(env.mesh)).toThrow("disposed");
  expect(handle.disposed).toBe(true);
  expect(handle.helper.parent).toBeNull();
  expect(handle.helper.visible).toBe(false);
  expect(handle.controls.object).toBeUndefined();
});

test("consumer mouseUp errors still release orbit and detach the model", () => {
  const env = fixture();
  const handle = attachTransformControls(env.app, { object: env.mesh, orbitControls: env.orbit });
  handle.controls.axis = "Y";
  Reflect.set(handle.controls, "dragging", true);
  handle.controls.addEventListener("mouseUp", () => {
    throw new Error("consumer mouseUp");
  });
  expect(() => handle.detach()).toThrow(AggregateError);
  expect(env.orbit.enabled).toBe(true);
  expect(handle.controls.object).toBeUndefined();
  expect(handle.helper.visible).toBe(false);
  handle.dispose();
});
