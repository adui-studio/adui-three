import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
} from "three";
import type { WebGLRenderTarget } from "three";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import type { Pass } from "three/addons/postprocessing/Pass.js";
import type { RenderPipeline, ThreeApp, ThreeAppState } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";
import { attachBloom, attachPostprocessing } from "../src/postprocessing.ts";

const state = vi.hoisted(() => ({
  instances: [] as EffectComposer[],
  onPass: undefined as ((pass: Pass, index: number) => void) | undefined,
  onSize: undefined as (() => void) | undefined,
  failDispose: false,
}));

// Keep real native pass constructors, materials and targets; replace only GPU execution.
vi.mock("three/addons/postprocessing/EffectComposer.js", () => ({
  EffectComposer: class {
    renderTarget1: WebGLRenderTarget;
    renderTarget2: WebGLRenderTarget;
    passes: Pass[] = [];
    ratio: number;
    constructor(renderer: { getPixelRatio(): number }, target: WebGLRenderTarget) {
      this.renderTarget1 = target;
      this.renderTarget2 = target.clone();
      this.ratio = renderer.getPixelRatio();
      state.instances.push(this as unknown as EffectComposer);
    }
    addPass(pass: Pass): void {
      this.passes.push(pass);
    }
    setPixelRatio = vi.fn((ratio: number) => {
      this.ratio = ratio;
    });
    setSize = vi.fn((width: number, height: number) => {
      state.onSize?.();
      this.renderTarget1.setSize(width * this.ratio, height * this.ratio);
      this.renderTarget2.setSize(width * this.ratio, height * this.ratio);
      for (const pass of this.passes) pass.setSize(width * this.ratio, height * this.ratio);
    });
    render = vi.fn((_delta: number) => {
      for (const [index, pass] of this.passes.entries())
        if (pass.enabled) state.onPass?.(pass, index);
    });
    dispose = vi.fn(() => {
      this.renderTarget1.dispose();
      this.renderTarget2.dispose();
      if (state.failDispose) throw new Error("composer disposal");
    });
  },
}));

const scopes: ResourceScope[] = [];
beforeEach(() => {
  state.instances.length = 0;
  state.onPass = undefined;
  state.onSize = undefined;
  state.failDispose = false;
});
afterEach(() => {
  for (const scope of scopes.splice(0)) {
    try {
      scope.dispose();
    } catch {
      /* Failure behavior is asserted by the individual test. */
    }
  }
});

function fixture(width = 640, height = 360) {
  let pipeline: RenderPipeline | null = null;
  let clearColor = new Color(0x123456);
  let alpha = 0.4;
  let target: WebGLRenderTarget | null = null;
  const resources = new ResourceScope();
  scopes.push(resources);
  const env = {
    state: "ready" as ThreeAppState,
    size: { width, height, pixelRatio: 2 },
    resources,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    renderer: {
      autoClear: true,
      toneMapping: ACESFilmicToneMapping,
      render: vi.fn(),
      getPixelRatio: () => env.size.pixelRatio,
      getRenderTarget: () => target,
      setRenderTarget: vi.fn((value: WebGLRenderTarget | null) => {
        target = value;
      }),
      getClearColor: (value: Color) => value.copy(clearColor),
      getClearAlpha: () => alpha,
      setClearColor: vi.fn((value: Color, opacity: number) => {
        clearColor = value.clone();
        alpha = opacity;
      }),
    },
    setRenderPipeline(value: RenderPipeline): () => void {
      if (pipeline) throw new Error("already attached");
      pipeline = value;
      try {
        value.resize(env.size);
      } catch (error) {
        pipeline = null;
        throw error;
      }
      return () => {
        if (pipeline === value) pipeline = null;
      };
    },
  };
  return {
    app: env as unknown as ThreeApp,
    env,
    get pipeline() {
      return pipeline;
    },
    draw(delta = 0.1): void {
      if (pipeline) pipeline.render({ delta, elapsed: delta });
      else env.renderer.render();
    },
    resize(width: number, height: number, pixelRatio = 2): void {
      env.size = { width, height, pixelRatio };
      pipeline?.resize(env.size);
    },
    close(): void {
      env.state = "disposed";
      resources.dispose();
    },
  };
}

function composer(): EffectComposer {
  return state.instances.at(-1)!;
}

test("creates the native three-pass chain with explicit defaults without starting or drawing", () => {
  const env = fixture();
  const handle = attachBloom(env.app);
  const instance = composer();
  expect(instance.passes.map((pass) => pass.constructor.name)).toEqual([
    "RenderPass",
    "UnrealBloomPass",
    "OutputPass",
  ]);
  expect(handle.pass).toMatchObject({ strength: 1, radius: 0.4, threshold: 0.85, enabled: true });
  expect(vi.spyOn(instance, "render")).not.toHaveBeenCalled();
  expect(instance.renderTarget1.width).toBe(1280);
  expect(instance.renderTarget1.height).toBe(720);
  expect(env.env.renderer.render).not.toHaveBeenCalled();
});

test("forwards exact host delta and keeps native parameter edits and enabled state live", () => {
  const env = fixture();
  const handle = attachBloom(env.app, { enabled: false, strength: 2, radius: 0.8, threshold: 1.5 });
  expect(handle.pass.enabled).toBe(false);
  handle.pass.strength = 3;
  handle.pass.enabled = true;
  env.draw(0);
  env.draw(0.025);
  expect(vi.spyOn(composer(), "render").mock.calls).toEqual([[0], [0.025]]);
  expect(handle.pass.strength).toBe(3);
});

test("invalid options fail before allocating passes or occupying the slot", () => {
  const env = fixture();
  for (const options of [
    { strength: -1 },
    { strength: NaN },
    { radius: 1.1 },
    { radius: -1 },
    { threshold: -1 },
    { threshold: Infinity },
    { enabled: 0 as unknown as boolean },
  ])
    expect(() => attachBloom(env.app, options)).toThrow(RangeError);
  expect(state.instances).toHaveLength(0);
  expect(env.pipeline).toBeNull();
});

test("disposed hosts and scopes reject attachment without allocation", () => {
  for (const mode of ["host", "scope"] as const) {
    const env = fixture();
    if (mode === "host") env.env.state = "disposed";
    else env.env.resources.dispose();
    expect(() => attachBloom(env.app)).toThrow("disposed");
  }
  expect(state.instances).toHaveLength(0);
});

test("tracks changed CSS dimensions and DPR once, while skipping zero-size targets", () => {
  const env = fixture();
  attachBloom(env.app);
  const instance = composer();
  env.resize(640, 360);
  expect(vi.spyOn(instance, "setSize")).toHaveBeenCalledOnce();
  env.resize(320, 240, 1);
  expect(vi.spyOn(instance, "setPixelRatio")).toHaveBeenCalledExactlyOnceWith(1);
  expect(instance.renderTarget1.width).toBe(320);
  env.resize(320, 0, 1);
  expect(vi.spyOn(instance, "setSize")).toHaveBeenCalledTimes(2);
  env.resize(320, 240, 1);
  expect(vi.spyOn(instance, "setSize")).toHaveBeenCalledTimes(3);
});

test("attachment at zero size starts with safe targets and resizes after recovery", () => {
  const env = fixture(0, 0);
  attachBloom(env.app);
  const instance = composer();
  expect(instance.renderTarget1.width).toBe(1);
  expect(vi.spyOn(instance, "setSize")).not.toHaveBeenCalled();
  env.resize(200, 100);
  expect(instance.renderTarget1.width).toBe(400);
  expect(instance.renderTarget1.height).toBe(200);
});

test("manual disposal releases every owned native pass once and restores the raw rendering slot", () => {
  const env = fixture();
  const handle = attachBloom(env.app);
  const instance = composer();
  const passes = instance.passes.map((pass) => vi.spyOn(pass, "dispose"));
  handle.dispose();
  handle.dispose();
  expect(handle.disposed).toBe(true);
  expect(env.pipeline).toBeNull();
  for (const dispose of passes) expect(dispose).toHaveBeenCalledOnce();
  expect(vi.spyOn(instance, "dispose")).toHaveBeenCalledOnce();
  env.draw();
  expect(env.env.renderer.render).toHaveBeenCalledOnce();
  env.close();
  expect(vi.spyOn(instance, "dispose")).toHaveBeenCalledOnce();
});

test("host or resource scope cleanup owns the module and permits later reattachment when still active", () => {
  const env = fixture();
  const first = attachBloom(env.app);
  first.dispose();
  const next = attachBloom(env.app);
  env.close();
  expect(first.disposed).toBe(true);
  expect(next.disposed).toBe(true);
  expect(env.pipeline).toBeNull();
});

test("duplicate pipeline rejection rolls back the new resources without changing the existing module", () => {
  const env = fixture();
  const first = attachBloom(env.app);
  const original = composer();
  expect(() => attachBloom(env.app)).toThrow("already attached");
  expect(vi.spyOn(composer(), "dispose")).toHaveBeenCalledOnce();
  expect(vi.spyOn(original, "dispose")).not.toHaveBeenCalled();
  expect(first.disposed).toBe(false);
  env.draw();
  expect(vi.spyOn(original, "render")).toHaveBeenCalledOnce();
});

test("initial sizing errors roll back the slot and all already-created resources", () => {
  const env = fixture();
  state.onSize = () => {
    throw new Error("size");
  };
  expect(() => attachBloom(env.app)).toThrow("size");
  expect(vi.spyOn(composer(), "dispose")).toHaveBeenCalledOnce();
  expect(env.pipeline).toBeNull();
  state.onSize = undefined;
  attachBloom(env.app).dispose();
});

test("scope disposal during initialization cannot return a live handle or retain the pipeline", () => {
  const env = fixture();
  state.onSize = () => env.env.resources.dispose();
  expect(() => attachBloom(env.app)).toThrow("disposed");
  expect(env.pipeline).toBeNull();
  expect(vi.spyOn(composer(), "dispose")).toHaveBeenCalledOnce();
});

test("disposal during rendering disables later passes and defers GPU cleanup until render returns", () => {
  const env = fixture();
  const handle = attachBloom(env.app);
  const instance = composer();
  const executed: number[] = [];
  state.onPass = (_pass, index) => {
    executed.push(index);
    handle.dispose();
    expect(vi.spyOn(instance, "dispose")).not.toHaveBeenCalled();
  };
  env.draw();
  expect(executed).toEqual([0]);
  expect(vi.spyOn(instance, "dispose")).toHaveBeenCalledOnce();
  expect(env.pipeline).toBeNull();
});

test("render failures restore borrowed renderer state and propagate the original error", () => {
  const env = fixture();
  attachBloom(env.app);
  const failure = new Error("native pass");
  state.onPass = () => {
    env.env.renderer.autoClear = false;
    env.env.renderer.setClearColor(new Color(0xffffff), 1);
    throw failure;
  };
  expect(() => env.draw()).toThrow(failure);
  expect(env.env.renderer.autoClear).toBe(true);
  expect(env.env.renderer.toneMapping).toBe(ACESFilmicToneMapping);
  expect(env.env.renderer.getClearColor(new Color()).getHex()).toBe(0x123456);
  expect(env.env.renderer.getClearAlpha()).toBe(0.4);
  expect(env.env.renderer.setRenderTarget).toHaveBeenLastCalledWith(null);
});

test("cleanup failures aggregate with render errors while still detaching the module", () => {
  const env = fixture();
  const handle = attachBloom(env.app);
  const instance = composer();
  state.failDispose = true;
  state.onPass = () => {
    handle.dispose();
    throw new Error("draw");
  };
  expect(() => env.draw()).toThrow(AggregateError);
  expect(handle.disposed).toBe(true);
  expect(env.pipeline).toBeNull();
  expect(vi.spyOn(instance, "dispose")).toHaveBeenCalledOnce();
  handle.dispose();
});

test("one failed disposer does not prevent cleanup of other resources", () => {
  const env = fixture();
  const handle = attachBloom(env.app);
  const instance = composer();
  vi.spyOn(handle.pass, "dispose").mockImplementation(() => {
    throw new Error("pass disposal");
  });
  expect(() => handle.dispose()).toThrow(AggregateError);
  expect(vi.spyOn(instance, "dispose")).toHaveBeenCalledOnce();
  expect(env.pipeline).toBeNull();
});

test("different hosts keep independent modules, settings and resource lifetimes", () => {
  const a = fixture();
  const b = fixture();
  const first = attachBloom(a.app);
  const second = attachBloom(b.app, { strength: 2 });
  first.dispose();
  expect(second.disposed).toBe(false);
  expect(second.pass.strength).toBe(2);
  expect(b.pipeline).not.toBeNull();
});

test("generic attachment requires at least one effect and validates selection before allocating", () => {
  const env = fixture();
  expect(() => attachPostprocessing(env.app, {})).toThrow("At least one");
  expect(() => attachPostprocessing(env.app, { outline: true as never })).toThrow(TypeError);
  expect(() =>
    attachPostprocessing(env.app, { outline: { selectedObjects: [{} as never] } }),
  ).toThrow(TypeError);
  expect(state.instances).toHaveLength(0);
});

test("outline scalar and hex-color bounds reject invalid input before occupying the slot", () => {
  const env = fixture();
  for (const outline of [
    { edgeStrength: -1 },
    { edgeStrength: NaN },
    { edgeThickness: 0 },
    { edgeThickness: 4.1 },
    { edgeGlow: Infinity },
    { edgeGlow: -1 },
    { visibleEdgeColor: 0x1000000 },
    { hiddenEdgeColor: -1 },
    { visibleEdgeColor: 1.5 },
    { enabled: 1 as unknown as boolean },
  ])
    expect(() => attachPostprocessing(env.app, { outline })).toThrow(RangeError);
  expect(state.instances).toHaveLength(0);
  expect(env.pipeline).toBeNull();
});

test("outline-only chains use native defaults and snapshot the borrowed selection array", () => {
  const env = fixture();
  const object = new Mesh();
  const selection = [object];
  const handle = attachPostprocessing(env.app, { outline: { selectedObjects: selection } });
  selection.length = 0;
  expect(composer().passes.map((pass) => pass.constructor.name)).toEqual([
    "RenderPass",
    "OutlinePass",
    "OutputPass",
  ]);
  expect(handle.bloom).toBeUndefined();
  expect(handle.outline!.selectedObjects).toEqual([object]);
  expect(handle.outline).toMatchObject({
    edgeStrength: 3,
    edgeThickness: 1,
    edgeGlow: 0,
    enabled: true,
    pulsePeriod: 0,
  });
  handle.outline!.selectedObjects = [];
  env.draw();
  expect(vi.spyOn(composer(), "render")).toHaveBeenCalledOnce();
});

test("combined chains place outline before bloom and preserve explicit native settings", () => {
  const env = fixture();
  const handle = attachPostprocessing(env.app, {
    bloom: { strength: 2 },
    outline: {
      enabled: false,
      edgeThickness: 4,
      edgeStrength: 5,
      edgeGlow: 2,
      visibleEdgeColor: 0xff8800,
      hiddenEdgeColor: 0x123456,
    },
  });
  expect(composer().passes.map((pass) => pass.constructor.name)).toEqual([
    "RenderPass",
    "OutlinePass",
    "UnrealBloomPass",
    "OutputPass",
  ]);
  expect(handle.bloom!.strength).toBe(2);
  expect(handle.outline!.enabled).toBe(false);
  expect(handle.outline!.visibleEdgeColor.getHex()).toBe(0xff8800);
  expect(handle.outline!.hiddenEdgeColor.getHex()).toBe(0x123456);
  expect(handle.outline!.edgeThickness).toBe(4);
});

test("outline disposal clears selection references while leaving borrowed scene resources untouched", () => {
  const env = fixture();
  const object = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  env.env.scene.add(object);
  const geometry = vi.spyOn(object.geometry, "dispose");
  const material = vi.spyOn(object.material, "dispose");
  const handle = attachPostprocessing(env.app, { outline: { selectedObjects: [object] } });
  const pass = vi.spyOn(handle.outline!, "dispose");
  handle.dispose();
  expect(pass).toHaveBeenCalledOnce();
  expect(handle.outline!.selectedObjects).toEqual([]);
  expect(object.parent).toBe(env.env.scene);
  expect(geometry).not.toHaveBeenCalled();
  expect(material).not.toHaveBeenCalled();
  object.geometry.dispose();
  object.material.dispose();
});

test("outline render failures restore visibility and native scene overrides, including detached selections", () => {
  const env = fixture();
  const object = new Mesh();
  const hidden = new Mesh();
  const outside = new Mesh();
  hidden.visible = false;
  env.env.scene.add(object, hidden);
  const background = new Color(0x334455);
  env.env.scene.background = background;
  const handle = attachPostprocessing(env.app, { outline: { selectedObjects: [object, outside] } });
  const override = handle.outline!.depthMaterial;
  state.onPass = (_pass, index) => {
    if (index !== 1) return;
    object.visible = false;
    hidden.visible = true;
    outside.visible = false;
    env.env.scene.background = null;
    env.env.scene.overrideMaterial = override;
    throw new Error("mask render");
  };
  expect(() => env.draw()).toThrow("mask render");
  expect(object.visible).toBe(true);
  expect(hidden.visible).toBe(false);
  expect(outside.visible).toBe(true);
  expect(env.env.scene.background).toBe(background);
  expect(env.env.scene.overrideMaterial).toBeNull();
});

test("successful outline rendering leaves intentional application scene changes intact", () => {
  const env = fixture();
  const object = new Mesh();
  env.env.scene.add(object);
  attachPostprocessing(env.app, { outline: { selectedObjects: [object] } });
  const background = new Color(0xabcdef);
  state.onPass = () => {
    env.env.scene.background = background;
  };
  env.draw();
  expect(env.env.scene.background).toBe(background);
});

test("resource disposal during native resize defers GPU release until the resize operation returns", () => {
  const env = fixture();
  const handle = attachPostprocessing(env.app, { outline: {}, bloom: {} });
  const instance = composer();
  state.onSize = () => {
    handle.dispose();
    expect(vi.spyOn(instance, "dispose")).not.toHaveBeenCalled();
  };
  env.resize(300, 200);
  expect(handle.disposed).toBe(true);
  expect(vi.spyOn(instance, "dispose")).toHaveBeenCalledOnce();
  expect(env.pipeline).toBeNull();
});

test("native resize rejects render reentry and a failed size remains retryable", () => {
  const env = fixture();
  attachPostprocessing(env.app, { outline: {} });
  state.onSize = () => {
    expect(() => env.draw()).toThrow("cannot reenter");
  };
  env.resize(300, 200);
  expect(vi.spyOn(composer(), "render")).not.toHaveBeenCalled();
  state.onSize = () => {
    throw new Error("transient size failure");
  };
  expect(() => env.resize(400, 200)).toThrow("transient size failure");
  state.onSize = undefined;
  env.resize(400, 200);
  expect(composer().renderTarget1.width).toBe(800);
});

test("initialization and rollback failures are both retained in the reported aggregate", () => {
  const env = fixture();
  state.failDispose = true;
  state.onSize = () => {
    throw new Error("resize initialization");
  };
  expect(() => attachPostprocessing(env.app, { outline: {} })).toThrow(AggregateError);
  expect(env.pipeline).toBeNull();
  expect(vi.spyOn(composer(), "dispose")).toHaveBeenCalledOnce();
});
