import { afterEach, expect, test, vi } from "vite-plus/test";
import { Color, PMREMGenerator, Scene, WebGLCubeRenderTarget, NoToneMapping } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ResourceScope } from "../src/core/resources.ts";
import { attachEnvironment, createRoomEnvironment } from "../src/environment.ts";
import { renderWithRetirement, retireAfterRender } from "../src/core/render-retirement.ts";
import type { AnyThreeApp } from "../src/core/three-app.ts";
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
  vi.restoreAllMocks();
});
function fixture() {
  const resources = new ResourceScope(),
    controller = new AbortController();
  const original = new WebGLCubeRenderTarget(16);
  let target: WebGLCubeRenderTarget | null = original,
    face = 2,
    mip = 1,
    clear = new Color(0x123456),
    alpha = 0.3;
  const renderer = {
    autoClear: false,
    autoClearColor: false,
    autoClearDepth: false,
    autoClearStencil: false,
    xr: { enabled: true },
    toneMapping: NoToneMapping,
    toneMappingExposure: 1.7,
    getRenderTarget: () => target,
    getActiveCubeFace: () => face,
    getActiveMipmapLevel: () => mip,
    getClearColor: (value: Color) => value.copy(clear),
    getClearAlpha: () => alpha,
    setClearColor: (value: Color, a: number) => {
      clear = value.clone();
      alpha = a;
    },
    setRenderTarget: (value: WebGLCubeRenderTarget | null, f = 0, m = 0) => {
      target = value;
      face = f;
      mip = m;
    },
  };
  const value = {
    resources,
    renderer,
    state: "ready",
    signal: controller.signal,
    scene: new Scene(),
  };
  cleanup.push(() => {
    resources.dispose();
    original.dispose();
  });
  const output = new WebGLCubeRenderTarget(256),
    release = vi.spyOn(output, "dispose");
  const generate = vi.spyOn(PMREMGenerator.prototype, "fromScene").mockImplementation(() => {
    renderer.setRenderTarget(output, 4, 3);
    renderer.autoClear = true;
    renderer.xr.enabled = false;
    renderer.toneMappingExposure = 8;
    renderer.setClearColor(new Color(0), 1);
    return output;
  });
  const generatorRelease = vi.spyOn(PMREMGenerator.prototype, "dispose");
  const roomRelease = vi.spyOn(RoomEnvironment.prototype, "dispose");
  return {
    ...value,
    original,
    output,
    release,
    generate,
    generatorRelease,
    roomRelease,
    app: value as unknown as AnyThreeApp,
  };
}
test("Room uses native PMREM with Editor blur and restores all captured renderer state", () => {
  const e = fixture(),
    room = createRoomEnvironment(e.app);
  expect(e.generate).toHaveBeenCalledWith(expect.any(RoomEnvironment), 0.04, 0.1, 100, {
    size: 256,
  });
  expect(e.renderer.getRenderTarget()).toBe(e.original);
  expect(e.renderer.getActiveCubeFace()).toBe(2);
  expect(e.renderer.getActiveMipmapLevel()).toBe(1);
  expect(e.renderer.autoClear).toBe(false);
  expect(e.renderer.xr.enabled).toBe(true);
  expect(e.renderer.toneMappingExposure).toBe(1.7);
  expect(e.renderer.getClearColor(new Color()).getHex()).toBe(0x123456);
  expect(e.renderer.getClearAlpha()).toBe(0.3);
  expect(e.generatorRelease).toHaveBeenCalledOnce();
  expect(e.roomRelease).toHaveBeenCalledOnce();
  expect(e.scene.environment).toBeNull();
  const binding = attachEnvironment(e.app, room, { background: true, intensity: 2 });
  expect(e.scene.environment).toBe(e.output.texture);
  expect(e.scene.background).toBe(e.output.texture);
  room.dispose();
  room.dispose();
  expect(binding.disposed).toBe(true);
  expect(e.scene.environment).toBeNull();
  expect(e.scene.background).toBeNull();
  expect(e.scene.environmentIntensity).toBe(1);
  expect(e.release).toHaveBeenCalledOnce();
});
test("generation failures restore state and release temporary native scene and generator", () => {
  const e = fixture();
  e.generate.mockImplementation(() => {
    e.renderer.autoClear = true;
    e.renderer.xr.enabled = false;
    e.renderer.setRenderTarget(null);
    throw new Error("generation failed");
  });
  expect(() => createRoomEnvironment(e.app)).toThrow("preparation failed");
  expect(e.renderer.getRenderTarget()).toBe(e.original);
  expect(e.renderer.autoClear).toBe(false);
  expect(e.renderer.xr.enabled).toBe(true);
  expect(e.generatorRelease).toHaveBeenCalledOnce();
  expect(e.roomRelease).toHaveBeenCalledOnce();
  e.output.dispose();
});
test("ending the owner during generation releases the returned cube target", () => {
  const e = fixture();
  e.generate.mockImplementation(() => {
    e.resources.dispose();
    return e.output;
  });
  expect(() => createRoomEnvironment(e.app)).toThrow("preparation failed");
  expect(e.release).toHaveBeenCalledOnce();
});
test("room target disposal waits for the active draw to finish", () => {
  const e = fixture(),
    room = createRoomEnvironment(e.app);
  attachEnvironment(e.app, room);
  renderWithRetirement(e.renderer, () => {
    room.dispose();
    expect(e.scene.environment).toBeNull();
    expect(e.release).not.toHaveBeenCalled();
  });
  expect(e.release).toHaveBeenCalledOnce();
});
test("invalid configuration and draw-time generation never enter native PMREM", () => {
  const e = fixture();
  for (const options of [{ sigma: NaN }, { sigma: -1 }, { size: 128 }, { size: 300 }])
    expect(() => createRoomEnvironment(e.app, options)).toThrow();
  renderWithRetirement(e.renderer, () =>
    expect(() => createRoomEnvironment(e.app)).toThrow("outside a draw"),
  );
  expect(e.generate).not.toHaveBeenCalled();
  e.output.dispose();
});

test("a draw-retirement failure still releases the native returned target", () => {
  const e = fixture();
  e.generate.mockImplementation(() => {
    retireAfterRender(e.renderer, () => {
      throw new Error("retirement failed");
    });
    return e.output;
  });
  expect(() => createRoomEnvironment(e.app)).toThrow("preparation failed");
  expect(e.release).toHaveBeenCalledOnce();
  expect(e.generatorRelease).toHaveBeenCalledOnce();
});
