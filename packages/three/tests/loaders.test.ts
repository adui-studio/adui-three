import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  Bone,
  BoxGeometry,
  Cache,
  Group,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Skeleton,
  SkinnedMesh,
  Texture,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { ThreeApp, ThreeAppState } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";
import { loadGLTF } from "../src/loaders.ts";
import type { LoadGLTFOptions } from "../src/loaders.ts";

afterEach(() => {
  vi.restoreAllMocks();
  Cache.enabled = false;
});

function host() {
  const controller = new AbortController();
  const state = {
    scene: new Scene(),
    resources: new ResourceScope(),
    renderer: {} as ThreeApp["renderer"],
    signal: controller.signal,
    state: "ready" as ThreeAppState,
  };
  return {
    state,
    app: state as unknown as ThreeApp,
    dispose(): void {
      state.state = "disposed";
      controller.abort();
      state.resources.dispose();
      state.scene.clear();
    },
  };
}

function asset() {
  const image = { close: vi.fn() };
  const texture = new Texture(image as unknown as HTMLImageElement);
  const geometry = new BoxGeometry();
  const material = new MeshStandardMaterial({ map: texture, normalMap: texture, roughness: 0.7 });
  const scene = new Group();
  scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
  const gltf: GLTF = {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: { version: "2.0" },
    userData: {},
    parser: {} as GLTF["parser"],
  };
  return {
    gltf,
    scene,
    geometry,
    material,
    texture,
    image,
    geometryDisposal: vi.spyOn(geometry, "dispose"),
    materialDisposal: vi.spyOn(material, "dispose"),
    textureDisposal: vi.spyOn(texture, "dispose"),
  };
}

function transport() {
  const requests: Array<{
    url: string;
    manager: LoadingManager;
    resolve: (gltf: GLTF) => void;
    reject: (error: unknown) => void;
    progress?: (event: ProgressEvent) => void;
  }> = [];
  const load = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(function (
    this: GLTFLoader,
    url,
    progress,
  ) {
    return new Promise<GLTF>((resolve, reject) => {
      requests.push({ url, manager: this.manager, resolve, reject, progress });
    });
  });
  return { requests, load };
}

test("KTX2 snapshots URLs, detects the owning renderer and leaves unused transcoders uninitialized", async () => {
  const env = host();
  const io = transport();
  const path = { js: "/basis/wrapper.js", wasm: "/basis/transcoder.wasm" };
  const support = vi.spyOn(KTX2Loader.prototype, "detectSupport").mockReturnThis();
  const limit = vi.spyOn(KTX2Loader.prototype, "setWorkerLimit");
  const dispose = vi.spyOn(KTX2Loader.prototype, "dispose");
  const setup = vi.spyOn(GLTFLoader.prototype, "setKTX2Loader");
  const promise = loadGLTF(env.app, "plain.glb", { ktx2: { transcoderPath: path } });
  path.js = "/changed.js";
  const loader = setup.mock.calls[0]![0]!;
  expect(support).toHaveBeenCalledExactlyOnceWith(env.app.renderer);
  expect(limit).toHaveBeenCalledExactlyOnceWith(1);
  expect(loader.manager.resolveURL(`${loader.transcoderPath}basis_transcoder.js`)).toBe(
    "/basis/wrapper.js",
  );
  expect(loader.manager.resolveURL(`${loader.transcoderPath}basis_transcoder.wasm`)).toBe(
    "/basis/transcoder.wasm",
  );
  expect(loader.manager.resolveURL("model/texture.ktx2")).toBe("model/texture.ktx2");
  io.requests[0]!.resolve(asset().gltf);
  (await promise).dispose();
  env.dispose();
  expect(dispose).not.toHaveBeenCalled();
});

test("KTX2 rejects bad options before requests and rolls back detection or synchronous cancellation", async () => {
  const env = host();
  const io = transport();
  for (const ktx2 of [
    { transcoderPath: "" },
    { transcoderPath: "/basis" },
    { transcoderPath: { js: "", wasm: "/x.wasm" } },
    ...[0, -1, 1.5, 33, Infinity, NaN].map((workerLimit) => ({
      transcoderPath: "/basis/",
      workerLimit,
    })),
  ])
    await expect(loadGLTF(env.app, "model.glb", { ktx2 })).rejects.toBeInstanceOf(TypeError);
  const failure = new Error("capability detection failed");
  const detect = vi.spyOn(KTX2Loader.prototype, "detectSupport").mockImplementation(() => {
    throw failure;
  });
  await expect(
    loadGLTF(env.app, "model.glb", { ktx2: { transcoderPath: "/basis/" } }),
  ).rejects.toBe(failure);
  const controller = new AbortController();
  detect.mockImplementation(function (this: KTX2Loader) {
    controller.abort();
    return this;
  });
  await expect(
    loadGLTF(env.app, "model.glb", {
      signal: controller.signal,
      ktx2: { transcoderPath: "/basis/" },
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(io.load).not.toHaveBeenCalled();
  env.dispose();
});

test("KTX2 texture errors reject and clean a native GLTF result that swallowed the error", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  vi.spyOn(KTX2Loader.prototype, "detectSupport").mockReturnThis();
  const setup = vi.spyOn(GLTFLoader.prototype, "setKTX2Loader");
  const failure = new Error("transcode failed");
  vi.spyOn(KTX2Loader.prototype, "parse").mockImplementation((_buffer, _load, error) =>
    error?.(failure),
  );
  const promise = loadGLTF(env.app, "model.glb", { ktx2: { transcoderPath: "/basis/" } });
  setup.mock.calls[0]![0]!.parse(new ArrayBuffer(4), vi.fn(), vi.fn());
  io.requests[0]!.resolve(data.gltf);
  await expect(promise).rejects.toBe(failure);
  expect(data.textureDisposal).toHaveBeenCalledOnce();
  expect(env.state.scene.children).toHaveLength(0);
  env.dispose();
});

test("KTX2 initialization survives logical cancellation until late success or failure consumes it", async () => {
  for (const mode of ["signal", "host", "late-error", "late-texture-error"] as const) {
    const env = host();
    const io = transport();
    const data = asset();
    const controller = new AbortController();
    const report = vi.fn();
    const setup = vi.spyOn(GLTFLoader.prototype, "setKTX2Loader");
    vi.spyOn(KTX2Loader.prototype, "detectSupport").mockReturnThis();
    const dispose = vi.spyOn(KTX2Loader.prototype, "dispose").mockImplementation(() => {});
    const promise = loadGLTF(env.app, "model.glb", {
      signal: controller.signal,
      ktx2: { transcoderPath: "/basis/" },
      onCleanupError: report,
    });
    setup.mock.calls[0]![0]!.transcoderPending = Promise.resolve();
    if (mode === "host") env.dispose();
    else controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).not.toHaveBeenCalled();
    if (mode === "late-error") io.requests[0]!.reject(new Error("late parsing error"));
    else {
      if (mode === "late-texture-error") {
        vi.spyOn(KTX2Loader.prototype, "parse").mockImplementation((_buffer, _load, error) =>
          error?.(new Error("late texture error")),
        );
        setup.mock.calls[0]![0]!.parse(new ArrayBuffer(4), vi.fn(), vi.fn());
      }
      io.requests[0]!.resolve(data.gltf);
    }
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    expect(report).not.toHaveBeenCalled();
    if (mode !== "late-error") expect(data.textureDisposal).toHaveBeenCalledOnce();
    env.dispose();
    vi.restoreAllMocks();
  }
});

test("combined Draco and KTX2 cleanup failures are reported without revoking a delivered model", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const report = vi.fn();
  vi.spyOn(KTX2Loader.prototype, "detectSupport").mockReturnThis();
  const setup = vi.spyOn(GLTFLoader.prototype, "setKTX2Loader");
  const ktxError = new Error("transcoder cleanup");
  const dracoError = new Error("decoder cleanup");
  const ktxDispose = vi.spyOn(KTX2Loader.prototype, "dispose").mockImplementation(() => {
    throw ktxError;
  });
  const dracoDispose = vi.spyOn(DRACOLoader.prototype, "dispose").mockImplementation(() => {
    throw dracoError;
  });
  const promise = loadGLTF(env.app, "combined.glb", {
    ktx2: { transcoderPath: "/basis/", workerLimit: 2 },
    draco: { decoderPath: "/draco/" },
    onCleanupError: report,
  });
  setup.mock.calls[0]![0]!.transcoderPending = Promise.resolve();
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  expect(model.disposed).toBe(false);
  expect(report.mock.calls).toEqual([[ktxError], [dracoError]]);
  expect(ktxDispose).toHaveBeenCalledOnce();
  expect(dracoDispose).toHaveBeenCalledOnce();
  expect(data.textureDisposal).not.toHaveBeenCalled();
  model.dispose();
  expect(data.textureDisposal).toHaveBeenCalledOnce();
  env.dispose();
});

test("Draco uses explicit snapshotted URLs and a task-owned worker limit", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const path = { js: "/draco/wrapper.js", wasm: "/draco/decoder.wasm" };
  const configure = vi.spyOn(DRACOLoader.prototype, "setDecoderPath");
  const limit = vi.spyOn(DRACOLoader.prototype, "setWorkerLimit");
  const dispose = vi.spyOn(DRACOLoader.prototype, "dispose");
  const promise = loadGLTF(env.app, "draco.glb", { draco: { decoderPath: path } });
  path.js = "/changed.js";
  expect(configure).toHaveBeenCalledWith({ js: "/draco/wrapper.js", wasm: "/draco/decoder.wasm" });
  expect(limit).toHaveBeenCalledExactlyOnceWith(1);
  expect(dispose).not.toHaveBeenCalled();
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  expect(dispose).toHaveBeenCalledOnce();
  model.dispose();
  env.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});

test("logical cancellation and host teardown do not terminate a decoder before native completion", async () => {
  for (const mode of ["signal", "host"] as const) {
    const env = host();
    const io = transport();
    const data = asset();
    const signal = new AbortController();
    const dispose = vi.spyOn(DRACOLoader.prototype, "dispose");
    const promise = loadGLTF(env.app, "draco.glb", {
      signal: signal.signal,
      draco: { decoderPath: "/draco/", workerLimit: 2 },
    });
    if (mode === "signal") signal.abort();
    else env.dispose();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(dispose).not.toHaveBeenCalled();
    io.requests[0]!.resolve(data.gltf);
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    expect(data.image.close).toHaveBeenCalledOnce();
    expect(env.state.scene.children).toHaveLength(0);
    env.dispose();
    vi.restoreAllMocks();
  }
});

test("decoder cleanup also follows late failure without changing the cancellation result", async () => {
  const env = host();
  const io = transport();
  const signal = new AbortController();
  const dispose = vi.spyOn(DRACOLoader.prototype, "dispose");
  const promise = loadGLTF(env.app, "draco.glb", {
    signal: signal.signal,
    draco: { decoderPath: "/draco/" },
  });
  signal.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  io.requests[0]!.reject(new Error("decode failed late"));
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
  env.dispose();
});

test("ordinary loads do not allocate Draco and injected Meshopt stays borrowed", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const configureDraco = vi.spyOn(GLTFLoader.prototype, "setDRACOLoader");
  const configureMeshopt = vi.spyOn(GLTFLoader.prototype, "setMeshoptDecoder");
  const ownedDispose = vi.spyOn(DRACOLoader.prototype, "dispose");
  const borrowedDispose = vi.fn();
  const decoder = {
    supported: true,
    ready: Promise.resolve(),
    dispose: borrowedDispose,
  } as unknown as NonNullable<LoadGLTFOptions["meshoptDecoder"]>;
  const promise = loadGLTF(env.app, "meshopt.glb", { meshoptDecoder: decoder });
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  expect(configureMeshopt).toHaveBeenCalledExactlyOnceWith(decoder);
  expect(configureDraco).not.toHaveBeenCalled();
  expect(ownedDispose).not.toHaveBeenCalled();
  model.dispose();
  env.dispose();
  expect(borrowedDispose).not.toHaveBeenCalled();
});

test("invalid Draco configuration and pre-aborted tasks allocate no native work", async () => {
  const env = host();
  const io = transport();
  const configure = vi.spyOn(DRACOLoader.prototype, "setDecoderPath");
  for (const draco of [
    { decoderPath: "" },
    { decoderPath: "/no-trailing-slash" },
    { decoderPath: { js: "", wasm: "/decoder.wasm" } },
    ...[0, -1, 1.5, Infinity].map((workerLimit) => ({ decoderPath: "/draco/", workerLimit })),
  ])
    await expect(loadGLTF(env.app, "model.glb", { draco })).rejects.toThrow(TypeError);
  const signal = new AbortController();
  signal.abort();
  await expect(
    loadGLTF(env.app, "model.glb", { signal: signal.signal, draco: { decoderPath: "/draco/" } }),
  ).rejects.toMatchObject({ name: "AbortError" });
  const duringSnapshot = new AbortController();
  await expect(
    loadGLTF(env.app, "model.glb", {
      signal: duringSnapshot.signal,
      draco: {
        get decoderPath(): string {
          duringSnapshot.abort();
          return "/draco/";
        },
      },
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(io.load).not.toHaveBeenCalled();
  expect(configure).not.toHaveBeenCalled();
  env.dispose();
});

test("a decoder setup error rolls back task registration and the allocated decoder", async () => {
  const env = host();
  const io = transport();
  const failure = new Error("setup failed");
  vi.spyOn(GLTFLoader.prototype, "setDRACOLoader").mockImplementation(() => {
    throw failure;
  });
  const dispose = vi.spyOn(DRACOLoader.prototype, "dispose");
  await expect(loadGLTF(env.app, "draco.glb", { draco: { decoderPath: "/draco/" } })).rejects.toBe(
    failure,
  );
  expect(dispose).toHaveBeenCalledOnce();
  expect(io.load).not.toHaveBeenCalled();
  env.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  const cancelled = host();
  const signal = new AbortController();
  vi.spyOn(GLTFLoader.prototype, "setDRACOLoader").mockImplementation(function (this: GLTFLoader) {
    signal.abort();
    return this;
  });
  await expect(
    loadGLTF(cancelled.app, "draco.glb", {
      signal: signal.signal,
      draco: { decoderPath: "/draco/" },
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(io.load).not.toHaveBeenCalled();
  cancelled.dispose();
  expect(dispose).toHaveBeenCalledTimes(2);
});

test("owned decoder cleanup errors are reported without losing the resolved model", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const cleanupError = new Error("dispose failed");
  vi.spyOn(DRACOLoader.prototype, "dispose").mockImplementation(() => {
    throw cleanupError;
  });
  const report = vi.fn();
  const promise = loadGLTF(env.app, "draco.glb", {
    draco: { decoderPath: "/draco/" },
    onCleanupError: report,
  });
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  expect(report).toHaveBeenCalledExactlyOnceWith(cleanupError);
  expect(model.disposed).toBe(false);
  model.dispose();
  expect(data.image.close).toHaveBeenCalledOnce();
  env.dispose();
});

test("two Draco tasks have independent decoders and cancellation cannot terminate the other", async () => {
  const env = host();
  const io = transport();
  const a = asset();
  const b = asset();
  const signal = new AbortController();
  const attach = vi.spyOn(GLTFLoader.prototype, "setDRACOLoader");
  const dispose = vi.spyOn(DRACOLoader.prototype, "dispose");
  const first = loadGLTF(env.app, "same.glb", {
    signal: signal.signal,
    draco: { decoderPath: "/draco/" },
  });
  const second = loadGLTF(env.app, "same.glb", { draco: { decoderPath: "/draco/" } });
  expect(attach.mock.calls[0]![0]).not.toBe(attach.mock.calls[1]![0]);
  signal.abort();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  expect(dispose).not.toHaveBeenCalled();
  io.requests[1]!.resolve(b.gltf);
  const model = await second;
  expect(dispose.mock.contexts).toEqual([attach.mock.calls[1]![0]]);
  io.requests[0]!.resolve(a.gltf);
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledTimes(2);
  expect(a.image.close).toHaveBeenCalledOnce();
  model.dispose();
  env.dispose();
});

test("loaded model keeps native materials and owns decoded resources exactly once", async () => {
  const env = host();
  const data = asset();
  const io = transport();
  const promise = loadGLTF(env.app, "/model.glb?version=2");
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  expect(model.gltf).toBe(data.gltf);
  expect(model.scene.parent).toBe(env.state.scene);
  expect(data.material.roughness).toBe(0.7);
  expect(data.material.map).toBe(data.texture);
  model.dispose();
  model.dispose();
  env.dispose();
  expect(model.disposed).toBe(true);
  expect(data.scene.parent).toBeNull();
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
  expect(data.materialDisposal).toHaveBeenCalledOnce();
  expect(data.textureDisposal).toHaveBeenCalledOnce();
  expect(data.image.close).toHaveBeenCalledOnce();
});

test("detached models remain owned and are released by the host", async () => {
  const env = host();
  const data = asset();
  const io = transport();
  const promise = loadGLTF(env.app, "data:model", { addToScene: false });
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  expect(model.scene.parent).toBeNull();
  env.dispose();
  expect(model.disposed).toBe(true);
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
});

test("model extension cleanup runs before assets and failures still release decoded resources", async () => {
  const env = host();
  const data = asset();
  const io = transport();
  const pending = loadGLTF(env.app, "extensions.glb");
  io.requests[0]!.resolve(data.gltf);
  const model = await pending;
  const extension = {
    dispose: vi.fn(() => {
      expect(data.geometryDisposal).not.toHaveBeenCalled();
      expect(model.disposed).toBe(true);
      throw new Error("extension failed");
    }),
  };
  model.resources.track(extension);
  expect(() => model.dispose()).toThrow(AggregateError);
  expect(model.resources.disposed).toBe(true);
  expect(extension.dispose).toHaveBeenCalledOnce();
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
  expect(data.image.close).toHaveBeenCalledOnce();
  expect(() => model.dispose()).not.toThrow();
  env.dispose();
});

test("pre-aborted and disposed hosts never start a request", async () => {
  const env = host();
  const io = transport();
  const controller = new AbortController();
  controller.abort();
  await expect(loadGLTF(env.app, "model.glb", { signal: controller.signal })).rejects.toMatchObject(
    { name: "AbortError" },
  );
  env.dispose();
  await expect(loadGLTF(env.app, "model.glb")).rejects.toMatchObject({ name: "AbortError" });
  expect(io.load).not.toHaveBeenCalled();
});

test("abort rejects immediately and disposes the late decoded model without attaching", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const controller = new AbortController();
  const promise = loadGLTF(env.app, "model.glb", { signal: controller.signal });
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  io.requests[0]!.resolve(data.gltf);
  await Promise.resolve();
  expect(env.state.scene.children).toHaveLength(0);
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
  expect(data.image.close).toHaveBeenCalledOnce();
  env.dispose();
});

test("host disposal and standalone scope disposal cancel pending work", async () => {
  for (const mode of ["app", "scope"]) {
    const env = host();
    const io = transport();
    const data = asset();
    const promise = loadGLTF(env.app, "model.glb");
    if (mode === "app") env.dispose();
    else env.state.resources.dispose();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    io.requests[0]!.resolve(data.gltf);
    await Promise.resolve();
    expect(data.geometryDisposal).toHaveBeenCalledOnce();
    expect(env.state.scene.children).toHaveLength(0);
    env.dispose();
    vi.restoreAllMocks();
  }
});

test("one task cancellation does not abort its manager or another task with the same URL", async () => {
  const env = host();
  const io = transport();
  const first = asset();
  const second = asset();
  const controller = new AbortController();
  const cancelled = loadGLTF(env.app, "same.glb", { signal: controller.signal });
  const surviving = loadGLTF(env.app, "same.glb");
  const abort = vi.spyOn(io.requests[0]!.manager, "abort");
  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  io.requests[0]!.resolve(first.gltf);
  io.requests[1]!.resolve(second.gltf);
  const model = await surviving;
  expect(first.geometryDisposal).toHaveBeenCalledOnce();
  expect(model.scene.parent).toBe(env.state.scene);
  expect(abort).not.toHaveBeenCalled();
  env.dispose();
});

test("late loader errors after cancellation are consumed", async () => {
  const env = host();
  const io = transport();
  const controller = new AbortController();
  const promise = loadGLTF(env.app, "model.glb", { signal: controller.signal });
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  io.requests[0]!.reject(new Error("late network failure"));
  await Promise.resolve();
  env.dispose();
});

test("ordinary loader errors reject with the original cause and remove lifecycle subscriptions", async () => {
  const env = host();
  const io = transport();
  const remove = vi.spyOn(env.state.signal, "removeEventListener");
  const promise = loadGLTF(env.app, "bad.gltf");
  const error = new Error("invalid glTF");
  io.requests[0]!.reject(error);
  await expect(promise).rejects.toBe(error);
  expect(remove).toHaveBeenCalledOnce();
  env.dispose();
});

test("unknown byte totals stay unknown and progress stops after cancel", async () => {
  const env = host();
  const io = transport();
  const progress = vi.fn();
  const controller = new AbortController();
  const promise = loadGLTF(env.app, "model.glb", {
    signal: controller.signal,
    onProgress: progress,
  });
  io.requests[0]!.progress!({ loaded: 50, total: 0, lengthComputable: false } as ProgressEvent);
  expect(progress).toHaveBeenLastCalledWith({ loaded: 50, total: null, ratio: null });
  io.requests[0]!.progress!({ loaded: 50, total: 100, lengthComputable: true } as ProgressEvent);
  expect(progress).toHaveBeenLastCalledWith({ loaded: 50, total: 100, ratio: 0.5 });
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  io.requests[0]!.progress!({ loaded: 100, total: 100 } as ProgressEvent);
  expect(progress).toHaveBeenCalledTimes(2);
  io.requests[0]!.reject(new Error("late"));
  env.dispose();
});

test("a throwing progress callback fails only its own task and still releases a late result", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const error = new Error("progress failed");
  const promise = loadGLTF(env.app, "model.glb", {
    onProgress(): void {
      throw error;
    },
  });
  expect(() => io.requests[0]!.progress!({ loaded: 1, total: 2 } as ProgressEvent)).not.toThrow();
  await expect(promise).rejects.toBe(error);
  io.requests[0]!.resolve(data.gltf);
  await Promise.resolve();
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
  env.dispose();
});

test("all glTF scenes and shared skeletons are included in the ownership snapshot", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const extra = new Group();
  const skeleton = new Skeleton([new Bone()]);
  const releaseSkeleton = vi.spyOn(skeleton, "dispose");
  const a = new SkinnedMesh(data.geometry, data.material);
  const b = new SkinnedMesh(data.geometry, data.material);
  a.skeleton = skeleton;
  b.skeleton = skeleton;
  extra.add(a, b);
  data.gltf.scenes.push(extra);
  const promise = loadGLTF(env.app, "model.gltf");
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  model.dispose();
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
  expect(releaseSkeleton).toHaveBeenCalledOnce();
  env.dispose();
});

test("later borrowed objects and replacement materials are not accidentally taken into ownership", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const promise = loadGLTF(env.app, "model.glb");
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  const borrowedGeometry = new BoxGeometry();
  const borrowedMaterial = new MeshStandardMaterial();
  const borrowed = new Mesh(borrowedGeometry, borrowedMaterial);
  const geometrySpy = vi.spyOn(borrowedGeometry, "dispose");
  const materialSpy = vi.spyOn(borrowedMaterial, "dispose");
  model.scene.add(borrowed);
  (model.scene.children[0] as Mesh).material = borrowedMaterial;
  model.dispose();
  expect(geometrySpy).not.toHaveBeenCalled();
  expect(materialSpy).not.toHaveBeenCalled();
  expect(data.materialDisposal).toHaveBeenCalledOnce();
  borrowedGeometry.dispose();
  borrowedMaterial.dispose();
  env.dispose();
});

test("cached or explicitly borrowed image backing data is preserved", async () => {
  for (const mode of ["cache", "borrowed"]) {
    const env = host();
    const io = transport();
    const data = asset();
    Cache.enabled = mode === "cache";
    const promise = loadGLTF(env.app, "model.glb", { closeImageBitmaps: mode !== "borrowed" });
    io.requests[0]!.resolve(data.gltf);
    (await promise).dispose();
    expect(data.image.close).not.toHaveBeenCalled();
    expect(data.textureDisposal).toHaveBeenCalledOnce();
    env.dispose();
    Cache.enabled = false;
    vi.restoreAllMocks();
  }
});

test("synchronous scene-added disposal cannot resolve with a dead model", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  env.state.scene.addEventListener("childadded", () => env.dispose());
  const promise = loadGLTF(env.app, "model.glb");
  io.requests[0]!.resolve(data.gltf);
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  expect(data.scene.parent).toBeNull();
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
});

test("cleanup failure still releases other resources and a late failure is reported", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const onCleanupError = vi.fn();
  data.geometryDisposal.mockImplementation(() => {
    throw new Error("geometry release failed");
  });
  const controller = new AbortController();
  const promise = loadGLTF(env.app, "model.glb", { signal: controller.signal, onCleanupError });
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  io.requests[0]!.resolve(data.gltf);
  await Promise.resolve();
  expect(onCleanupError).toHaveBeenCalledOnce();
  expect(data.textureDisposal).toHaveBeenCalledOnce();
  expect(data.image.close).toHaveBeenCalledOnce();
  env.dispose();
});

test("invalid URLs reject before starting transport", async () => {
  const env = host();
  const io = transport();
  await expect(loadGLTF(env.app, "  ")).rejects.toThrow(TypeError);
  expect(io.load).not.toHaveBeenCalled();
  env.dispose();
});
