import { afterEach, expect, test, vi } from "vite-plus/test";
import { WebGLCoordinateSystem, WebGPUCoordinateSystem } from "three";
import { ThreeApp, OrthographicThreeApp } from "../src/index.ts";
import { initializeWebGPUHost } from "../src/core/webgpu-host.ts";
import type { WebGPUHostOptions as WebGPUAppOptions } from "../src/core/webgpu-host.ts";
type WebGPUThreeApp = ThreeApp<"webgpu">;
import { attachBloom } from "../src/postprocessing.ts";
import { attachRadar } from "../src/effects.ts";
import { attachRendererSettings } from "../src/rendering.ts";
import { captureFrame } from "../src/capture.ts";
import type { AnyThreeApp } from "../src/index.ts";
import { renderWithRetirement } from "../src/core/render-retirement.ts";

const mock = vi.hoisted(() => {
  class Renderer {
    readonly isWebGPURenderer = true;
    static instances: Renderer[] = [];
    static initialize: () => Promise<void> = () => Promise.resolve();
    domElement: HTMLCanvasElement;
    coordinateSystem = 2001;
    initialized = false;
    onDeviceLost = (_info: unknown): void => {};
    render = vi.fn();
    dispose = vi.fn(() => Promise.resolve());
    setDrawingBufferSize = vi.fn();
    lose = vi.fn();
    getContext = () => ({ getExtension: () => ({ loseContext: this.lose }) });
    constructor(readonly parameters: Record<string, unknown>) {
      this.domElement = parameters.canvas as HTMLCanvasElement;
      if (parameters.forceWebGL) this.coordinateSystem = 2000;
      Renderer.instances.push(this);
    }
    async init(): Promise<this> {
      await Renderer.initialize();
      this.initialized = true;
      return this;
    }
  }
  return { Renderer };
});
vi.mock("three/webgpu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("three/webgpu")>()),
  WebGPURenderer: mock.Renderer,
}));

function deferred() {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const hosts: Array<WebGPUThreeApp | OrthographicThreeApp<"webgpu">> = [];
afterEach(async () => {
  for (const host of hosts.splice(0)) await host.destroy().catch(() => {});
  mock.Renderer.instances.length = 0;
  mock.Renderer.initialize = () => Promise.resolve();
});
function fixture() {
  let next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const observer = { observe: vi.fn(), disconnect: vi.fn() };
  const view = Object.assign(new EventTarget(), {
    devicePixelRatio: 3,
    requestAnimationFrame(callback: FrameRequestCallback) {
      frames.set(++next, callback);
      return next;
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id);
    },
    ResizeObserver: class {
      observe = observer.observe;
      disconnect = observer.disconnect;
    },
    matchMedia: () => new EventTarget(),
  });
  const canvas = Object.assign(new EventTarget(), { style: { cssText: "" }, remove: vi.fn() });
  const document = Object.assign(new EventTarget(), {
    defaultView: view,
    hidden: false,
    createElement: vi.fn(() => canvas),
  });
  const container = {
    nodeType: 1,
    ownerDocument: document,
    clientWidth: 640,
    clientHeight: 360,
    appendChild: vi.fn(),
  };
  return {
    canvas,
    container,
    document,
    view,
    observer,
    frames,
    async create(options: WebGPUAppOptions = {}) {
      const host = await initializeWebGPUHost(
        container as unknown as HTMLElement,
        options,
        (prepared) =>
          Reflect.construct(ThreeApp, [
            container,
            prepared.options,
            prepared,
          ]) as ThreeApp<"webgpu">,
      );
      hosts.push(host);
      return host;
    },
    step(time: number) {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(time);
    },
  };
}

test("orthographic public creation preserves concrete class, coordinate system, frustum and zoom", async () => {
  const env = fixture();
  const app = await OrthographicThreeApp.create(env.container as unknown as HTMLElement, {
    renderer: { type: "webgpu", allowFallback: false },
    camera: { frustumHeight: 6, near: 0 },
  });
  hosts.push(app);
  expect(app).toBeInstanceOf(OrthographicThreeApp);
  expect(app).not.toBeInstanceOf(ThreeApp);
  expect(app.camera.isOrthographicCamera).toBe(true);
  expect(app.camera.coordinateSystem).toBe(WebGPUCoordinateSystem);
  expect(app.camera.top - app.camera.bottom).toBe(6);
  expect(app.camera.right - app.camera.left).toBeCloseTo((6 * 640) / 360);
  app.camera.zoom = 2;
  env.container.clientHeight = 640;
  app.resize();
  expect(app.camera.zoom).toBe(2);
  expect(app.camera.right - app.camera.left).toBe(6);
  app.start();
  env.step(0);
  expect(env.frames.size).toBe(1);
  mock.Renderer.instances[0]!.onDeviceLost({ reason: "unknown" });
  expect(app.state).toBe("disposed");
  expect(env.frames.size).toBe(0);
});

test("orthographic options are snapshotted and cancellation releases a late native renderer", async () => {
  const env = fixture(),
    gate = deferred(),
    controller = new AbortController();
  mock.Renderer.initialize = () => gate.promise;
  const options = {
    renderer: { type: "webgpu" as const },
    camera: { frustumHeight: 8, position: [0, 0, 12] as [number, number, number] },
    signal: controller.signal,
  };
  const pending = OrthographicThreeApp.create(env.container as unknown as HTMLElement, options);
  await vi.waitFor(() => expect(mock.Renderer.instances).toHaveLength(1));
  options.camera.frustumHeight = 20;
  options.camera.position[2] = 99;
  gate.resolve();
  const app = await pending;
  hosts.push(app);
  expect(app.camera.top - app.camera.bottom).toBe(8);
  expect(app.camera.position.z).toBe(12);
  const other = fixture(),
    nextGate = deferred();
  mock.Renderer.initialize = () => nextGate.promise;
  const abort = new AbortController();
  const late = OrthographicThreeApp.create(other.container as unknown as HTMLElement, {
    renderer: { type: "webgpu" },
    signal: abort.signal,
  });
  await vi.waitFor(() => expect(mock.Renderer.instances).toHaveLength(2));
  abort.abort();
  await expect(late).rejects.toMatchObject({ name: "AbortError" });
  nextGate.resolve();
  await vi.waitFor(() => expect(mock.Renderer.instances[1]!.dispose).toHaveBeenCalledOnce());
  expect(other.container.appendChild).not.toHaveBeenCalled();
});

test("orthographic strict fallback and invalid frustum fail without mounting", async () => {
  const env = fixture();
  await expect(
    OrthographicThreeApp.create(env.container as unknown as HTMLElement, {
      renderer: { type: "webgpu" },
      camera: { frustumHeight: -1 },
    }),
  ).rejects.toThrow(RangeError);
  expect(mock.Renderer.instances).toHaveLength(0);
  mock.Renderer.initialize = async () => {
    mock.Renderer.instances[0]!.coordinateSystem = WebGLCoordinateSystem;
  };
  await expect(
    OrthographicThreeApp.create(env.container as unknown as HTMLElement, {
      renderer: { type: "webgpu", allowFallback: false },
    }),
  ).rejects.toThrow("required");
  await vi.waitFor(() => expect(mock.Renderer.instances[0]!.dispose).toHaveBeenCalledOnce());
  expect(env.container.appendChild).not.toHaveBeenCalled();
});

test("initialization stays off-DOM and idle, then shares sizing, update and render lifecycle", async () => {
  const env = fixture(),
    gate = deferred();
  mock.Renderer.initialize = () => gate.promise;
  const pending = env.create();
  expect(env.container.appendChild).not.toHaveBeenCalled();
  expect(env.frames.size).toBe(0);
  gate.resolve();
  const app = await pending,
    renderer = mock.Renderer.instances[0]!;
  expect(app.state).toBe("ready");
  expect(app).toBeInstanceOf(ThreeApp);
  expect(app.rendererType).toBe("webgpu");
  expect(app.backend).toBe("webgpu");
  expect(app.camera.coordinateSystem).toBe(WebGPUCoordinateSystem);
  expect(renderer.setDrawingBufferSize).toHaveBeenCalledWith(640, 360, 2);
  expect(app.camera.aspect).toBeCloseTo(640 / 360);
  const update = vi.fn();
  app.onUpdate(update);
  app.render();
  expect(update).not.toHaveBeenCalled();
  app.start();
  app.start();
  expect(env.frames.size).toBe(1);
  env.step(0);
  env.step(16);
  expect(update).toHaveBeenLastCalledWith({ delta: 0.016, elapsed: 0.016 });
  app.stop();
  expect(env.frames.size).toBe(0);
  env.container.clientHeight = 0;
  app.resize();
  expect(app.render()).toBe(false);
  env.container.clientHeight = 400;
  app.resize();
  expect(app.camera.aspect).toBe(1.6);
});

test("abort rejects immediately and retires a late renderer exactly once without mounting", async () => {
  const env = fixture(),
    gate = deferred(),
    controller = new AbortController();
  mock.Renderer.initialize = () => gate.promise;
  const pending = env.create({ signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const renderer = mock.Renderer.instances[0]!;
  expect(renderer.dispose).not.toHaveBeenCalled();
  gate.resolve();
  await vi.waitFor(() => expect(renderer.dispose).toHaveBeenCalledOnce());
  expect(env.container.appendChild).not.toHaveBeenCalled();
  expect(env.frames.size).toBe(0);
});

test("abort during mounting rolls back the mounted host and observer", async () => {
  const env = fixture(),
    controller = new AbortController();
  env.container.appendChild.mockImplementation(() => controller.abort());
  await expect(env.create({ signal: controller.signal })).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.waitFor(() => expect(env.observer.disconnect).toHaveBeenCalledOnce());
  expect(mock.Renderer.instances[0]!.dispose).toHaveBeenCalledOnce();
});

test("invalid configuration and pre-aborted creation allocate no renderer or canvas", async () => {
  const env = fixture(),
    controller = new AbortController();
  controller.abort();
  for (const options of [
    { maxDelta: 0 },
    { maxPixelRatio: Infinity },
    { camera: { fov: 180 } },
    { renderer: { canvas: {} } },
    { renderer: { device: {} } },
    { renderer: { getFallback: () => {} } },
    { renderer: null },
    { backend: "invalid" },
    { signal: controller.signal },
  ])
    await expect(env.create(options as unknown as WebGPUAppOptions)).rejects.toBeDefined();
  expect(mock.Renderer.instances).toHaveLength(0);
  expect(env.document.createElement).not.toHaveBeenCalled();
});

test("creation snapshots camera, renderer and host options before awaiting init", async () => {
  const env = fixture(),
    gate = deferred();
  mock.Renderer.initialize = () => gate.promise;
  const options: WebGPUAppOptions = {
    renderer: { alpha: false },
    camera: { fov: 65 },
    maxPixelRatio: 1,
  };
  const pending = env.create(options);
  options.renderer!.alpha = true;
  options.camera!.fov = 80;
  options.maxPixelRatio = 9;
  gate.resolve();
  const app = await pending;
  expect(app.camera.fov).toBe(65);
  expect(app.size.pixelRatio).toBe(1);
  expect(mock.Renderer.instances[0]!.parameters.alpha).toBe(false);
});

test("forced fallback reports the actual backend and releases its owned context after async disposal", async () => {
  const env = fixture(),
    app = await env.create({ backend: "webgl2" });
  const renderer = mock.Renderer.instances[0]!,
    gate = deferred();
  renderer.dispose.mockReturnValue(gate.promise);
  expect(app.backend).toBe("webgl2");
  expect(app.camera.coordinateSystem).toBe(WebGLCoordinateSystem);
  app.start();
  app.dispose();
  expect(app.state).toBe("disposed");
  expect(app.signal.aborted).toBe(true);
  expect(env.frames.size).toBe(0);
  expect(renderer.lose).not.toHaveBeenCalled();
  const complete = vi.fn();
  const disposal = app.destroy().then(complete);
  await Promise.resolve();
  expect(complete).not.toHaveBeenCalled();
  gate.resolve();
  await disposal;
  await app.destroy();
  expect(renderer.dispose).toHaveBeenCalledOnce();
  expect(renderer.lose).toHaveBeenCalledOnce();
});

test("strict WebGPU refuses a native fallback result and cleans up without mounting", async () => {
  const env = fixture();
  mock.Renderer.initialize = async () => {
    mock.Renderer.instances[0]!.coordinateSystem = WebGLCoordinateSystem;
  };
  await expect(env.create({ backend: "webgpu" })).rejects.toThrow("required");
  await vi.waitFor(() => expect(mock.Renderer.instances[0]!.lose).toHaveBeenCalledOnce());
  expect(env.container.appendChild).not.toHaveBeenCalled();
});

test("device loss ends one host and its resources while another keeps running", async () => {
  const first = fixture(),
    second = fixture(),
    a = await first.create(),
    b = await second.create();
  const cleanup = vi.fn();
  a.resources.track({ dispose: cleanup });
  a.start();
  b.start();
  mock.Renderer.instances[0]!.onDeviceLost({ reason: "unknown" });
  expect(a.contextLost).toBe(true);
  expect(a.state).toBe("disposed");
  expect(cleanup).toHaveBeenCalledOnce();
  expect(first.frames.size).toBe(0);
  expect(second.frames.size).toBe(1);
  second.step(0);
  expect(mock.Renderer.instances[1]!.render).toHaveBeenCalledOnce();
});

test("native and resource disposal failures remain observable via disposeAsync", async () => {
  const env = fixture(),
    app = await env.create();
  app.resources.track({
    dispose() {
      throw new Error("resource cleanup");
    },
  });
  mock.Renderer.instances[0]!.dispose.mockRejectedValue(new Error("native cleanup"));
  expect(() => app.dispose()).toThrow(AggregateError);
  await expect(app.destroy()).rejects.toMatchObject({
    errors: [expect.any(AggregateError), expect.objectContaining({ message: "native cleanup" })],
  });
  expect(env.canvas.remove).toHaveBeenCalled();
  expect(env.observer.disconnect).toHaveBeenCalledOnce();
});

test("init failure preserves the original error and reports a native cleanup failure", async () => {
  const env = fixture(),
    report = vi.fn(),
    gate = deferred();
  mock.Renderer.initialize = () => gate.promise;
  const pending = env.create({ onCleanupError: report });
  const renderer = mock.Renderer.instances[0]!;
  renderer.dispose.mockRejectedValue(new Error("cleanup failure"));
  gate.reject(new Error("init failure"));
  await expect(pending).rejects.toThrow("init failure");
  await vi.waitFor(() =>
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: "cleanup failure" })),
  );
  expect(env.container.appendChild).not.toHaveBeenCalled();
});

test("platform mount failure cleans up one native renderer and all registered observers", async () => {
  const env = fixture();
  env.observer.observe.mockImplementation(() => {
    throw new Error("observe failed");
  });
  await expect(env.create()).rejects.toThrow("observe failed");
  await vi.waitFor(() => expect(mock.Renderer.instances[0]!.dispose).toHaveBeenCalledOnce());
  expect(env.observer.disconnect).toHaveBeenCalledOnce();
  expect(env.frames.size).toBe(0);
});

test("unified extensions reject ended GPU owners before native allocation", async () => {
  const env = fixture(),
    app = await env.create();
  await app.destroy();
  const unsafe = app as unknown as AnyThreeApp;
  expect(() => attachBloom(unsafe)).toThrow("disposed");
  expect(() => attachRadar(unsafe)).toThrow("disposed");
  expect(() => attachRendererSettings(unsafe)).toThrow("disposed");
  await expect(captureFrame(unsafe)).rejects.toMatchObject({ name: "AbortError" });
  expect(app.scene.children).toHaveLength(0);
});

test("destroy during native rendering ends the host immediately and waits for retired backend cleanup", async () => {
  const app = await fixture().create();
  const renderer = mock.Renderer.instances[0]!,
    gate = deferred();
  renderer.dispose.mockReturnValue(gate.promise);
  let completion!: Promise<void>;
  const completed = vi.fn();
  renderWithRetirement(app.renderer, () => {
    completion = app.destroy().then(completed);
    expect(app.state).toBe("disposed");
    expect(renderer.dispose).not.toHaveBeenCalled();
  });
  expect(renderer.dispose).toHaveBeenCalledOnce();
  await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();
  gate.resolve();
  await completion;
  expect(completed).toHaveBeenCalledOnce();
});

test("disposeAsync called from a resource hook still waits for native cleanup and reports hook failures", async () => {
  const app = await fixture().create(),
    gate = deferred();
  mock.Renderer.instances[0]!.dispose.mockReturnValue(gate.promise);
  let reentrant!: Promise<void>;
  const completed = vi.fn();
  app.resources.track({
    dispose() {
      reentrant = app.destroy();
      throw new Error("hook failed");
    },
  });
  expect(() => app.dispose()).toThrow(AggregateError);
  const observed = reentrant.then(completed, (error: unknown) => {
    completed();
    throw error;
  });
  await Promise.resolve();
  expect(completed).not.toHaveBeenCalled();
  gate.resolve();
  await expect(observed).rejects.toThrow("cleanup failed");
  expect(mock.Renderer.instances[0]!.dispose).toHaveBeenCalledOnce();
});
