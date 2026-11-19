import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  Box3,
  Color,
  LineCurve3,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  Vector4,
} from "three";
import { RenderPipeline as NativePipeline } from "three/webgpu";
import { PMREMGenerator, CubeRenderTarget } from "three/webgpu";
import type { RenderTarget } from "three";
import { ResourceScope } from "../src/core/resources.ts";
import type { SceneApp, RenderPipeline } from "../src/index.ts";
import { installWebGPUFeatures } from "../src/core/webgpu-features.ts";
import { webGPUFeatures } from "../src/webgpu/features.ts";
import { renderWithRetirement } from "../src/core/render-retirement.ts";
import { attachPostprocessing } from "../src/postprocessing.ts";
import { attachFlyPoints, attachRadar, attachShield } from "../src/effects.ts";
import { attachShadowLight } from "../src/lighting.ts";
import type { FrameInfo } from "../src/index.ts";
import { createRoomEnvironment, attachEnvironment } from "../src/environment.ts";

const scopes: ResourceScope[] = [];
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.dispose();
  vi.restoreAllMocks();
});
function fixture() {
  installWebGPUFeatures(webGPUFeatures);
  const resources = new ResourceScope();
  scopes.push(resources);
  let pipeline: RenderPipeline | undefined;
  let target: RenderTarget | null = null;
  let ratio = 2,
    clear = new Color(0x123456),
    alpha = 0.6;
  const updates = new Set<(frame: FrameInfo) => void>();
  const renderer = {
    isWebGPURenderer: true,
    toneMapping: NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: SRGBColorSpace,
    autoClear: true,
    autoClearColor: true,
    autoClearDepth: true,
    autoClearStencil: true,
    opaque: true,
    transparent: true,
    shadowMap: { enabled: false, type: 1, transmitted: false },
    xr: { enabled: true },
    getRenderTarget: () => target,
    setRenderTarget: (value: RenderTarget | null) => {
      target = value;
    },
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    getRenderObjectFunction: () => null,
    setRenderObjectFunction: vi.fn(),
    getPixelRatio: () => ratio,
    setPixelRatio: (value: number) => {
      ratio = value;
    },
    getMRT: () => null,
    setMRT: vi.fn(),
    getClearColor: (value: Color) => value.copy(clear),
    getClearAlpha: () => alpha,
    setClearColor: (value: Color, opacity: number) => {
      clear = value.clone();
      alpha = opacity;
    },
    getScissorTest: () => false,
    setScissorTest: vi.fn(),
    getViewport: (value: Vector4) => value.set(0, 0, 640, 360),
  };
  const value = {
    state: "ready",
    signal: new AbortController().signal,
    resources,
    renderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    size: { width: 640, height: 360, pixelRatio: 2 },
    onUpdate(fn: (frame: FrameInfo) => void) {
      updates.add(fn);
      return () => {
        updates.delete(fn);
      };
    },
    setRenderPipeline(next: RenderPipeline) {
      if (pipeline) throw new Error("already attached");
      pipeline = next;
      next.resize(value.size);
      return () => {
        if (pipeline === next) pipeline = undefined;
      };
    },
  };
  return {
    app: value as unknown as SceneApp,
    value,
    renderer,
    updates,
    draw() {
      renderWithRetirement(renderer, () => pipeline?.render({ delta: 0.1, elapsed: 0.1 }));
    },
    get pipeline() {
      return pipeline;
    },
  };
}

test("node graphs share validation, exclusive pipeline leases and atomic configure", () => {
  const e = fixture();
  expect(() => attachPostprocessing(e.app, { bloom: { radius: 2 } })).toThrow();
  const h = attachPostprocessing(e.app, {
    bloom: { strength: 2 },
    outline: {},
    colorAdjustment: {},
  });
  expect(h.bloom?.strength).toMatchObject({ value: 2 });
  expect(() => attachPostprocessing(e.app, { bloom: {} })).toThrow("already attached");
  h.configure({ bloom: { strength: 3 } });
  expect(h.bloom?.strength).toMatchObject({ value: 3 });
  expect(() => h.configure({ bloom: { strength: 5 }, outline: { edgeThickness: 8 } })).toThrow();
  expect(h.bloom?.strength).toMatchObject({ value: 3 });
  h.dispose();
  expect(e.pipeline).toBeUndefined();
  expect(() => h.configure({ bloom: {} })).toThrow("disposed");
  const onlyBloom = attachPostprocessing(e.app, { bloom: {} });
  expect(() => onlyBloom.configure({ outline: {} })).toThrow("requested at attachment");
});

test("node attachment reads effect descriptors once before installing native resources", () => {
  const e = fixture();
  let reads = 0;
  const h = attachPostprocessing(e.app, {
    get bloom() {
      reads++;
      return reads === 1 ? { strength: 2 } : { radius: 9 };
    },
  });
  expect(reads).toBe(1);
  expect(h.bloom?.strength).toMatchObject({ value: 2 });
});

test("native graph errors restore scene and renderer state; configuration and disposal retire after draw", () => {
  const e = fixture(),
    h = attachPostprocessing(e.app, { bloom: { strength: 2 }, outline: {} });
  const dispose = vi.spyOn(NativePipeline.prototype, "dispose");
  const draw = vi.spyOn(NativePipeline.prototype, "render").mockImplementation(() => {
    h.configure({ bloom: { strength: 3 } });
    expect(h.bloom?.strength).toMatchObject({ value: 2 });
    e.value.scene.background = new Color(0xff0000);
    e.renderer.toneMappingExposure = 8;
    e.renderer.autoClear = false;
    throw new Error("native draw failed");
  });
  expect(() => e.draw()).toThrow("native draw failed");
  expect(e.value.scene.background).toBeNull();
  expect(e.renderer.toneMappingExposure).toBe(1);
  expect(e.renderer.autoClear).toBe(true);
  expect(h.bloom?.strength).toMatchObject({ value: 3 });
  draw.mockImplementation(() => {
    h.dispose();
    expect(dispose).not.toHaveBeenCalled();
  });
  e.draw();
  expect(dispose).toHaveBeenCalledOnce();
  h.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});

test("GPU fly points own instanced quads and share host clock, seek, scope and deferred geometry cleanup", () => {
  const e = fixture(),
    scope = new ResourceScope();
  const h = attachFlyPoints(e.app, {
    curve: new LineCurve3(new Vector3(), new Vector3(2, 1, 0)),
    count: 32,
    size: 12,
    scope,
  });
  const geometry = h.points.geometry,
    material = h.points.material;
  expect(geometry).toHaveProperty("isInstancedBufferGeometry", true);
  expect(geometry.getAttribute("aCenter").count).toBe(32);
  expect(material).toHaveProperty("isPointsNodeMaterial", true);
  const disposeGeometry = vi.spyOn(geometry, "dispose"),
    disposeMaterial = vi.spyOn(material, "dispose");
  const tick = () => {
    for (const update of e.updates) update({ delta: 0.2, elapsed: 0.2 });
  };
  tick();
  expect(h.phase).toBeCloseTo(0.05);
  h.pause();
  tick();
  expect(h.phase).toBeCloseTo(0.05);
  h.seek(0.6);
  h.setSpeed(0.5);
  h.resume();
  tick();
  expect(h.phase).toBeCloseTo(0.7);
  renderWithRetirement(e.renderer, () => {
    scope.dispose();
    expect(disposeGeometry).not.toHaveBeenCalled();
  });
  expect(h.disposed).toBe(true);
  expect(e.updates.size).toBe(0);
  expect(disposeGeometry).toHaveBeenCalledOnce();
  expect(disposeMaterial).toHaveBeenCalledOnce();
  expect(() => h.seek(0)).toThrow("disposed");
});

test("node effects retain separate material graphs and phase state across hosts", () => {
  const a = fixture(),
    b = fixture(),
    first = attachRadar(a.app),
    second = attachShield(b.app);
  expect(first.mesh.material).toHaveProperty("isMeshBasicNodeMaterial", true);
  expect(second.mesh.material).not.toBe(first.mesh.material);
  a.value.resources.dispose();
  expect(first.disposed).toBe(true);
  expect(second.disposed).toBe(false);
  second.seek(0.7);
  expect(second.phase).toBe(0.7);
});

test("node shadows use per-light updates and native light disposal without WebGL-only settings", () => {
  const e = fixture();
  const h = attachShadowLight(e.app, {
    bounds: new Box3(new Vector3(-2, -1, -2), new Vector3(2, 2, 2)),
    mapSize: 256,
    autoUpdate: false,
    type: "vsm",
  });
  expect(h.light.shadow.autoUpdate).toBe(false);
  expect(e.renderer.shadowMap).not.toHaveProperty("autoUpdate");
  expect(e.renderer.shadowMap).not.toHaveProperty("needsUpdate");
  const dispose = vi.spyOn(h.light, "dispose");
  h.light.shadow.needsUpdate = false;
  h.requestUpdate();
  expect(h.light.shadow.needsUpdate).toBe(true);
  renderWithRetirement(e.renderer, () => {
    h.dispose();
    expect(dispose).not.toHaveBeenCalled();
  });
  expect(dispose).toHaveBeenCalledOnce();
  expect(e.value.scene.children).toHaveLength(0);
  expect(e.renderer.shadowMap.enabled).toBe(false);
});

test("node Room generation restores renderer settings and owns targets independently of bindings", () => {
  const e = fixture(),
    target = new CubeRenderTarget(256);
  const dispose = vi.spyOn(target, "dispose");
  vi.spyOn(PMREMGenerator.prototype, "fromScene").mockImplementation(() => {
    e.renderer.toneMappingExposure = 9;
    e.renderer.autoClear = false;
    return target;
  });
  const generatorDispose = vi.spyOn(PMREMGenerator.prototype, "dispose");
  const asset = createRoomEnvironment(e.app);
  const binding = attachEnvironment(e.app, asset, { background: true });
  expect(e.renderer.toneMappingExposure).toBe(1);
  expect(e.renderer.autoClear).toBe(true);
  expect(generatorDispose).toHaveBeenCalledOnce();
  expect(e.value.scene.environment).toBe(target.texture);
  asset.dispose();
  expect(binding.disposed).toBe(true);
  expect(e.value.scene.environment).toBeNull();
  expect(dispose).toHaveBeenCalledOnce();
});

test("failed node Room cleanup releases the produced target and never delivers an asset", () => {
  const e = fixture(),
    target = new CubeRenderTarget(256),
    dispose = vi.spyOn(target, "dispose");
  vi.spyOn(PMREMGenerator.prototype, "fromScene").mockReturnValue(target);
  vi.spyOn(PMREMGenerator.prototype, "dispose").mockImplementation(() => {
    throw new Error("native cleanup");
  });
  expect(() => createRoomEnvironment(e.app)).toThrow(AggregateError);
  expect(dispose).toHaveBeenCalledOnce();
  expect(e.value.scene.environment).toBeNull();
});
