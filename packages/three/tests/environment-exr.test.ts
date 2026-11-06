import { afterEach, expect, test, vi } from "vite-plus/test";
import { readFileSync } from "node:fs";
import {
  DataUtils,
  EquirectangularReflectionMapping,
  FileLoader,
  HalfFloatType,
  LinearSRGBColorSpace,
  Scene,
} from "three";
import type { DataTexture } from "three";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { loadEXR, attachEnvironment } from "../src/environment.ts";
import { ResourceScope } from "../src/resources.ts";
import type { AnyThreeApp } from "../src/index.ts";

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const controller = new AbortController();
  const state = { scene: new Scene(), resources: new ResourceScope(), signal: controller.signal };
  return {
    state,
    app: state as unknown as AnyThreeApp,
    dispose() {
      controller.abort();
      state.resources.dispose();
    },
  };
}
function transport() {
  const requests: Array<{
    resolve: (buffer: ArrayBuffer) => void;
    reject: (error: unknown) => void;
  }> = [];
  vi.spyOn(FileLoader.prototype, "load").mockImplementation(function (
    this: FileLoader,
    _url,
    resolve,
    _progress,
    reject,
  ) {
    requests.push({ resolve: resolve!, reject: reject! });
    return this;
  });
  return requests;
}
function bytes(name = "studio.exr"): ArrayBuffer {
  const data = readFileSync(
    new URL(`../../../apps/website/public/environments/${name}`, import.meta.url),
  );
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}
function nativeDecoder(): (this: EXRLoader, buffer: ArrayBuffer) => DataTexture {
  return Reflect.get(EXRLoader.prototype, "createDataTexture") as (
    this: EXRLoader,
    buffer: ArrayBuffer,
  ) => DataTexture;
}

test("original RGB EXR decodes to owned linear half floats and uses the existing environment binding", async () => {
  const host = fixture(),
    requests = transport(),
    pending = loadEXR(host.app, "/studio.exr");
  requests[0]!.resolve(bytes());
  const environment = await pending;
  expect(environment.texture.type).toBe(HalfFloatType);
  expect(environment.texture.colorSpace).toBe(LinearSRGBColorSpace);
  expect(environment.texture.mapping).toBe(EquirectangularReflectionMapping);
  expect(environment.texture.flipY).toBe(false);
  expect(environment.texture.image.width).toBe(64);
  expect(environment.texture.image.height).toBe(32);
  const data = environment.texture.image.data as Uint16Array;
  expect(data).toBeInstanceOf(Uint16Array);
  expect(DataUtils.fromHalfFloat(data[0]!)).toBeCloseTo(0.2, 3);
  expect(DataUtils.fromHalfFloat(data[1]!)).toBeCloseTo(0.3, 3);
  expect(DataUtils.fromHalfFloat(data[2]!)).toBeCloseTo(0.79375, 3);
  expect(DataUtils.fromHalfFloat(data[3]!)).toBe(1);
  expect(Math.max(...Array.from(data, (value) => DataUtils.fromHalfFloat(value)))).toBeGreaterThan(
    4,
  );
  const dispose = vi.spyOn(environment.texture, "dispose");
  const binding = attachEnvironment(host.app, environment, { background: true });
  expect(host.state.scene.environment).toBe(environment.texture);
  expect(host.state.scene.background).toBe(environment.texture);
  environment.dispose();
  environment.dispose();
  expect(binding.disposed).toBe(true);
  expect(dispose).toHaveBeenCalledOnce();
  expect(host.state.scene.environment).toBeNull();
  expect(host.state.scene.background).toBeNull();
  host.dispose();
});

test("each EXR decoder gets a private buffer and cannot poison shared FileLoader bytes", async () => {
  const host = fixture(),
    requests = transport(),
    shared = bytes(),
    original = new Uint8Array(shared.slice(0));
  const create = nativeDecoder(),
    inputs: ArrayBuffer[] = [];
  vi.spyOn(EXRLoader.prototype, "createDataTexture").mockImplementation(function (
    this: EXRLoader,
    buffer: ArrayBuffer,
  ) {
    inputs.push(buffer);
    const texture = create.call(this, buffer);
    new Uint8Array(buffer)[0] = 0;
    return texture;
  });
  const a = loadEXR(host.app, "/studio.exr"),
    b = loadEXR(host.app, "/studio.exr");
  requests[0]!.resolve(shared);
  requests[1]!.resolve(shared);
  const [first, second] = await Promise.all([a, b]);
  expect(inputs[0]).not.toBe(shared);
  expect(inputs[1]).not.toBe(shared);
  expect(inputs[0]).not.toBe(inputs[1]);
  expect(new Uint8Array(shared)).toEqual(original);
  expect(first.texture).not.toBe(second.texture);
  expect(first.texture.image.data).not.toBe(second.texture.image.data);
  host.dispose();
});

test("EXR cancellation skips only its own late decode and another equal-URL task succeeds", async () => {
  const host = fixture(),
    requests = transport(),
    abort = new AbortController();
  const decode = vi.spyOn(EXRLoader.prototype, "createDataTexture");
  const cancelled = loadEXR(host.app, "/studio.exr", { signal: abort.signal });
  const rejection = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  const other = loadEXR(host.app, "/studio.exr");
  abort.abort();
  await rejection;
  requests[0]!.resolve(bytes());
  expect(decode).not.toHaveBeenCalled();
  requests[1]!.resolve(bytes());
  const asset = await other;
  expect(asset.disposed).toBe(false);
  expect(decode).toHaveBeenCalledOnce();
  host.dispose();
});

test("host disposal during native EXR decoding consumes the late texture without resurrecting ownership", async () => {
  const host = fixture(),
    requests = transport(),
    create = nativeDecoder(),
    disposed = vi.fn();
  vi.spyOn(EXRLoader.prototype, "createDataTexture").mockImplementation(function (
    this: EXRLoader,
    buffer: ArrayBuffer,
  ) {
    const texture = create.call(this, buffer);
    texture.addEventListener("dispose", disposed);
    host.dispose();
    return texture;
  });
  const pending = loadEXR(host.app, "/studio.exr");
  const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  requests[0]!.resolve(bytes());
  await rejection;
  expect(disposed).toHaveBeenCalledOnce();
  expect(host.state.resources.disposed).toBe(true);
  expect(host.state.scene.environment).toBeNull();
});

test("late EXR cleanup failures report once after cancellation has settled", async () => {
  const host = fixture(),
    requests = transport(),
    create = nativeDecoder(),
    report = vi.fn();
  const failure = new Error("late EXR disposal");
  vi.spyOn(EXRLoader.prototype, "createDataTexture").mockImplementation(function (
    this: EXRLoader,
    buffer: ArrayBuffer,
  ) {
    const texture = create.call(this, buffer);
    texture.addEventListener("dispose", () => {
      throw failure;
    });
    host.dispose();
    return texture;
  });
  const pending = loadEXR(host.app, "/studio.exr", { onCleanupError: report });
  const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  requests[0]!.resolve(bytes());
  await rejection;
  expect(report).toHaveBeenCalledExactlyOnceWith(failure);
});

test("malformed EXR input rejects but a fresh task can retry without changing scene state", async () => {
  const host = fixture(),
    requests = transport(),
    pending = loadEXR(host.app, "/invalid.exr");
  const rejection = expect(pending).rejects.toThrow();
  requests[0]!.resolve(bytes("invalid.exr"));
  await rejection;
  expect(host.state.scene.environment).toBeNull();
  const retry = loadEXR(host.app, "/studio.exr");
  requests[1]!.resolve(bytes());
  expect((await retry).disposed).toBe(false);
  host.dispose();
});

test("empty and pre-aborted EXR requests start no transport", async () => {
  const host = fixture(),
    requests = transport(),
    abort = new AbortController();
  abort.abort();
  await expect(loadEXR(host.app, " ")).rejects.toThrow(TypeError);
  await expect(loadEXR(host.app, "/studio.exr", { signal: abort.signal })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(requests).toHaveLength(0);
  host.dispose();
});
