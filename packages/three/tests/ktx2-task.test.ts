import { afterEach, expect, test, vi } from "vite-plus/test";
import { CompressedTexture } from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { TaskKTX2Loader } from "../src/ktx2-task.ts";

afterEach(() => vi.restoreAllMocks());

function decoding() {
  const tasks: Array<{
    buffer: ArrayBuffer;
    resolve: (texture: CompressedTexture) => void;
    reject: (error: unknown) => void;
  }> = [];
  vi.spyOn(KTX2Loader.prototype, "parse").mockImplementation(function (
    this: KTX2Loader,
    buffer,
    onLoad,
    onError,
  ) {
    this.transcoderPending ??= Promise.resolve();
    tasks.push({ buffer, resolve: onLoad!, reject: onError! });
  });
  // The fake init above never increments r187's native global active counter.
  const dispose = vi.spyOn(KTX2Loader.prototype, "dispose").mockImplementation(() => {});
  return { tasks, dispose };
}

test("equal cached input buffers are copied before native parsing, with independently owned textures", () => {
  const io = decoding();
  const a = new TaskKTX2Loader("/basis/", vi.fn());
  const b = new TaskKTX2Loader("/basis/", vi.fn());
  const source = new Uint8Array([1, 2, 3, 4]).buffer;
  const textures = [new CompressedTexture([], 1, 1), new CompressedTexture([], 1, 1)];
  const disposed = textures.map((texture) => vi.spyOn(texture, "dispose"));
  a.parse(source, vi.fn(), vi.fn());
  b.parse(source, vi.fn(), vi.fn());
  expect(io.tasks[0]!.buffer).not.toBe(source);
  expect(io.tasks[1]!.buffer).not.toBe(io.tasks[0]!.buffer);
  expect(new Uint8Array(io.tasks[0]!.buffer)).toEqual(new Uint8Array(source));
  expect(source.byteLength).toBe(4);
  io.tasks.forEach((task, index) => task.resolve(textures[index]!));
  a.adopt();
  a.finish();
  b.finish();
  b.finish();
  expect(disposed[0]).not.toHaveBeenCalled();
  expect(disposed[1]).toHaveBeenCalledOnce();
  expect(io.dispose).toHaveBeenCalledTimes(2);
});

test("native model failure waits for all started transcodes, cleans partial textures and blocks late parsing", () => {
  const io = decoding();
  const loader = new TaskKTX2Loader("/basis/", vi.fn());
  const first = new CompressedTexture([], 1, 1);
  const late = new CompressedTexture([], 1, 1);
  const firstDisposal = vi.spyOn(first, "dispose");
  const lateDisposal = vi.spyOn(late, "dispose");
  const failure = new Error("another model dependency failed");
  loader.parse(new ArrayBuffer(4), vi.fn(), vi.fn());
  loader.parse(new ArrayBuffer(4), vi.fn(), vi.fn());
  loader.parse(new ArrayBuffer(4), vi.fn(), vi.fn());
  io.tasks[0]!.resolve(first);
  io.tasks[1]!.reject(failure);
  loader.finish();
  expect(loader.failure?.error).toBe(failure);
  expect(io.dispose).not.toHaveBeenCalled();
  const rejected = vi.fn();
  loader.parse(new ArrayBuffer(4), vi.fn(), rejected);
  expect(rejected).toHaveBeenCalledOnce();
  expect(io.tasks).toHaveLength(3);
  io.tasks[2]!.resolve(late);
  expect(firstDisposal).toHaveBeenCalledOnce();
  expect(lateDisposal).toHaveBeenCalledOnce();
  expect(io.dispose).toHaveBeenCalledOnce();
});

test("an unused or synchronously failed loader does not decrement the native uninitialized counter", () => {
  const dispose = vi.spyOn(KTX2Loader.prototype, "dispose");
  const failure = new Error("invalid texture");
  vi.spyOn(KTX2Loader.prototype, "parse").mockImplementation(() => {
    throw failure;
  });
  const loader = new TaskKTX2Loader("/basis/", vi.fn());
  const rejected = vi.fn();
  loader.parse(new ArrayBuffer(4), vi.fn(), rejected);
  loader.finish();
  loader.finish();
  expect(rejected).toHaveBeenCalledExactlyOnceWith(failure);
  expect(loader.failure?.error).toBe(failure);
  expect(dispose).not.toHaveBeenCalled();
});

test("a throwing load callback followed by native error reporting completes cleanup exactly once", () => {
  const io = decoding();
  const loader = new TaskKTX2Loader("/basis/", vi.fn());
  const failure = new Error("callback failed");
  const rejected = vi.fn();
  loader.parse(
    new ArrayBuffer(4),
    () => {
      loader.finish();
      throw failure;
    },
    rejected,
  );
  const texture = new CompressedTexture([], 1, 1);
  const dispose = vi.spyOn(texture, "dispose");
  expect(() => io.tasks[0]!.resolve(texture)).toThrow(failure);
  // r187's .then(onLoad).catch(onError) reports callback exceptions again.
  io.tasks[0]!.reject(failure);
  loader.finish();
  expect(rejected).toHaveBeenCalledExactlyOnceWith(failure);
  expect(dispose).toHaveBeenCalledOnce();
  expect(io.dispose).toHaveBeenCalledOnce();
});

test("cleanup errors do not prevent remaining texture or transcoder cleanup", () => {
  const io = decoding();
  const report = vi.fn();
  const loader = new TaskKTX2Loader("/basis/", report);
  const textures = [new CompressedTexture([], 1, 1), new CompressedTexture([], 1, 1)];
  const failure = new Error("texture cleanup");
  vi.spyOn(textures[0]!, "dispose").mockImplementation(() => {
    throw failure;
  });
  const second = vi.spyOn(textures[1]!, "dispose");
  for (const _texture of textures) loader.parse(new ArrayBuffer(4), vi.fn(), vi.fn());
  io.tasks.forEach((task, index) => task.resolve(textures[index]!));
  loader.finish();
  expect(report).toHaveBeenCalledExactlyOnceWith(failure);
  expect(second).toHaveBeenCalledOnce();
  expect(io.dispose).toHaveBeenCalledOnce();
});

test("external file errors are retained even when native GLTFLoader would swallow them", () => {
  const failure = new Error("texture HTTP 404");
  vi.spyOn(KTX2Loader.prototype, "load").mockImplementation((_url, _load, _progress, error) => {
    error?.(failure);
  });
  const loader = new TaskKTX2Loader("/basis/", vi.fn());
  const rejected = vi.fn();
  loader.load("texture.ktx2", vi.fn(), undefined, rejected);
  expect(loader.failure?.error).toBe(failure);
  expect(rejected).toHaveBeenCalledExactlyOnceWith(failure);
  loader.finish();
});
