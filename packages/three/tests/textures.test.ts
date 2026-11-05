import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  FileLoader,
  LinearSRGBColorSpace,
  LoadingManager,
  NoColorSpace,
  SRGBColorSpace,
  Texture,
} from "three";
import { ResourceScope } from "../src/resources.ts";
import { loadTexture } from "../src/textures.ts";
import type { ThreeApp } from "../src/three-app.ts";
import type { LoadTextureOptions } from "../src/textures.ts";

afterEach(() => vi.restoreAllMocks());

function bitmap() {
  return { width: 32, height: 32, close: vi.fn<() => void>() };
}
function fixture() {
  const controller = new AbortController();
  const image = bitmap();
  const decode = vi
    .fn<(blob: Blob, options?: ImageBitmapOptions) => Promise<ImageBitmap>>()
    .mockResolvedValue(image);
  const view = { createImageBitmap: decode };
  const value = {
    signal: controller.signal,
    resources: new ResourceScope(),
    renderer: { domElement: { ownerDocument: { defaultView: view } } },
  };
  return {
    ...value,
    app: value as unknown as ThreeApp,
    decode,
    image,
    view,
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
async function loaded(options?: LoadTextureOptions) {
  const env = fixture();
  const requests = transport();
  const promise = loadTexture(env.app, "/image.png", options);
  requests[0]!.resolve(new ArrayBuffer(4));
  return { ...env, asset: await promise };
}

test("default decoding owns an sRGB native texture and applies orientation before upload", async () => {
  const env = await loaded();
  expect(env.asset.texture).toBeInstanceOf(Texture);
  expect(env.asset.texture.image).toBe(env.image);
  expect(env.asset.texture.colorSpace).toBe(SRGBColorSpace);
  expect(env.asset.texture.flipY).toBe(false);
  expect(env.asset.texture.version).toBe(1);
  expect(env.decode).toHaveBeenCalledWith(expect.any(Blob), {
    imageOrientation: "flipY",
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  expect(env.decode.mock.contexts[0]).toBe(env.view);
  const gpu = vi.spyOn(env.asset.texture, "dispose");
  env.asset.dispose();
  env.asset.dispose();
  env.dispose();
  expect(gpu).toHaveBeenCalledTimes(1);
  expect(env.image.close).toHaveBeenCalledTimes(1);
});

test("explicit data/linear color spaces and no flip are configured per task", async () => {
  for (const colorSpace of [NoColorSpace, LinearSRGBColorSpace]) {
    const env = await loaded({ colorSpace, flipY: false });
    expect(env.asset.texture.colorSpace).toBe(colorSpace);
    expect(env.decode.mock.calls[0]![1]!.imageOrientation).toBe("none");
    env.dispose();
    vi.restoreAllMocks();
  }
});

test("configuration is snapshotted before asynchronous transport", async () => {
  const env = fixture();
  const requests = transport();
  const options: LoadTextureOptions = { flipY: false, colorSpace: NoColorSpace };
  const promise = loadTexture(env.app, "/image", options);
  options.flipY = true;
  options.colorSpace = SRGBColorSpace;
  requests[0]!.resolve(new ArrayBuffer(1));
  const asset = await promise;
  expect(asset.texture.colorSpace).toBe(NoColorSpace);
  expect(env.decode.mock.calls[0]![1]!.imageOrientation).toBe("none");
  env.dispose();
});

test("invalid input, absent bitmap support and aborted owners reject before transport", async () => {
  const env = fixture();
  const requests = transport();
  await expect(loadTexture(env.app, " ")).rejects.toThrow("non-empty");
  await expect(
    loadTexture(env.app, "/image", { colorSpace: "invalid" as typeof SRGBColorSpace }),
  ).rejects.toThrow("color space");
  Reflect.set(env.view, "createImageBitmap", undefined);
  await expect(loadTexture(env.app, "/image")).rejects.toThrow("createImageBitmap");
  env.dispose();
  await expect(loadTexture(env.app, "/image")).rejects.toMatchObject({ name: "AbortError" });
  expect(requests).toHaveLength(0);
});

test("cancellation before bytes arrive skips decoding and never aborts shared transport", async () => {
  const env = fixture();
  const requests = transport();
  const controller = new AbortController();
  const promise = loadTexture(env.app, "/image", { signal: controller.signal });
  const abort = vi.spyOn(requests[0]!.manager, "abort");
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejected;
  requests[0]!.resolve(new ArrayBuffer(1));
  expect(env.decode).not.toHaveBeenCalled();
  expect(abort).not.toHaveBeenCalled();
  env.dispose();
});

test("late bitmap after cancellation is closed once and is never transferred to an asset", async () => {
  const env = fixture();
  const requests = transport();
  const controller = new AbortController();
  let resolve: (image: ImageBitmap) => void = () => {};
  env.decode.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const promise = loadTexture(env.app, "/image", { signal: controller.signal });
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  requests[0]!.resolve(new ArrayBuffer(1));
  controller.abort();
  await rejected;
  const gpu = vi.spyOn(Texture.prototype, "dispose");
  resolve(env.image);
  await Promise.resolve();
  expect(env.image.close).toHaveBeenCalledTimes(1);
  expect(gpu).not.toHaveBeenCalled();
  env.dispose();
});

test("host or resource scope destruction consumes a late decoded image", async () => {
  const env = fixture();
  const requests = transport();
  let resolve: (image: ImageBitmap) => void = () => {};
  env.decode.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const promise = loadTexture(env.app, "/image");
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  requests[0]!.resolve(new ArrayBuffer(1));
  env.resources.dispose();
  await rejected;
  resolve(env.image);
  await Promise.resolve();
  expect(env.image.close).toHaveBeenCalledTimes(1);
});

test("two same-URL tasks independently decode shared bytes and disposing one cannot close the other image", async () => {
  const env = fixture();
  const requests = transport();
  const secondImage = bitmap();
  env.decode.mockResolvedValueOnce(env.image).mockResolvedValueOnce(secondImage);
  const first = loadTexture(env.app, "/same");
  const second = loadTexture(env.app, "/same", { flipY: false });
  const bytes = new ArrayBuffer(2);
  requests[0]!.resolve(bytes);
  requests[1]!.resolve(bytes);
  const a = await first;
  const b = await second;
  expect(a.texture).not.toBe(b.texture);
  expect(a.texture.image).not.toBe(b.texture.image);
  a.dispose();
  expect(secondImage.close).not.toHaveBeenCalled();
  env.dispose();
  expect(secondImage.close).toHaveBeenCalledTimes(1);
});

test("transport and decoding errors reject without leaked task state and permit retries", async () => {
  const env = fixture();
  const requests = transport();
  const failure = new Error("transport");
  const first = loadTexture(env.app, "/image");
  const rejected = expect(first).rejects.toBe(failure);
  requests[0]!.reject(failure);
  await rejected;
  env.decode.mockRejectedValueOnce(new Error("decode"));
  const second = loadTexture(env.app, "/image");
  const decodeFailure = expect(second).rejects.toThrow("decode");
  requests[1]!.resolve(new ArrayBuffer(1));
  await decodeFailure;
  const third = loadTexture(env.app, "/image");
  requests[2]!.resolve(new ArrayBuffer(1));
  expect((await third).disposed).toBe(false);
  env.dispose();
});

test("late decode rejection after cancellation is consumed without unhandled rejection", async () => {
  const env = fixture();
  const requests = transport();
  let reject: (error: unknown) => void = () => {};
  env.decode.mockReturnValue(
    new Promise((_resolve, fail) => {
      reject = fail;
    }),
  );
  const promise = loadTexture(env.app, "/image");
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  requests[0]!.resolve(new ArrayBuffer(1));
  env.dispose();
  await rejected;
  reject(new Error("late decoder"));
  await Promise.resolve();
  expect(env.image.close).not.toHaveBeenCalled();
});

test("late cleanup errors reach the reporter after the cancellation promise has settled", async () => {
  const env = fixture();
  const requests = transport();
  const report = vi.fn();
  const failure = new Error("close");
  vi.mocked(env.image.close).mockImplementation(() => {
    throw failure;
  });
  const promise = loadTexture(env.app, "/image", { onCleanupError: report });
  const rejected = expect(promise).rejects.toMatchObject({ name: "AbortError" });
  requests[0]!.resolve(new ArrayBuffer(1));
  env.dispose();
  await rejected;
  await Promise.resolve();
  expect(report).toHaveBeenCalledWith(failure);
  expect(env.image.close).toHaveBeenCalledTimes(1);
});

test("consumer detach hooks run before GPU and bitmap cleanup; all cleanup stages run despite errors", async () => {
  const env = await loaded();
  const order: string[] = [];
  env.asset.resources.track({
    dispose(): void {
      order.push("detach");
      throw new Error("detach");
    },
  });
  vi.spyOn(env.asset.texture, "dispose").mockImplementation(() => {
    order.push("gpu");
    throw new Error("GPU");
  });
  vi.mocked(env.image.close).mockImplementation(() => {
    order.push("bitmap");
  });
  expect(() => env.asset.dispose()).toThrow(AggregateError);
  expect(order).toEqual(["detach", "gpu", "bitmap"]);
  env.asset.dispose();
  expect(order).toHaveLength(3);
  env.dispose();
});

test("cleanup owns the original bitmap snapshot and leaves an externally substituted image borrowed", async () => {
  const env = await loaded();
  const foreign = bitmap();
  env.asset.texture.image = foreign;
  env.asset.dispose();
  expect(env.image.close).toHaveBeenCalledTimes(1);
  expect(foreign.close).not.toHaveBeenCalled();
  env.dispose();
});

test("progress has nullable totals, and progress callback errors reject before late decoding", async () => {
  const env = fixture();
  const requests = transport();
  const progress = vi.fn();
  const promise = loadTexture(env.app, "/image", { onProgress: progress });
  requests[0]!.progress({ loaded: 2, total: 0, lengthComputable: false } as ProgressEvent);
  requests[0]!.progress({ loaded: 4, total: 8, lengthComputable: true } as ProgressEvent);
  expect(progress.mock.calls).toEqual([
    [{ loaded: 2, total: null, ratio: null }],
    [{ loaded: 4, total: 8, ratio: 0.5 }],
  ]);
  requests[0]!.resolve(new ArrayBuffer(1));
  (await promise).dispose();
  const error = new Error("progress");
  const bad = loadTexture(env.app, "/image", {
    onProgress: () => {
      throw error;
    },
  });
  const rejected = expect(bad).rejects.toBe(error);
  requests[1]!.progress({} as ProgressEvent);
  await rejected;
  requests[1]!.resolve(new ArrayBuffer(1));
  expect(env.decode).toHaveBeenCalledTimes(1);
  env.dispose();
});
