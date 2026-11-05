import { expect, test, vi } from "vite-plus/test";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Vector3 } from "three";
import type { Object3D } from "three";
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
