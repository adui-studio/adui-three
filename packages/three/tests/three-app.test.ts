import { afterEach, expect, test, vi } from "vite-plus/test";
import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";
import { ThreeApp } from "../src/index.ts";
import { attachOrbitControls } from "../src/controls.ts";

vi.mock("three/addons/controls/OrbitControls.js", () => ({
  OrbitControls: class {
    update = vi.fn();
    dispose = vi.fn();
  },
}));

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement: HTMLCanvasElement;
      render = vi.fn();
      dispose = vi.fn();
      forceContextLoss = vi.fn();
      setDrawingBufferSize = vi.fn();
      constructor(options: { canvas: HTMLCanvasElement }) {
        this.domElement = options.canvas;
      }
    },
  };
});

const apps: ThreeApp[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) {
    try {
      app.dispose();
    } catch {
      /* Tests cover cleanup errors explicitly. */
    }
  }
});

function fixture(width = 640, height = 360) {
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const observer = { observe: vi.fn(), disconnect: vi.fn() };
  const media = new EventTarget();
  const view = Object.assign(new EventTarget(), {
    devicePixelRatio: 3,
    requestAnimationFrame(callback: FrameRequestCallback): number {
      frames.set(++nextId, callback);
      return nextId;
    },
    cancelAnimationFrame(id: number): void {
      frames.delete(id);
    },
    ResizeObserver: class {
      observe = observer.observe;
      disconnect = observer.disconnect;
    },
    matchMedia: vi.fn(() => media),
  });
  const canvas = { style: { cssText: "" }, remove: vi.fn() };
  const document = Object.assign(new EventTarget(), {
    defaultView: view,
    hidden: false,
    createElement: () => canvas,
  });
  const container = {
    nodeType: 1,
    ownerDocument: document,
    clientWidth: width,
    clientHeight: height,
    appendChild: vi.fn(),
  };
  const create = (): ThreeApp => {
    const app = new ThreeApp(container as unknown as HTMLElement);
    apps.push(app);
    return app;
  };
  return {
    create,
    frames,
    observer,
    canvas,
    container,
    view,
    document,
    media,
    step(time: number): void {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(time);
    },
  };
}

test("constructor is idle; resize caps DPR and skips unchanged drawing buffers", () => {
  const env = fixture();
  const app = env.create();
  expect(app.state).toBe("ready");
  expect(env.frames.size).toBe(0);
  expect(app.size).toEqual({ width: 640, height: 360, pixelRatio: 2 });
  expect(vi.spyOn(app.renderer, "setDrawingBufferSize")).toHaveBeenCalledExactlyOnceWith(
    640,
    360,
    2,
  );
  app.resize();
  app.start();
  env.step(0);
  env.step(16);
  expect(vi.spyOn(app.renderer, "setDrawingBufferSize")).toHaveBeenCalledTimes(1);
  expect(vi.spyOn(app.renderer, "render")).toHaveBeenCalledTimes(2);
});

test("after-render observers see all updates and run after the renderer", () => {
  const env = fixture();
  const app = env.create();
  const calls: string[] = [];
  app.onAfterRender(() => calls.push("after"));
  app.onUpdate(() => calls.push("update"));
  vi.spyOn(app.renderer, "render").mockImplementation(() => {
    calls.push("render");
  });
  app.start();
  env.step(0);
  expect(calls).toEqual(["update", "render", "after"]);
});

test("after-render subscriptions support duplicate callbacks, removal and deferred additions", () => {
  const env = fixture();
  const app = env.create();
  const callback = vi.fn();
  let off = (): void => {};
  app.onAfterRender(() => {
    off();
    app.onAfterRender(callback);
  });
  off = app.onAfterRender(callback);
  const off2 = app.onAfterRender(callback);
  app.start();
  env.step(0);
  expect(callback).toHaveBeenCalledTimes(1);
  off2();
  off2();
  env.step(16);
  expect(callback).toHaveBeenCalledTimes(2);
});

test("after-render restart invalidates remaining callbacks and preserves one frame", () => {
  const env = fixture();
  const app = env.create();
  const later = vi.fn();
  app.onAfterRender(() => {
    app.stop();
    app.start();
  });
  app.onAfterRender(later);
  app.start();
  env.step(0);
  expect(later).not.toHaveBeenCalled();
  expect(env.frames.size).toBe(1);
});

test("render and after-render errors stop scheduling and do not call later observers", () => {
  for (const phase of ["render", "after"] as const) {
    const env = fixture();
    const app = env.create();
    const error = new Error(phase);
    const later = vi.fn();
    if (phase === "render")
      vi.spyOn(app.renderer, "render").mockImplementation(() => {
        throw error;
      });
    else
      app.onAfterRender(() => {
        throw error;
      });
    app.onAfterRender(later);
    app.start();
    expect(() => env.step(0)).toThrow(error);
    expect(app.state).toBe("stopped");
    expect(env.frames.size).toBe(0);
    expect(later).not.toHaveBeenCalled();
  }
});

test("dispose during render or its observers cancels the remaining phase", () => {
  for (const phase of ["render", "after"] as const) {
    const env = fixture();
    const app = env.create();
    const later = vi.fn();
    if (phase === "render")
      vi.spyOn(app.renderer, "render").mockImplementation(() => app.dispose());
    else app.onAfterRender(() => app.dispose());
    app.onAfterRender(later);
    app.start();
    env.step(0);
    expect(later).not.toHaveBeenCalled();
    expect(env.frames.size).toBe(0);
    expect(() => app.onAfterRender(later)).toThrow("disposed");
  }
});

test("two instances start and stop independently", () => {
  const a = fixture();
  const b = fixture();
  const first = a.create();
  const second = b.create();
  first.start();
  first.start();
  second.start();
  expect(a.frames.size).toBe(1);
  first.stop();
  a.step(100);
  b.step(100);
  expect(vi.spyOn(first.renderer, "render")).not.toHaveBeenCalled();
  expect(vi.spyOn(second.renderer, "render")).toHaveBeenCalledOnce();
});

test("zero size suspends RAF without changing projection; resize resumes at delta zero", () => {
  const env = fixture(0, 0);
  const app = env.create();
  const update = vi.fn();
  app.onUpdate(update);
  app.start();
  expect(env.frames.size).toBe(0);
  expect(app.camera.aspect).toBe(1);
  env.container.clientWidth = 400;
  env.container.clientHeight = 200;
  app.resize();
  env.step(10);
  expect(app.camera.aspect).toBe(2);
  env.container.clientHeight = 0;
  app.resize();
  expect(env.frames.size).toBe(0);
  expect(app.camera.aspect).toBe(2);
  env.container.clientHeight = 200;
  app.resize();
  env.step(10000);
  expect(update).toHaveBeenLastCalledWith({ delta: 0, elapsed: 0 });
});

test("visibility pauses scheduling and DPR changes update the buffer", () => {
  const env = fixture();
  const app = env.create();
  app.start();
  env.step(0);
  env.document.hidden = true;
  env.document.dispatchEvent(new Event("visibilitychange"));
  expect(env.frames.size).toBe(0);
  env.document.hidden = false;
  env.document.dispatchEvent(new Event("visibilitychange"));
  expect(env.frames.size).toBe(1);
  env.view.devicePixelRatio = 1.25;
  env.media.dispatchEvent(new Event("change"));
  expect(app.size.pixelRatio).toBe(1.25);
  expect(vi.spyOn(app.renderer, "setDrawingBufferSize")).toHaveBeenLastCalledWith(640, 360, 1.25);
});

test("dispose during update prevents rendering and clears listeners and owned resources", () => {
  const env = fixture();
  const app = env.create();
  const release = vi.fn();
  app.resources.track({ dispose: release });
  const signal = app.signal;
  app.onUpdate(() => app.dispose());
  app.start();
  env.step(0);
  app.dispose();
  expect(app.state).toBe("disposed");
  expect(signal.aborted).toBe(true);
  expect(env.frames.size).toBe(0);
  expect(vi.spyOn(app.renderer, "render")).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledOnce();
  expect(env.observer.disconnect).toHaveBeenCalledOnce();
  expect(env.canvas.remove).toHaveBeenCalledOnce();
  expect(vi.spyOn(app.renderer, "forceContextLoss")).toHaveBeenCalledOnce();
  env.view.dispatchEvent(new Event("resize"));
  env.media.dispatchEvent(new Event("change"));
  expect(() => app.start()).toThrow("disposed");
  expect(() => app.resize()).toThrow("disposed");
  expect(() => app.onUpdate(() => {})).toThrow("disposed");
});

test("stop/restart inside update skips the old render and leaves one pending frame", () => {
  const env = fixture();
  const app = env.create();
  app.onUpdate(() => {
    app.stop();
    app.start();
  });
  app.start();
  env.step(0);
  expect(vi.spyOn(app.renderer, "render")).not.toHaveBeenCalled();
  expect(env.frames.size).toBe(1);
});

test("subscriptions are independent and removals take effect during a frame", () => {
  const env = fixture();
  const app = env.create();
  const callback = vi.fn();
  const off = app.onUpdate(callback);
  app.onUpdate(callback);
  off();
  app.start();
  env.step(0);
  expect(callback).toHaveBeenCalledOnce();
  app.onUpdate(() => offLater());
  const later = vi.fn();
  const offLater = app.onUpdate(later);
  env.step(16);
  expect(later).not.toHaveBeenCalled();
});

test("callback errors stop the app; resource errors do not prevent renderer cleanup", () => {
  const env = fixture();
  const app = env.create();
  const off = app.onUpdate(() => {
    throw new Error("frame failed");
  });
  app.start();
  expect(() => env.step(0)).toThrow("frame failed");
  expect(app.state).toBe("stopped");
  off();
  app.start();
  env.step(1000);
  expect(vi.spyOn(app.renderer, "render")).toHaveBeenCalledOnce();
  app.resources.track({
    dispose(): void {
      throw new Error("release failed");
    },
  });
  expect(() => app.dispose()).toThrow(AggregateError);
  expect(vi.spyOn(app.renderer, "dispose")).toHaveBeenCalledOnce();
  expect(env.canvas.remove).toHaveBeenCalledOnce();
});

test("borrowed and shared scene resources are detached without being disposed", () => {
  const env = fixture();
  const app = env.create();
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial();
  const disposeGeometry = vi.spyOn(geometry, "dispose");
  const disposeMaterial = vi.spyOn(material, "dispose");
  app.scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
  app.dispose();
  expect(app.scene.children).toHaveLength(0);
  expect(disposeGeometry).not.toHaveBeenCalled();
  expect(disposeMaterial).not.toHaveBeenCalled();
  geometry.dispose();
  material.dispose();
});

test("initialization failure rolls back already-created DOM and GPU resources", () => {
  const env = fixture();
  env.observer.observe.mockImplementationOnce(() => {
    throw new Error("observe failed");
  });
  expect(() => env.create()).toThrow("observe failed");
  expect(env.canvas.remove).toHaveBeenCalledOnce();
  expect(env.observer.disconnect).toHaveBeenCalledOnce();
});

test("invalid options fail before allocating a renderer", () => {
  const env = fixture();
  for (const options of [
    { maxPixelRatio: 0 },
    { maxDelta: NaN },
    { camera: { fov: 180 } },
    { camera: { near: 10, far: 1 } },
  ]) {
    expect(() => new ThreeApp(env.container as unknown as HTMLElement, options)).toThrow(
      RangeError,
    );
  }
  expect(env.container.appendChild).not.toHaveBeenCalled();
});

test("optional controls share the host loop and detach exactly once", () => {
  const env = fixture();
  const app = env.create();
  const handle = attachOrbitControls(app);
  expect(env.frames.size).toBe(0);
  app.start();
  env.step(0);
  env.step(16);
  expect(vi.spyOn(handle.controls, "update")).toHaveBeenLastCalledWith(0.016);
  expect(env.frames.size).toBe(1);
  handle.dispose();
  handle.dispose();
  env.step(32);
  expect(vi.spyOn(handle.controls, "update")).toHaveBeenCalledTimes(2);
  app.dispose();
  expect(vi.spyOn(handle.controls, "dispose")).toHaveBeenCalledOnce();
  expect(() => attachOrbitControls(app)).toThrow("disposed");
});

test("optional controls are released automatically by app disposal", () => {
  const env = fixture();
  const app = env.create();
  const { controls } = attachOrbitControls(app);
  app.dispose();
  expect(vi.spyOn(controls, "dispose")).toHaveBeenCalledOnce();
});
