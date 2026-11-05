import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  CompressedArrayTexture,
  CompressedTexture,
  DataTexture,
  FileLoader,
  SRGBColorSpace,
  RGBA_S3TC_DXT5_Format,
} from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { ResourceScope } from "../src/resources.ts";
import { loadKTX2 } from "../src/textures.ts";
import type { ThreeApp } from "../src/three-app.ts";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    try {
      cleanup();
    } catch {
      /* Asserted in failure cases. */
    }
  }
  vi.restoreAllMocks();
});

function fixture() {
  const controller = new AbortController();
  const state = { signal: controller.signal, resources: new ResourceScope(), renderer: {} };
  const dispose = (): void => {
    controller.abort();
    state.resources.dispose();
  };
  cleanups.push(dispose);
  return { ...state, app: state as unknown as ThreeApp, dispose };
}

function io() {
  const requests: Array<{
    load: (data: string | ArrayBuffer) => void;
    fail: (error: unknown) => void;
    progress: (event: ProgressEvent) => void;
  }> = [];
  const tasks: Array<{
    buffer: ArrayBuffer;
    loader: KTX2Loader;
    load: (texture: CompressedTexture) => void;
    fail: (error: unknown) => void;
  }> = [];
  const detect = vi.spyOn(KTX2Loader.prototype, "detectSupport").mockImplementation(function (
    this: KTX2Loader,
  ) {
    return this;
  });
  const limit = vi.spyOn(KTX2Loader.prototype, "setWorkerLimit");
  vi.spyOn(FileLoader.prototype, "load").mockImplementation((_url, load, progress, fail) => {
    requests.push({ load: load!, progress: progress!, fail: fail! });
  });
  vi.spyOn(KTX2Loader.prototype, "parse").mockImplementation(function (
    this: KTX2Loader,
    buffer,
    load,
    fail,
  ) {
    this.transcoderPending = Promise.resolve();
    tasks.push({ buffer, loader: this, load: load!, fail: fail! });
  });
  // Mocked init above never increments the native active-loader counter.
  const release = vi.spyOn(KTX2Loader.prototype, "dispose").mockImplementation(() => {});
  return { requests, tasks, detect, limit, release };
}

test("standalone KTX2 detects this renderer, preserves native metadata and transfers exactly one texture owner", async () => {
  const env = fixture();
  const transport = io();
  const promise = loadKTX2(env.app, "/map.ktx2", { transcoderPath: "/basis/", workerLimit: 2 });
  const source = new Uint8Array([1, 2, 3]).buffer;
  transport.requests[0]!.load(source);
  const texture = new CompressedTexture([], 16, 16);
  texture.colorSpace = SRGBColorSpace;
  const gpu = vi.spyOn(texture, "dispose");
  transport.tasks[0]!.load(texture);
  const asset = await promise;
  expect(transport.detect).toHaveBeenCalledExactlyOnceWith(env.renderer);
  expect(transport.limit).toHaveBeenCalledWith(2);
  expect(transport.tasks[0]!.buffer).not.toBe(source);
  expect(source.byteLength).toBe(3);
  expect(asset.texture).toBe(texture);
  expect(asset.texture.colorSpace).toBe(SRGBColorSpace);
  expect(transport.release).toHaveBeenCalledOnce();
  expect(gpu).not.toHaveBeenCalled();
  asset.resources.track({
    dispose(): void {
      expect(gpu).not.toHaveBeenCalled();
    },
  });
  asset.dispose();
  asset.dispose();
  expect(gpu).toHaveBeenCalledOnce();
});

test("same source bytes create independent parsing buffers and independent texture ownership", async () => {
  const env = fixture();
  const transport = io();
  const source = new ArrayBuffer(4);
  const a = loadKTX2(env.app, "/same", { transcoderPath: "/basis/" });
  const b = loadKTX2(env.app, "/same", { transcoderPath: "/basis/" });
  transport.requests.forEach((request) => request.load(source));
  expect(transport.tasks[0]!.buffer).not.toBe(transport.tasks[1]!.buffer);
  const textures = [new CompressedTexture([], 1, 1), new CompressedTexture([], 1, 1)];
  const releases = textures.map((texture) => vi.spyOn(texture, "dispose"));
  transport.tasks.forEach((task, index) => task.load(textures[index]!));
  const first = await a;
  const second = await b;
  first.dispose();
  expect(releases[0]).toHaveBeenCalledOnce();
  expect(releases[1]).not.toHaveBeenCalled();
  expect(second.disposed).toBe(false);
});

test("cancellation before bytes skips parsing and never disposes an uninitialized native loader", async () => {
  const env = fixture();
  const transport = io();
  const controller = new AbortController();
  const promise = loadKTX2(env.app, "/image", {
    transcoderPath: "/basis/",
    signal: controller.signal,
  });
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejected;
  transport.requests[0]!.load(new ArrayBuffer(1));
  expect(transport.tasks).toHaveLength(0);
  expect(transport.release).not.toHaveBeenCalled();
});

test("in-flight cancellation settles immediately but waits for native parse before releasing late texture and decoder", async () => {
  const env = fixture();
  const transport = io();
  const promise = loadKTX2(env.app, "/image", { transcoderPath: "/basis/" });
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  transport.requests[0]!.load(new ArrayBuffer(1));
  env.dispose();
  await rejected;
  expect(transport.release).not.toHaveBeenCalled();
  const texture = new CompressedTexture([], 1, 1);
  const release = vi.spyOn(texture, "dispose");
  transport.tasks[0]!.load(texture);
  expect(release).toHaveBeenCalledOnce();
  expect(transport.release).toHaveBeenCalledOnce();
});

test("transport/parse failures release the task and a retry can succeed", async () => {
  const env = fixture();
  const transport = io();
  const first = loadKTX2(env.app, "/image", { transcoderPath: "/basis/" });
  const a = expect(first).rejects.toThrow("network");
  transport.requests[0]!.fail(new Error("network"));
  await a;
  expect(transport.release).not.toHaveBeenCalled();
  const second = loadKTX2(env.app, "/image", { transcoderPath: "/basis/" });
  const b = expect(second).rejects.toThrow("decode");
  transport.requests[1]!.load(new ArrayBuffer(1));
  transport.tasks[0]!.fail(new Error("decode"));
  await b;
  const third = loadKTX2(env.app, "/image", { transcoderPath: "/basis/" });
  transport.requests[2]!.load(new ArrayBuffer(1));
  transport.tasks[1]!.load(new CompressedTexture([], 1, 1));
  expect((await third).disposed).toBe(false);
  expect(transport.release).toHaveBeenCalledTimes(2);
});

test("invalid configuration rejects before any capability detection or transport", async () => {
  const env = fixture();
  const transport = io();
  await expect(loadKTX2(env.app, " ", { transcoderPath: "/basis/" })).rejects.toThrow("non-empty");
  for (const path of ["", "/basis", { js: "", wasm: "file" }])
    await expect(loadKTX2(env.app, "/image", { transcoderPath: path })).rejects.toThrow("explicit");
  for (const workerLimit of [0, 33, 1.5, NaN])
    await expect(
      loadKTX2(env.app, "/image", { transcoderPath: "/basis/", workerLimit }),
    ).rejects.toThrow("workerLimit");
  env.dispose();
  await expect(loadKTX2(env.app, "/image", { transcoderPath: "/basis/" })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(transport.detect).not.toHaveBeenCalled();
  expect(transport.requests).toHaveLength(0);
});

test("explicit URL pairs are snapshotted before asynchronous parsing", async () => {
  const env = fixture();
  const transport = io();
  const path = { js: "/original.js", wasm: "/original.wasm" };
  const promise = loadKTX2(env.app, "/image", { transcoderPath: path });
  path.js = "/changed.js";
  path.wasm = "/changed.wasm";
  transport.requests[0]!.load(new ArrayBuffer(1));
  const manager = transport.tasks[0]!.loader.manager;
  expect(manager.resolveURL("adui-ktx2:basis_transcoder.js")).toBe("/original.js");
  expect(manager.resolveURL("adui-ktx2:basis_transcoder.wasm")).toBe("/original.wasm");
  transport.tasks[0]!.load(new CompressedTexture([], 1, 1));
  await promise;
});

test("unsupported raw/array formats reject and dispose the adapter-owned result", async () => {
  const env = fixture();
  const transport = io();
  for (const texture of [
    new DataTexture(),
    new CompressedArrayTexture([], 1, 1, 2, RGBA_S3TC_DXT5_Format),
  ]) {
    const promise = loadKTX2(env.app, "/image", { transcoderPath: "/basis/" });
    const rejected = expect(promise).rejects.toThrow("2D Basis");
    transport.requests.at(-1)!.load(new ArrayBuffer(1));
    const release = vi.spyOn(texture, "dispose");
    transport.tasks.at(-1)!.load(texture as CompressedTexture);
    await rejected;
    expect(release).toHaveBeenCalledOnce();
  }
});

test("consumer cleanup errors do not prevent GPU disposal and native decoder errors are reported", async () => {
  const env = fixture();
  const transport = io();
  const report = vi.fn();
  transport.release.mockImplementation(() => {
    throw new Error("decoder cleanup");
  });
  const promise = loadKTX2(env.app, "/image", {
    transcoderPath: "/basis/",
    onCleanupError: report,
  });
  transport.requests[0]!.load(new ArrayBuffer(1));
  const texture = new CompressedTexture([], 1, 1);
  const release = vi.spyOn(texture, "dispose");
  transport.tasks[0]!.load(texture);
  const asset = await promise;
  expect(report).toHaveBeenCalledOnce();
  asset.resources.track({
    dispose(): void {
      throw new Error("consumer hook");
    },
  });
  expect(() => asset.dispose()).toThrow(AggregateError);
  expect(release).toHaveBeenCalledOnce();
});

test("progress is nullable/capped and consumer errors cancel before a late parse", async () => {
  const env = fixture();
  const transport = io();
  const progress = vi.fn();
  const promise = loadKTX2(env.app, "/image", { transcoderPath: "/basis/", onProgress: progress });
  transport.requests[0]!.progress({
    loaded: 2,
    total: 0,
    lengthComputable: false,
  } as ProgressEvent);
  transport.requests[0]!.progress({
    loaded: 12,
    total: 10,
    lengthComputable: true,
  } as ProgressEvent);
  expect(progress.mock.calls).toEqual([
    [{ loaded: 2, total: null, ratio: null }],
    [{ loaded: 12, total: 10, ratio: 1 }],
  ]);
  transport.requests[0]!.load(new ArrayBuffer(1));
  transport.tasks[0]!.load(new CompressedTexture([], 1, 1));
  await promise;
  const failure = new Error("progress");
  const bad = loadKTX2(env.app, "/image", {
    transcoderPath: "/basis/",
    onProgress: () => {
      throw failure;
    },
  });
  const rejected = expect(bad).rejects.toBe(failure);
  transport.requests[1]!.progress({} as ProgressEvent);
  await rejected;
  transport.requests[1]!.load(new ArrayBuffer(1));
  expect(transport.tasks).toHaveLength(1);
});
