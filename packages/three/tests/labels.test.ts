import { expect, test, vi } from "vite-plus/test";
import { Group, Object3D, PerspectiveCamera, Scene } from "three";
import type { ThreeApp, ThreeAppState } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";
import { attachDOMLabels } from "../src/labels.ts";

// A small DOM adapter; actual layout, hit testing and ResizeObserver run in browser tests.
class ElementStub {
  parentNode: ElementStub | null = null;
  children: ElementStub[] = [];
  style = { cssText: "", left: "", top: "" };
  hidden = false;
  clientWidth = 400;
  clientHeight = 200;
  rect = { left: 100, top: 200, width: 400, height: 200 };
  connected = (): void => {};
  constructor(readonly ownerDocument: Document) {}
  contains(element: ElementStub): boolean {
    return this === element || this.children.some((child) => child.contains(element));
  }
  getBoundingClientRect() {
    return this.rect;
  }
  appendChild(element: ElementStub): ElementStub {
    element.remove();
    this.children.push(element);
    element.parentNode = this;
    element.connected();
    return element;
  }
  remove(): void {
    if (!this.parentNode) return;
    const parent = this.parentNode;
    parent.children.splice(parent.children.indexOf(this), 1);
    this.parentNode = null;
  }
  html(): HTMLElement {
    return this as unknown as HTMLElement;
  }
}

function fixture() {
  const callbacks = new Set<() => void>();
  const observations: Array<() => void> = [];
  const disconnect = vi.fn();
  const document = {
    defaultView: {
      ResizeObserver: class {
        constructor(callback: () => void) {
          observations.push(callback);
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    },
    createElement: (): ElementStub => new ElementStub(document as unknown as Document),
  };
  const element = (): ElementStub => document.createElement();
  const canvas = element();
  const container = element();
  const camera = new PerspectiveCamera(50, 2, 0.1, 100);
  camera.position.z = 5;
  const state = {
    state: "ready" as ThreeAppState,
    scene: new Scene(),
    camera,
    renderer: { domElement: canvas.html() },
    resources: new ResourceScope(),
    onAfterRender(callback: () => void): () => void {
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
      };
    },
  };
  const app = state as unknown as ThreeApp;
  const target = new Object3D();
  state.scene.add(target);
  const layer = attachDOMLabels(app, container.html());
  const content = element();
  const add = () => layer.add({ object: target, element: content.html() });
  const wrapper = (): ElementStub => content.parentNode!;
  return {
    state,
    app,
    target,
    canvas,
    container,
    layer,
    content,
    add,
    element,
    wrapper,
    callbacks,
    observations,
    disconnect,
  };
}

test("projects into the overlay in CSS pixels and keeps application content styles", () => {
  const env = fixture();
  env.content.style.cssText = "color:red";
  env.add();
  expect(env.wrapper().style.left).toBe("200px");
  expect(env.wrapper().style.top).toBe("100px");
  expect(env.wrapper().hidden).toBe(false);
  expect(env.content.style.cssText).toBe("color:red");
  env.container.rect = { left: 0, top: 100, width: 200, height: 100 };
  env.container.clientWidth = 400;
  env.container.clientHeight = 200;
  env.canvas.rect = { left: 10, top: 110, width: 100, height: 50 };
  env.layer.update();
  expect(env.wrapper().style.left).toBe("120px");
  expect(env.wrapper().style.top).toBe("70px");
});

test("follows parent transforms and mutable local offsets without adding scene nodes", () => {
  const env = fixture();
  const group = new Group();
  env.state.scene.add(group);
  group.add(env.target);
  const label = env.add();
  group.position.x = 1;
  env.layer.update();
  const before = Number.parseFloat(env.wrapper().style.left);
  expect(before).toBeGreaterThan(200);
  label.offset.x = -1;
  env.layer.update();
  expect(env.wrapper().style.left).toBe("200px");
  expect(env.target.children).toHaveLength(0);
});

test("hides behind-camera, offscreen, near/far and non-finite anchors", () => {
  const env = fixture();
  env.add();
  for (const [x, y, z] of [
    [0, 0, 6],
    [100, 0, 0],
    [0, 100, 0],
    [0, 0, -200],
    [0, 0, 4.99],
    [NaN, 0, 0],
  ]) {
    env.target.position.set(x!, y!, z!);
    env.layer.update();
    expect(env.wrapper().hidden).toBe(true);
  }
  env.target.position.set(0, 0, 0);
  env.layer.update();
  expect(env.wrapper().hidden).toBe(false);
});

test("honors label visibility, ancestor visibility, scene membership and camera layers", () => {
  const env = fixture();
  const label = env.add();
  label.visible = false;
  env.layer.update();
  expect(env.wrapper().hidden).toBe(true);
  label.visible = true;
  env.target.visible = false;
  env.layer.update();
  expect(env.wrapper().hidden).toBe(true);
  env.target.visible = true;
  env.state.scene.visible = false;
  env.layer.update();
  expect(env.wrapper().hidden).toBe(true);
  env.state.scene.visible = true;
  env.target.removeFromParent();
  env.layer.update();
  expect(env.wrapper().hidden).toBe(true);
  env.state.scene.add(env.target);
  env.state.camera.layers.set(1);
  env.layer.update();
  expect(env.wrapper().hidden).toBe(true);
  env.target.layers.enable(1);
  env.layer.update();
  expect(env.wrapper().hidden).toBe(false);
});

test("resize refreshes while stopped and zero-size overlays/canvases hide labels", () => {
  const env = fixture();
  env.add();
  env.state.state = "stopped";
  env.canvas.rect.height = 0;
  env.observations[0]!();
  expect(env.wrapper().hidden).toBe(true);
  env.canvas.rect.height = 200;
  env.observations[0]!();
  expect(env.wrapper().hidden).toBe(false);
  env.container.clientWidth = 0;
  env.layer.update();
  expect(env.wrapper().hidden).toBe(true);
});

test("after-render refreshes current positions without a separate loop", () => {
  const env = fixture();
  env.add();
  env.target.position.x = 1;
  for (const callback of env.callbacks) callback();
  expect(Number.parseFloat(env.wrapper().style.left)).toBeGreaterThan(200);
  expect(env.callbacks.size).toBe(1);
});

test("label disposal detaches content for reuse and preserves borrowed target ownership", () => {
  const env = fixture();
  const release = vi.spyOn(env.target, "dispose");
  const label = env.add();
  label.dispose();
  label.dispose();
  expect(env.content.parentNode).toBeNull();
  expect(label.disposed).toBe(true);
  expect(release).not.toHaveBeenCalled();
  expect(env.target.parent).toBe(env.state.scene);
  expect(env.add().disposed).toBe(false);
});

test("host scope removes labels, DOM layer, observer and subscriptions idempotently", () => {
  const env = fixture();
  const label = env.add();
  env.state.resources.dispose();
  env.layer.dispose();
  expect(env.layer.disposed).toBe(true);
  expect(label.disposed).toBe(true);
  expect(env.container.children).toHaveLength(0);
  expect(env.content.parentNode).toBeNull();
  expect(env.disconnect).toHaveBeenCalledOnce();
  expect(env.callbacks.size).toBe(0);
  expect(() => env.layer.update()).toThrow("disposed");
  expect(() => env.add()).toThrow("disposed");
  expect(() => env.observations[0]!()).not.toThrow();
});

test("clear leaves the layer usable and two instances stay independent", () => {
  const a = fixture();
  const b = fixture();
  const first = a.add();
  b.add();
  a.layer.clear();
  expect(first.disposed).toBe(true);
  expect(b.content.parentNode).not.toBeNull();
  expect(a.add().disposed).toBe(false);
  a.layer.dispose();
  b.layer.update();
  expect(b.wrapper().hidden).toBe(false);
});

test("rejects attached, duplicate, foreign and ancestor DOM elements", () => {
  const env = fixture();
  env.add();
  expect(() => env.add()).toThrow("detached");
  env.content.remove();
  expect(() => env.add()).toThrow("unique");
  expect(() => env.layer.add({ object: env.target, element: env.container.html() })).toThrow(
    "detached",
  );
  const foreign = fixture();
  expect(() => env.layer.add({ object: env.target, element: foreign.content.html() })).toThrow(
    "document",
  );
});

test("validates coordinates before taking DOM ownership and supports custom anchors", () => {
  const env = fixture();
  expect(() =>
    env.layer.add({ object: env.target, element: env.content.html(), offset: [NaN, 0, 0] }),
  ).toThrow(RangeError);
  expect(() =>
    env.layer.add({ object: env.target, element: env.content.html(), anchor: [-1, 0] }),
  ).toThrow(RangeError);
  expect(env.content.parentNode).toBeNull();
  env.layer.add({
    object: env.target,
    element: env.content.html(),
    anchor: [0, 0],
    interactive: true,
  });
  expect(env.wrapper().style.cssText).toContain("pointer-events:auto");
});

test("mounting callbacks that dispose the host roll back instead of returning a dead label", () => {
  const env = fixture();
  env.content.connected = () => env.state.resources.dispose();
  expect(() => env.add()).toThrow("disposed");
  expect(env.content.parentNode).toBeNull();
  expect(env.container.children).toHaveLength(0);
});

test("attachment rejects invalid overlay/host and rolls back failed initialization", () => {
  const env = fixture();
  expect(() => attachDOMLabels(env.app, env.canvas.html())).toThrow("overlay");
  const broken = env.element();
  broken.appendChild = () => {
    throw new Error("mount failed");
  };
  expect(() => attachDOMLabels(env.app, broken.html())).toThrow("mount failed");
  expect(env.callbacks.size).toBe(1);
  env.state.state = "disposed";
  expect(() => attachDOMLabels(env.app, env.container.html())).toThrow("disposed");
});

test("cleanup failures still release other labels, observers and the owned layer", () => {
  const env = fixture();
  env.add();
  const second = env.element();
  const label = env.layer.add({ object: env.target, element: second.html() });
  env.content.remove = () => {
    throw new Error("content removal failed");
  };
  expect(() => env.layer.dispose()).toThrow(AggregateError);
  expect(label.disposed).toBe(true);
  expect(second.parentNode).toBeNull();
  expect(env.container.children).toHaveLength(0);
  expect(env.callbacks.size).toBe(0);
  expect(env.disconnect).toHaveBeenCalledOnce();
  expect(() => env.layer.dispose()).not.toThrow();
});
