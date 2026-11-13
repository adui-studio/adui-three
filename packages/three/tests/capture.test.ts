import { expect, test, vi } from "vite-plus/test";
import { captureFrame } from "../src/capture.ts";
import type { CaptureRegion } from "../src/capture.ts";
import { ResourceScope } from "../src/resources.ts";
import type { ThreeApp, ThreeAppState } from "../src/three-app.ts";

function fixture() {
  const controller = new AbortController();
  const surfaces: Array<{
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toBlob: ReturnType<typeof vi.fn>;
    draw: ReturnType<typeof vi.fn>;
  }> = [];
  const requests: Array<{ callback: BlobCallback; type?: string; quality?: number }> = [];
  const document = {
    hidden: false,
    createElement: vi.fn(() => {
      const draw = vi.fn();
      const surface = {
        width: 300,
        height: 150,
        draw,
        getContext: vi.fn(() => ({ drawImage: draw })),
        toBlob: vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
          requests.push({ callback, type, quality });
        }),
      };
      surfaces.push(surface);
      return surface as unknown as HTMLCanvasElement;
    }),
  };
  const source = { width: 1200, height: 680, ownerDocument: document };
  const gl = { isContextLost: vi.fn(() => false) };
  const target = vi.fn<() => object | null>(() => null);
  const render = vi.fn(() => true);
  const value = {
    state: "stopped" as ThreeAppState,
    size: { width: 600, height: 340, pixelRatio: 2 },
    resources: new ResourceScope(),
    signal: controller.signal,
    renderer: { domElement: source, getContext: () => gl, getRenderTarget: target },
    render,
  };
  return {
    app: value as unknown as ThreeApp,
    value,
    source,
    document,
    controller,
    surfaces,
    requests,
    render,
    gl,
    target,
    dispose(): void {
      value.state = "disposed";
      controller.abort();
      value.resources.dispose();
    },
  };
}

test("capture draws once and snapshots the actual buffer synchronously before native encoding", async () => {
  const env = fixture();
  const promise = captureFrame(env.app);
  expect(env.render).toHaveBeenCalledOnce();
  expect(env.document.createElement).toHaveBeenCalledExactlyOnceWith("canvas");
  const surface = env.surfaces[0]!;
  expect([surface.width, surface.height]).toEqual([1200, 680]);
  expect(surface.draw).toHaveBeenCalledExactlyOnceWith(env.source, 0, 0);
  expect(env.render.mock.invocationCallOrder[0]).toBeLessThan(
    surface.draw.mock.invocationCallOrder[0]!,
  );
  const image = new Blob(["encoded"], { type: "image/png" });
  env.requests[0]!.callback(image);
  expect(await promise).toBe(image);
  expect([surface.width, surface.height]).toEqual([0, 0]);
  expect(env.value.state).toBe("stopped");
  expect(env.value.resources.disposed).toBe(false);
});

test("encoding options snapshot primitives and return the browser's actual MIME fallback", async () => {
  const env = fixture();
  const options = { type: "image/webp" as const, quality: 0.8 };
  const promise = captureFrame(env.app, options);
  options.quality = 0.1;
  expect(env.requests[0]).toMatchObject({ type: "image/webp", quality: 0.8 });
  const fallback = new Blob(["png"], { type: "image/png" });
  env.requests[0]!.callback(fallback);
  expect((await promise).type).toBe("image/png");
});

test("an interrupted draw rejects instead of encoding stale canvas pixels and can be retried", async () => {
  const env = fixture();
  env.render.mockImplementationOnce(() => false);
  const result = captureFrame(env.app).catch((error: unknown) => error);
  try {
    expect(env.document.createElement).not.toHaveBeenCalled();
    expect(await result).toEqual(new Error("Capture requires a completed draw"));
    const retry = captureFrame(env.app);
    const blob = new Blob(["retry"]);
    env.requests[0]!.callback(blob);
    expect(await retry).toBe(blob);
  } finally {
    env.dispose();
    await result;
  }
});

test("invalid options and hidden/zero/offscreen/lost inputs reject before drawing or allocating", async () => {
  const env = fixture();
  for (const quality of [-1, 1.1, NaN, Infinity])
    await expect(captureFrame(env.app, { quality })).rejects.toBeInstanceOf(RangeError);
  await expect(
    captureFrame(env.app, { type: "image/svg+xml" as "image/png" }),
  ).rejects.toBeInstanceOf(TypeError);
  env.document.hidden = true;
  await expect(captureFrame(env.app)).rejects.toThrow("visible");
  env.document.hidden = false;
  env.value.size.width = 0;
  await expect(captureFrame(env.app)).rejects.toThrow("nonzero");
  env.value.size.width = 600;
  env.gl.isContextLost.mockReturnValue(true);
  await expect(captureFrame(env.app)).rejects.toThrow("WebGL");
  env.gl.isContextLost.mockReturnValue(false);
  env.target.mockReturnValue({});
  await expect(captureFrame(env.app)).rejects.toThrow("default canvas");
  expect(env.render).not.toHaveBeenCalled();
  expect(env.document.createElement).not.toHaveBeenCalled();
});

test("pre-cancelled and ended owners allocate nothing", async () => {
  for (const mode of ["signal", "host", "scope"] as const) {
    const env = fixture();
    const signal = new AbortController();
    if (mode === "signal") signal.abort();
    if (mode === "host") env.dispose();
    if (mode === "scope") env.value.resources.dispose();
    await expect(captureFrame(env.app, { signal: signal.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(env.render).not.toHaveBeenCalled();
    expect(env.document.createElement).not.toHaveBeenCalled();
  }
});

test("logical cancellation releases the snapshot and ignores a late encoder result", async () => {
  const env = fixture();
  const controller = new AbortController();
  const remove = vi.spyOn(controller.signal, "removeEventListener");
  const untrack = vi.spyOn(env.value.resources, "untrack");
  const promise = captureFrame(env.app, { signal: controller.signal });
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  expect([env.surfaces[0]!.width, env.surfaces[0]!.height]).toEqual([0, 0]);
  env.requests[0]!.callback(new Blob(["late"]));
  expect(untrack).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
  expect(env.value.resources.disposed).toBe(false);
});

test("host and independently ended scopes cancel pending encodes immediately", async () => {
  for (const scopeOnly of [false, true]) {
    const env = fixture();
    const promise = captureFrame(env.app);
    if (scopeOnly) env.value.resources.dispose();
    else env.dispose();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    env.requests[0]!.callback(null);
    expect(env.surfaces[0]!.width).toBe(0);
  }
});

test("disposal or cancellation from render completion never creates an encoding canvas", async () => {
  for (const owner of [false, true]) {
    const env = fixture();
    const controller = new AbortController();
    env.render.mockImplementation(() => {
      if (owner) env.dispose();
      else controller.abort();
      return true;
    });
    await expect(captureFrame(env.app, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(env.document.createElement).not.toHaveBeenCalled();
  }
});

test("render errors and availability changes pass through without starting an encoder", async () => {
  const env = fixture();
  const error = new Error("Cannot render reentrantly");
  env.render.mockImplementationOnce(() => {
    throw error;
  });
  await expect(captureFrame(env.app)).rejects.toBe(error);
  env.render.mockImplementationOnce(() => {
    env.document.hidden = true;
    return true;
  });
  await expect(captureFrame(env.app)).rejects.toThrow("visible");
  expect(env.requests).toHaveLength(0);
  expect(env.document.createElement).not.toHaveBeenCalled();
});

test("missing 2D context and draw errors release the detached surface and pending ownership", async () => {
  for (const phase of ["context", "draw"] as const) {
    const env = fixture();
    const native = env.document.createElement.getMockImplementation()!;
    const error = new Error("draw failed");
    env.document.createElement.mockImplementation(() => {
      const canvas = native();
      const surface = env.surfaces[0]!;
      if (phase === "context") surface.getContext.mockReturnValue(null);
      else
        surface.draw.mockImplementation(() => {
          throw error;
        });
      return canvas;
    });
    const promise = captureFrame(env.app);
    if (phase === "context") await expect(promise).rejects.toThrow("2D");
    else await expect(promise).rejects.toBe(error);
    expect([env.surfaces[0]!.width, env.surfaces[0]!.height]).toEqual([0, 0]);
    expect(env.requests).toHaveLength(0);
  }
});

test("native encoding null/throw errors are preserved and a later capture succeeds", async () => {
  const env = fixture();
  const promise = captureFrame(env.app);
  env.requests[0]!.callback(null);
  await expect(promise).rejects.toThrow("no image");
  const native = env.document.createElement.getMockImplementation()!;
  const denied = new DOMException("Origin is not clean", "SecurityError");
  env.document.createElement.mockImplementationOnce(() => {
    const canvas = native();
    env.surfaces.at(-1)!.toBlob.mockImplementation(() => {
      throw denied;
    });
    return canvas;
  });
  await expect(captureFrame(env.app)).rejects.toBe(denied);
  const next = captureFrame(env.app);
  const blob = new Blob(["ok"]);
  env.requests.at(-1)!.callback(blob);
  expect(await next).toBe(blob);
});

test("cleanup failures still clear both dimensions, listeners and the pending registration", async () => {
  const env = fixture();
  const untrack = vi.spyOn(env.value.resources, "untrack");
  const promise = captureFrame(env.app);
  Object.defineProperty(env.surfaces[0]!, "width", {
    configurable: true,
    set: () => {
      throw new Error("release failed");
    },
  });
  env.requests[0]!.callback(null);
  await expect(promise).rejects.toMatchObject({ errors: [expect.any(Error), expect.any(Error)] });
  expect(env.surfaces[0]!.height).toBe(0);
  expect(untrack).toHaveBeenCalledOnce();
});

test("concurrent captures own independent surfaces and cancellation does not settle a sibling", async () => {
  const env = fixture();
  const controller = new AbortController();
  const first = captureFrame(env.app, { signal: controller.signal });
  env.source.width = 900;
  const second = captureFrame(env.app, { type: "image/jpeg", quality: 0 });
  expect(env.surfaces[0]!.width).toBe(1200);
  expect(env.surfaces[1]!.width).toBe(900);
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  expect(env.surfaces[1]!.width).toBe(900);
  const image = new Blob(["jpeg"], { type: "image/jpeg" });
  env.requests[1]!.callback(image);
  expect(await second).toBe(image);
  expect(env.requests[1]).toMatchObject({ type: "image/jpeg", quality: 0 });
});

test("a draw callback ending the owner does not submit an encoder afterwards", async () => {
  const env = fixture();
  const native = env.document.createElement.getMockImplementation()!;
  env.document.createElement.mockImplementation(() => {
    const canvas = native();
    env.surfaces[0]!.draw.mockImplementation(() => env.dispose());
    return canvas;
  });
  await expect(captureFrame(env.app)).rejects.toMatchObject({ name: "AbortError" });
  expect(env.requests).toHaveLength(0);
  expect(env.surfaces[0]!.width).toBe(0);
});

test("region captures copy exact pixel coordinates and snapshot values before drawing", async () => {
  const env = fixture();
  const region = { x: 123, y: 45, width: 301, height: 207 };
  env.render.mockImplementation(() => {
    region.x = 900;
    region.width = 100;
    return true;
  });
  const promise = captureFrame(env.app, { region });
  const surface = env.surfaces[0]!;
  expect([surface.width, surface.height]).toEqual([301, 207]);
  expect(surface.draw).toHaveBeenCalledExactlyOnceWith(
    env.source,
    123,
    45,
    301,
    207,
    0,
    0,
    301,
    207,
  );
  const blob = new Blob(["region"], { type: "image/png" });
  env.requests[0]!.callback(blob);
  expect(await promise).toBe(blob);
  expect([surface.width, surface.height]).toEqual([0, 0]);
  expect(env.render).toHaveBeenCalledOnce();
});

test("invalid region values reject before drawing or allocating a surface", async () => {
  const env = fixture();
  for (const region of [null, [], "rectangle", {}, { x: 0, y: 0, width: 1 }])
    await expect(captureFrame(env.app, { region: region as CaptureRegion })).rejects.toThrow();
  for (const field of ["x", "y", "width", "height"] as const) {
    for (const value of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      await expect(
        captureFrame(env.app, { region: { x: 0, y: 0, width: 100, height: 100, [field]: value } }),
      ).rejects.toBeInstanceOf(RangeError);
  }
  for (const field of ["width", "height"] as const)
    await expect(
      captureFrame(env.app, { region: { x: 0, y: 0, width: 100, height: 100, [field]: 0 } }),
    ).rejects.toBeInstanceOf(RangeError);
  expect(env.render).not.toHaveBeenCalled();
  expect(env.document.createElement).not.toHaveBeenCalled();
});

test("out-of-bounds regions reject after the final draw without allocating or leaking ownership", async () => {
  const env = fixture();
  const untrack = vi.spyOn(env.value.resources, "untrack");
  for (const region of [
    { x: 1200, y: 0, width: 1, height: 1 },
    { x: 1199, y: 0, width: 2, height: 1 },
    { x: 0, y: 680, width: 1, height: 1 },
    { x: Number.MAX_SAFE_INTEGER, y: 0, width: Number.MAX_SAFE_INTEGER, height: 1 },
  ])
    await expect(captureFrame(env.app, { region })).rejects.toThrow("rendered drawing buffer");
  expect(env.render).toHaveBeenCalledTimes(4);
  expect(untrack).toHaveBeenCalledTimes(4);
  expect(env.document.createElement).not.toHaveBeenCalled();
  // The right and bottom edges are inclusive boundaries for the rectangle's extent.
  const valid = captureFrame(env.app, { region: { x: 1199, y: 679, width: 1, height: 1 } });
  expect([env.surfaces[0]!.width, env.surfaces[0]!.height]).toEqual([1, 1]);
  const blob = new Blob(["one pixel"]);
  env.requests[0]!.callback(blob);
  expect(await valid).toBe(blob);
});

test("region bounds use the drawing buffer after render-time resize and preserve later retries", async () => {
  const env = fixture();
  env.source.width = 100;
  env.render.mockImplementationOnce(() => {
    env.source.width = 1200;
    return true;
  });
  const first = captureFrame(env.app, { region: { x: 1000, y: 0, width: 200, height: 100 } });
  const blob = new Blob(["resized"]);
  env.requests[0]!.callback(blob);
  expect(await first).toBe(blob);
  env.render.mockImplementationOnce(() => {
    env.source.width = 900;
    return true;
  });
  await expect(
    captureFrame(env.app, { region: { x: 1000, y: 0, width: 200, height: 100 } }),
  ).rejects.toThrow("rendered drawing buffer");
  expect(env.surfaces).toHaveLength(1);
  const retry = captureFrame(env.app);
  expect(env.surfaces[1]!.width).toBe(900);
  env.requests[1]!.callback(blob);
  expect(await retry).toBe(blob);
});

test("concurrent regions keep independent encoded sizes and release only the cancelled surface", async () => {
  const env = fixture();
  const controller = new AbortController();
  const first = captureFrame(env.app, {
    signal: controller.signal,
    region: { x: 0, y: 0, width: 200, height: 100 },
  });
  const second = captureFrame(env.app, { region: { x: 400, y: 200, width: 300, height: 250 } });
  controller.abort();
  await expect(first).rejects.toMatchObject({ name: "AbortError" });
  expect([env.surfaces[0]!.width, env.surfaces[0]!.height]).toEqual([0, 0]);
  expect([env.surfaces[1]!.width, env.surfaces[1]!.height]).toEqual([300, 250]);
  env.requests[0]!.callback(new Blob(["late"]));
  const blob = new Blob(["second"]);
  env.requests[1]!.callback(blob);
  expect(await second).toBe(blob);
  expect([env.surfaces[1]!.width, env.surfaces[1]!.height]).toEqual([0, 0]);
});
