import { expect, test, vi } from "vite-plus/test";
import {
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from "three";
import type { Intersection, Object3D } from "three";
import type { ThreeApp, ThreeAppState } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";
import { attachPicking } from "../src/interaction.ts";

function fixture() {
  const view = new EventTarget();
  const canvas = Object.assign(new EventTarget(), {
    ownerDocument: { defaultView: view },
    getBoundingClientRect: () => ({
      left: 100,
      top: 200,
      width: 400,
      height: 200,
      right: 500,
      bottom: 400,
    }),
  });
  const camera = new PerspectiveCamera(50, 2, 0.1, 100);
  camera.position.z = 5;
  const state = {
    state: "ready" as ThreeAppState,
    camera,
    renderer: { domElement: canvas },
    resources: new ResourceScope(),
  };
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const targets: Object3D[] = [mesh];
  const app = state as unknown as ThreeApp;
  const picker = attachPicking(app, { objects: () => targets });
  const send = (type: string, options: Partial<PointerEvent> = {}): void => {
    canvas.dispatchEvent(
      Object.assign(new Event(type), {
        clientX: 300,
        clientY: 300,
        button: 0,
        buttons: 0,
        pointerId: 1,
        isPrimary: true,
        pointerType: "mouse",
        ...options,
      }),
    );
  };
  return { app, state, mesh, targets, canvas, view, picker, send };
}

function instancedFixture() {
  const env = fixture();
  const mesh = new InstancedMesh(env.mesh.geometry, env.mesh.material, 2);
  mesh.setMatrixAt(0, new Matrix4().makeTranslation(-0.6, 0, 0));
  mesh.setMatrixAt(1, new Matrix4().makeTranslation(0.6, 0, 0));
  env.targets.splice(0, 1, mesh);
  env.state.camera.updateMatrixWorld();
  const left = new Vector3(-0.6, 0, 0).project(env.state.camera);
  const right = new Vector3(0.6, 0, 0).project(env.state.camera);
  return {
    ...env,
    instance: mesh,
    left: 100 + (left.x + 1) * 200,
    right: 100 + (right.x + 1) * 200,
  };
}

test("hover distinguishes native instances on one mesh and resets the instance identity on leave and blur", () => {
  const env = instancedFixture();
  const ids: Array<number | null> = [];
  env.picker.on("hover", ({ intersection }) => ids.push(intersection?.instanceId ?? null));
  env.send("pointermove", { clientX: env.left });
  env.send("pointermove", { clientX: env.left });
  env.send("pointermove", { clientX: env.right });
  env.send("pointerleave");
  env.send("pointermove", { clientX: env.right });
  env.view.dispatchEvent(new Event("blur"));
  env.send("pointermove", { clientX: env.right });
  expect(ids).toEqual([0, 1, null, 1, 1]);
});

test("a stationary press cannot click a different native instance moved under the pointer", () => {
  const env = instancedFixture();
  const clicks = vi.fn();
  env.picker.on("click", clicks);
  env.send("pointerdown", { clientX: env.left });
  env.instance.setMatrixAt(0, new Matrix4().makeTranslation(0.6, 0, 0));
  env.instance.setMatrixAt(1, new Matrix4().makeTranslation(-0.6, 0, 0));
  env.instance.boundingSphere = null;
  env.send("pointerup", { clientX: env.left });
  expect(clicks).not.toHaveBeenCalled();
  env.send("pointerdown", { clientX: env.left });
  env.send("pointerup", { clientX: env.left });
  expect(clicks).toHaveBeenCalledOnce();
  expect(clicks.mock.calls[0]![0].intersection.instanceId).toBe(1);
});

test("batch ids participate in hover and press identity without changing the native intersection", () => {
  const env = fixture();
  const hit: Intersection = { distance: 1, point: new Vector3(), object: env.mesh, batchId: 0 };
  vi.spyOn(env.picker.raycaster, "intersectObjects").mockReturnValue([hit]);
  const hover = vi.fn(),
    click = vi.fn();
  env.picker.on("hover", hover);
  env.picker.on("click", click);
  env.send("pointermove");
  env.send("pointerdown");
  hit.batchId = 1;
  env.send("pointermove");
  env.send("pointerup");
  expect(hover).toHaveBeenCalledTimes(2);
  expect(click).not.toHaveBeenCalled();
  expect(hover.mock.calls[1]![0].intersection).toBe(hit);
});

function skinFixture(externalBones = false, withBox = true) {
  const env = fixture();
  const geometry = new BoxGeometry();
  const count = geometry.attributes.position!.count;
  geometry.setAttribute("skinIndex", new Uint16BufferAttribute(new Uint16Array(count * 4), 4));
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) weights[i * 4] = 1;
  geometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const bone = new Bone();
  const skin = new SkinnedMesh(geometry, new MeshBasicMaterial());
  const group = new Group();
  group.add(skin);
  if (externalBones) group.add(bone);
  else skin.add(bone);
  group.updateMatrixWorld(true);
  skin.bind(new Skeleton([bone]));
  if (withBox) skin.computeBoundingBox();
  skin.computeBoundingSphere();
  env.targets.splice(0, 1, skin);
  const at = (x: number): [number, number] => {
    env.state.camera.updateMatrixWorld();
    const ndc = new Vector3(x, 0, 0).project(env.state.camera);
    return [100 + (ndc.x + 1) * 200, 300];
  };
  return { ...env, skin, bone, group, at };
}

test("picking refreshes stale skinned spheres and existing boxes after pose changes without rendering", () => {
  const env = skinFixture();
  const originalCenter = env.skin.boundingSphere!.center.x;
  env.bone.position.x = 2;
  expect(env.picker.pick(...env.at(2))?.object).toBe(env.skin);
  expect(env.skin.boundingSphere!.center.x).toBeCloseTo(originalCenter + 2);
  expect(env.skin.boundingBox!.min.x).toBeCloseTo(1.5);
  env.bone.position.x = -2;
  expect(env.picker.pick(...env.at(-2))?.object).toBe(env.skin);
  expect(env.picker.pick(...env.at(2))).toBeNull();
});

test("picking updates sibling bones and attached bind inverses before the first draw", () => {
  const env = skinFixture(true);
  env.group.position.x = 1;
  env.bone.position.x = 2;
  expect(env.picker.pick(...env.at(3))?.object).toBe(env.skin);
  expect(env.skin.bindMatrixInverse.elements[12]).toBeCloseTo(-1);
});

test("skinned bound refresh is opt-out and does not allocate an unused bounding box", () => {
  const env = skinFixture(false, false);
  const native = attachPicking(env.app, { objects: () => [env.skin], updateSkinnedBounds: false });
  env.bone.position.x = 2;
  expect(native.pick(...env.at(2))).toBeNull();
  expect(env.picker.pick(...env.at(2))?.object).toBe(env.skin);
  expect(env.skin.boundingBox).toBeNull();
  expect(native.pick(...env.at(2))?.object).toBe(env.skin);
});

test("recursive bounds prepare overlapping roots once and nonrecursive picks only prepare the target", () => {
  const env = skinFixture();
  const sphere = vi.spyOn(env.skin, "computeBoundingSphere");
  const picker = attachPicking(env.app, { objects: () => [env.group, env.skin, env.group] });
  expect(picker.pick(...env.at(0))?.object).toBe(env.skin);
  expect(sphere).toHaveBeenCalledOnce();
  sphere.mockClear();
  const shallow = attachPicking(env.app, { objects: () => [env.group], recursive: false });
  expect(shallow.pick(...env.at(0))).toBeNull();
  expect(sphere).not.toHaveBeenCalled();
});

test("bounds failure releases the pick guard, and owner disposal stops before raycasting", () => {
  const env = skinFixture();
  const failure = new Error("bounds failed");
  const sphere = vi.spyOn(env.skin, "computeBoundingSphere").mockImplementationOnce(() => {
    throw failure;
  });
  expect(() => env.picker.pick(...env.at(0))).toThrow(failure);
  expect(env.picker.pick(...env.at(0))?.object).toBe(env.skin);
  const raycast = vi.spyOn(env.skin, "raycast");
  raycast.mockClear();
  const box = vi.spyOn(env.skin, "computeBoundingBox");
  box.mockClear();
  sphere.mockImplementationOnce(() => env.state.resources.dispose());
  expect(() => env.picker.pick(...env.at(0))).toThrow("disposed");
  expect(raycast).not.toHaveBeenCalled();
  expect(box).not.toHaveBeenCalled();
});

test("recursive picks from getters or raycast cannot corrupt the outer ray, and remain usable afterwards", () => {
  const env = fixture();
  const picker = attachPicking(env.app, {
    objects: () => {
      expect(() => picker.pick(301, 300)).toThrow("reentrantly");
      return [env.mesh];
    },
  });
  const native = env.mesh.raycast.bind(env.mesh);
  vi.spyOn(env.mesh, "raycast").mockImplementation((ray, hits) => {
    expect(() => picker.pick(100, 200)).toThrow("reentrantly");
    native(ray, hits);
  });
  expect(picker.pick(300, 300)?.object).toBe(env.mesh);
  expect(picker.pick(300, 300)?.point.z).toBeCloseTo(0.5);
});

test("bounds flags validate before listeners attach and world/raycast disposal cannot return a live hit", () => {
  const env = fixture();
  const listener = vi.spyOn(env.canvas, "addEventListener");
  for (const flag of [0, "true", null]) {
    expect(() =>
      attachPicking(env.app, {
        objects: () => [],
        updateSkinnedBounds: flag as unknown as boolean,
      }),
    ).toThrow(TypeError);
    expect(() =>
      attachPicking(env.app, { objects: () => [], recursive: flag as unknown as boolean }),
    ).toThrow(TypeError);
  }
  expect(listener).not.toHaveBeenCalled();
  vi.spyOn(env.mesh, "raycast").mockImplementation(() => env.state.resources.dispose());
  expect(() => env.picker.pick(300, 300)).toThrow("disposed");
  const second = fixture();
  const raycast = vi.spyOn(second.mesh, "raycast");
  vi.spyOn(second.mesh, "updateWorldMatrix").mockImplementation(() =>
    second.state.resources.dispose(),
  );
  expect(() => second.picker.pick(300, 300)).toThrow("disposed");
  expect(raycast).not.toHaveBeenCalled();
});

test("uses offset CSS bounds, updates matrices before rendering, and returns native hit data", () => {
  const { picker, mesh, state, canvas } = fixture();
  expect(picker.pick(300, 300)?.object).toBe(mesh);
  expect(picker.pick(300, 300)?.point.z).toBeCloseTo(0.5);
  mesh.position.x = 2;
  expect(picker.pick(300, 300)).toBeNull();
  const ndc = new Vector3(2, 0, 0).project(state.camera);
  expect(picker.pick(100 + (ndc.x + 1) * 200, 300)?.object).toBe(mesh);
  // CSS scaling affects the rect, not drawing-buffer pixels or DPR.
  canvas.getBoundingClientRect = () => ({
    left: 100,
    top: 200,
    width: 200,
    height: 100,
    right: 300,
    bottom: 300,
  });
  mesh.position.x = 0;
  expect(picker.pick(200, 250)?.object).toBe(mesh);
});

test("rejects outside, non-finite and zero-size coordinates without reading targets", () => {
  const { app, canvas } = fixture();
  const objects = vi.fn(() => []);
  const picker = attachPicking(app, { objects });
  for (const [x, y] of [
    [99, 300],
    [300, 401],
    [NaN, 300],
    [300, Infinity],
  ])
    expect(picker.pick(x!, y!)).toBeNull();
  canvas.getBoundingClientRect = () => ({
    left: 100,
    top: 200,
    width: 0,
    height: 0,
    right: 100,
    bottom: 200,
  });
  expect(picker.pick(100, 200)).toBeNull();
  expect(objects).not.toHaveBeenCalled();
});

test("reads dynamic targets, supports recursive groups and excludes invisible ancestors", () => {
  const { picker, targets, mesh, app } = fixture();
  const group = new Group();
  group.add(mesh);
  targets.splice(0, 1, group);
  expect(picker.pick(300, 300)?.object).toBe(mesh);
  group.visible = false;
  expect(picker.pick(300, 300)).toBeNull();
  group.visible = true;
  expect(
    attachPicking(app, { objects: () => [group], recursive: false }).pick(300, 300),
  ).toBeNull();
  targets.length = 0;
  expect(picker.pick(300, 300)).toBeNull();
});

test("selects the nearest visible object and honors native layers", () => {
  const { picker, targets, mesh } = fixture();
  const front = new Mesh(mesh.geometry, mesh.material);
  front.position.z = 2;
  targets.push(front);
  expect(picker.pick(300, 300)?.object).toBe(front);
  front.visible = false;
  expect(picker.pick(300, 300)?.object).toBe(mesh);
  picker.raycaster.layers.set(1);
  expect(picker.pick(300, 300)).toBeNull();
  mesh.layers.enable(1);
  expect(picker.pick(300, 300)?.object).toBe(mesh);
});

test("emits click on a matching press/release, including empty space, and supports touch", () => {
  const { picker, send, mesh } = fixture();
  const callback = vi.fn();
  picker.on("click", callback);
  send("pointerdown");
  send("pointerup");
  expect(callback.mock.calls[0]![0].intersection.object).toBe(mesh);
  send("pointerdown", { clientX: 110 });
  send("pointerup", { clientX: 110 });
  expect(callback.mock.calls[1]![0].intersection).toBeNull();
  send("pointerdown", { pointerType: "touch" });
  send("pointerup", { pointerType: "touch" });
  expect(callback).toHaveBeenCalledTimes(3);
});

test("suppresses drags even if the pointer returns, and checks release displacement", () => {
  const { picker, send } = fixture();
  const callback = vi.fn();
  picker.on("click", callback);
  send("pointerdown");
  send("pointermove", { clientX: 310, buttons: 1 });
  send("pointerup");
  send("pointerdown");
  send("pointerup", { clientX: 310 });
  expect(callback).not.toHaveBeenCalled();
  send("pointerdown");
  send("pointerup", { clientX: 302 });
  expect(callback).toHaveBeenCalledTimes(1);
});

test("cancels on leave, cancel, blur, second pointer, wrong pointer and non-left input", () => {
  const { picker, send, view } = fixture();
  const callback = vi.fn();
  picker.on("click", callback);
  for (const type of ["pointerleave", "pointercancel"]) {
    send("pointerdown");
    send(type);
    send("pointerup");
  }
  send("pointerdown");
  view.dispatchEvent(new Event("blur"));
  send("pointerup");
  send("pointerdown");
  send("pointerdown", { pointerId: 2, isPrimary: false });
  send("pointerup");
  send("pointerdown");
  send("pointerup", { pointerId: 2 });
  send("pointerdown", { button: 2 });
  send("pointerup", { button: 2 });
  send("pointerup");
  expect(callback).not.toHaveBeenCalled();
});

test("does not click if the hit changes between press and release", () => {
  const { picker, send, targets } = fixture();
  const callback = vi.fn();
  picker.on("click", callback);
  send("pointerdown");
  targets.length = 0;
  send("pointerup");
  expect(callback).not.toHaveBeenCalled();
});

test("hover reports object transitions and exit, ignoring drag and touch movement", () => {
  const { picker, send, mesh } = fixture();
  const callback = vi.fn();
  picker.on("hover", callback);
  send("pointermove", { pointerType: "touch" });
  send("pointermove", { buttons: 1 });
  expect(callback).not.toHaveBeenCalled();
  send("pointermove");
  send("pointermove", { clientX: 301 });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback.mock.calls[0]![0].intersection.object).toBe(mesh);
  send("pointerleave");
  expect(callback.mock.calls[1]![0].intersection).toBeNull();
});

test("subscriptions are independent and changes during dispatch apply safely", () => {
  const { picker, send } = fixture();
  const callback = vi.fn();
  let off = (): void => {};
  picker.on("click", () => {
    off();
    picker.on("click", callback);
  });
  off = picker.on("click", callback);
  const off2 = picker.on("click", callback);
  send("pointerdown");
  send("pointerup");
  expect(callback).toHaveBeenCalledTimes(1);
  off2();
  off2();
  send("pointerdown");
  send("pointerup");
  expect(callback).toHaveBeenCalledTimes(2);
});

test("host cleanup removes listeners, does not own targets, and stops in-flight dispatch", () => {
  const { picker, state, send, mesh, canvas, view } = fixture();
  const remove = vi.spyOn(canvas, "removeEventListener");
  const removeView = vi.spyOn(view, "removeEventListener");
  const geometry = vi.spyOn(mesh.geometry, "dispose");
  const callback = vi.fn();
  picker.on("click", () => state.resources.dispose());
  picker.on("click", callback);
  send("pointerdown");
  send("pointerup");
  expect(picker.disposed).toBe(true);
  expect(remove).toHaveBeenCalledTimes(5);
  expect(removeView).toHaveBeenCalledTimes(1);
  expect(callback).not.toHaveBeenCalled();
  expect(geometry).not.toHaveBeenCalled();
  picker.dispose();
  send("pointermove");
  send("pointerdown");
  send("pointerup");
  expect(remove).toHaveBeenCalledTimes(5);
  expect(() => picker.pick(300, 300)).toThrow("disposed");
  expect(() => picker.on("click", callback)).toThrow("disposed");
});

test("multiple hosts keep targets and listeners isolated, including while stopped", () => {
  const first = fixture();
  const second = fixture();
  first.state.state = "stopped";
  const a = vi.fn();
  const b = vi.fn();
  first.picker.on("click", a);
  second.picker.on("click", b);
  first.send("pointerdown");
  first.send("pointerup");
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).not.toHaveBeenCalled();
  expect(first.picker.pick(300, 300)?.object).toBe(first.mesh);
  expect(second.picker.pick(300, 300)?.object).toBe(second.mesh);
});

test("validates thresholds and rejects attachment to a disposed host or scope", () => {
  const { app, state } = fixture();
  for (const dragThreshold of [-1, NaN, Infinity])
    expect(() => attachPicking(app, { objects: () => [], dragThreshold })).toThrow(RangeError);
  state.resources.dispose();
  expect(() => attachPicking(app, { objects: () => [] })).toThrow("scope");
  state.state = "disposed";
  expect(() => attachPicking(app, { objects: () => [] })).toThrow("ThreeApp");
});

test("a target getter that ends the host cannot return a live pick", () => {
  const { app, state, mesh } = fixture();
  const picker = attachPicking(app, {
    objects: () => {
      state.resources.dispose();
      return [mesh];
    },
  });
  expect(() => picker.pick(300, 300)).toThrow("disposed");
  expect(picker.disposed).toBe(true);
});
