import { afterEach, expect, test, vi } from "vite-plus/test";
import { readFileSync } from "node:fs";
import {
  Color,
  DataTexture,
  EquirectangularReflectionMapping,
  FileLoader,
  HalfFloatType,
  LinearSRGBColorSpace,
  LoadingManager,
  Scene,
  Texture,
} from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { ResourceScope } from "../src/resources.ts";
import { attachEnvironment, loadHDR } from "../src/environment.ts";
import type { ThreeApp } from "../src/three-app.ts";

afterEach(() => vi.restoreAllMocks());

function host() {
  const controller = new AbortController();
  const value = { scene: new Scene(), resources: new ResourceScope(), signal: controller.signal };
  return {
    value,
    app: value as unknown as ThreeApp,
    dispose(): void {
      controller.abort();
      value.resources.dispose();
    },
  };
}

function transport() {
  const requests: Array<{
    resolve: (data: string | ArrayBuffer) => void;
    reject: (error: unknown) => void;
    progress: (event: ProgressEvent) => void;
    manager: LoadingManager;
  }> = [];
  vi.spyOn(FileLoader.prototype, "load").mockImplementation(function (
    this: FileLoader,
    _url,
    resolve,
    progress,
    reject,
  ) {
    expect(this.responseType).toBe("arraybuffer");
    requests.push({
      resolve: resolve!,
      reject: reject!,
      progress: progress!,
      manager: this.manager,
    });
  });
  return requests;
}

function buffer(): ArrayBuffer {
  const bytes = readFileSync(
    new URL("../../../apps/website/public/environments/studio.hdr", import.meta.url),
  );
  return Uint8Array.from(bytes).buffer;
}

async function loaded(env = host()) {
  const requests = transport();
  const result = loadHDR(env.app, "/studio.hdr");
  requests[0]!.resolve(buffer());
  return { ...env, map: await result };
}

test("native HDR decoding preserves HDR color space, half floats and equirectangular mapping without scene changes", async () => {
  const env = await loaded();
  expect(env.map.texture.image.width).toBe(64);
  expect(env.map.texture.image.height).toBe(32);
  expect(env.map.texture.image.data).toBeInstanceOf(Uint16Array);
  expect(env.map.texture.type).toBe(HalfFloatType);
  expect(env.map.texture.colorSpace).toBe(LinearSRGBColorSpace);
  expect(env.map.texture.mapping).toBe(EquirectangularReflectionMapping);
  expect(env.value.scene.environment).toBeNull();
  expect(env.value.scene.background).toBeNull();
  const release = vi.spyOn(env.map.texture, "dispose");
  env.map.dispose();
  env.map.dispose();
  env.dispose();
  expect(release).toHaveBeenCalledTimes(1);
});

test("invalid URLs, already aborted calls and disposed scopes perform no network work", async () => {
  const requests = transport();
  const env = host();
  await expect(loadHDR(env.app, " ")).rejects.toThrow("non-empty");
  const signal = AbortSignal.abort();
  await expect(loadHDR(env.app, "/hdr", { signal })).rejects.toMatchObject({ name: "AbortError" });
  env.dispose();
  await expect(loadHDR(env.app, "/hdr")).rejects.toMatchObject({ name: "AbortError" });
  expect(requests).toHaveLength(0);
});

test("equal URLs have independent parse results and cancellation skips only the late task", async () => {
  const requests = transport();
  const env = host();
  const cancel = new AbortController();
  const parse = vi.spyOn(HDRLoader.prototype, "createDataTexture");
  const first = loadHDR(env.app, "/same.hdr", { signal: cancel.signal });
  const abort = vi.spyOn(requests[0]!.manager, "abort");
  const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
  const second = loadHDR(env.app, "/same.hdr");
  cancel.abort();
  await rejected;
  const shared = buffer();
  requests[0]!.resolve(shared);
  requests[1]!.resolve(shared);
  const map = await second;
  expect(parse).toHaveBeenCalledTimes(1);
  expect(abort).not.toHaveBeenCalled();
  const third = loadHDR(env.app, "/same.hdr");
  requests[2]!.resolve(shared);
  const another = await third;
  expect(another.texture).not.toBe(map.texture);
  expect(another.texture.image.data).not.toBe(map.texture.image.data);
  map.dispose();
  expect(another.disposed).toBe(false);
  env.dispose();
});

test("host abort and explicit scope cleanup settle pending loads without parsing late bytes", async () => {
  const requests = transport();
  const env = host();
  const parse = vi.spyOn(HDRLoader.prototype, "createDataTexture");
  const promise = loadHDR(env.app, "/hdr");
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  env.value.resources.dispose();
  await rejected;
  requests[0]!.resolve(buffer());
  expect(parse).not.toHaveBeenCalled();
});

test("progress reports known and unknown totals and callback failure cancels only its task", async () => {
  const requests = transport();
  const env = host();
  const progress = vi.fn();
  const result = loadHDR(env.app, "/hdr", { onProgress: progress });
  requests[0]!.progress({ lengthComputable: false, loaded: 10, total: 0 } as ProgressEvent);
  requests[0]!.progress({ lengthComputable: true, loaded: 20, total: 100 } as ProgressEvent);
  expect(progress.mock.calls).toEqual([
    [{ loaded: 10, total: null, ratio: null }],
    [{ loaded: 20, total: 100, ratio: 0.2 }],
  ]);
  requests[0]!.resolve(buffer());
  const map = await result;
  map.dispose();
  const failure = new Error("consumer progress");
  const bad = loadHDR(env.app, "/hdr", {
    onProgress: () => {
      throw failure;
    },
  });
  const rejected = expect(bad).rejects.toBe(failure);
  requests[1]!.progress({ lengthComputable: false, loaded: 1 } as ProgressEvent);
  await rejected;
  requests[1]!.resolve(buffer());
  env.dispose();
});

test("transport and malformed HDR failures reject and remove task ownership so retry succeeds", async () => {
  const requests = transport();
  const env = host();
  const error = new Error("network");
  const first = loadHDR(env.app, "/hdr");
  const a = expect(first).rejects.toBe(error);
  requests[0]!.reject(error);
  await a;
  const second = loadHDR(env.app, "/hdr");
  const b = expect(second).rejects.toThrow();
  requests[1]!.resolve(new ArrayBuffer(4));
  await b;
  const third = loadHDR(env.app, "/hdr");
  requests[2]!.resolve(buffer());
  expect((await third).disposed).toBe(false);
  env.dispose();
});

test("cancellation during synchronous native decoding disposes the late texture and reports cleanup failure", async () => {
  const requests = transport();
  const env = host();
  const cancel = new AbortController();
  const texture = new DataTexture();
  const failure = new Error("cleanup");
  const report = vi.fn();
  const release = vi.spyOn(texture, "dispose").mockImplementation(() => {
    throw failure;
  });
  vi.spyOn(HDRLoader.prototype, "createDataTexture").mockImplementation(() => {
    cancel.abort();
    return texture;
  });
  const promise = loadHDR(env.app, "/hdr", { signal: cancel.signal, onCleanupError: report });
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  requests[0]!.resolve(buffer());
  await rejected;
  expect(release).toHaveBeenCalledTimes(1);
  expect(report).toHaveBeenCalledWith(failure);
  env.dispose();
});

test("binding preparation cannot restore disposed assets after an options getter ends an owner", async () => {
  for (const end of ["host", "asset", "scope"] as const) {
    const env = await loaded();
    const previous = new Texture();
    const background = new Color("red");
    env.value.scene.environment = previous;
    env.value.scene.background = background;
    env.value.scene.environmentIntensity = 0.5;
    expect(() =>
      attachEnvironment(env.app, env.map, {
        get background() {
          if (end === "host") env.dispose();
          else if (end === "asset") env.map.dispose();
          else env.map.resources.dispose();
          return true;
        },
        intensity: 2,
      }),
    ).toThrow();
    expect(env.value.scene.environment).toBe(previous);
    expect(env.value.scene.background).toBe(background);
    expect(env.value.scene.environmentIntensity).toBe(0.5);
    env.dispose();
  }
});

test("a nested options binding keeps its exclusive ownership when the outer preparation resumes", async () => {
  const env = await loaded();
  const previous = new Texture();
  const background = new Color("red");
  env.value.scene.environment = previous;
  env.value.scene.background = background;
  env.value.scene.environmentIntensity = 0.5;
  let nested: ReturnType<typeof attachEnvironment> | undefined;
  expect(() =>
    attachEnvironment(env.app, env.map, {
      get background() {
        nested = attachEnvironment(env.app, env.map, { background: true, intensity: 3 });
        return false;
      },
      intensity: 2,
    }),
  ).toThrow("already attached");
  expect(nested?.disposed).toBe(false);
  expect(env.value.scene.environment).toBe(env.map.texture);
  expect(env.value.scene.background).toBe(env.map.texture);
  expect(env.value.scene.environmentIntensity).toBe(3);
  nested!.dispose();
  expect(env.value.scene.environment).toBe(previous);
  expect(env.value.scene.background).toBe(background);
  expect(env.value.scene.environmentIntensity).toBe(0.5);
  env.dispose();
});

test("binding restores borrowed scene properties before source texture disposal", async () => {
  const env = await loaded();
  const previous = new Texture();
  const background = new Color("red");
  env.value.scene.environment = previous;
  env.value.scene.background = background;
  env.value.scene.environmentIntensity = 0.5;
  const release = vi.spyOn(previous, "dispose");
  const binding = attachEnvironment(env.app, env.map, { background: true, intensity: 2 });
  expect(env.value.scene.environment).toBe(env.map.texture);
  expect(env.value.scene.background).toBe(env.map.texture);
  env.map.texture.addEventListener("dispose", () => {
    expect(binding.disposed).toBe(true);
    expect(env.value.scene.environment).toBe(previous);
    expect(env.value.scene.background).toBe(background);
  });
  env.map.dispose();
  expect(env.value.scene.environmentIntensity).toBe(0.5);
  expect(release).not.toHaveBeenCalled();
  env.dispose();
});

test("binding disposal leaves the asset reusable and defaults to lighting without background mutation", async () => {
  const env = await loaded();
  const background = new Color("blue");
  env.value.scene.background = background;
  const first = attachEnvironment(env.app, env.map);
  expect(env.value.scene.background).toBe(background);
  first.dispose();
  first.dispose();
  expect(env.map.disposed).toBe(false);
  const second = attachEnvironment(env.app, env.map, { background: true });
  first.dispose();
  expect(second.disposed).toBe(false);
  expect(env.value.scene.environment).toBe(env.map.texture);
  env.dispose();
  expect(second.disposed).toBe(true);
  expect(env.map.disposed).toBe(true);
});

test("external replacements and intensity edits are preserved on detach", async () => {
  const env = await loaded();
  const foreign = new Texture();
  const binding = attachEnvironment(env.app, env.map, { background: true, intensity: 2 });
  env.value.scene.environment = foreign;
  env.value.scene.background = new Color("green");
  env.value.scene.environmentIntensity = 4;
  binding.dispose();
  expect(env.value.scene.environment).toBe(foreign);
  expect(env.value.scene.background).toBeInstanceOf(Color);
  expect(env.value.scene.environmentIntensity).toBe(4);
  const second = attachEnvironment(env.app, env.map, { intensity: 2 });
  env.value.scene.environmentIntensity = 3;
  second.dispose();
  expect(env.value.scene.environmentIntensity).toBe(3);
  env.dispose();
});

test("duplicate, foreign, disposed and invalid bindings fail before scene mutation", async () => {
  const env = await loaded();
  const other = host();
  expect(() => attachEnvironment(other.app, env.map)).toThrow("owned");
  for (const intensity of [-1, NaN, Infinity])
    expect(() => attachEnvironment(env.app, env.map, { intensity })).toThrow("options");
  expect(env.value.scene.environment).toBeNull();
  const binding = attachEnvironment(env.app, env.map);
  expect(() => attachEnvironment(env.app, env.map)).toThrow("already");
  expect(env.value.scene.environment).toBe(env.map.texture);
  binding.dispose();
  env.map.dispose();
  expect(() => attachEnvironment(env.app, env.map)).toThrow("active");
  other.dispose();
  expect(() => attachEnvironment(other.app, env.map)).toThrow("disposed");
  env.dispose();
});

test("failing consumer hooks do not suppress binding restoration or native texture disposal", async () => {
  const env = await loaded();
  const binding = attachEnvironment(env.app, env.map, { background: true });
  const release = vi.spyOn(env.map.texture, "dispose");
  env.map.resources.track({
    dispose(): void {
      throw new Error("hook");
    },
  });
  expect(() => env.map.dispose()).toThrow(AggregateError);
  expect(binding.disposed).toBe(true);
  expect(env.value.scene.environment).toBeNull();
  expect(env.value.scene.background).toBeNull();
  expect(release).toHaveBeenCalledTimes(1);
  env.dispose();
});
