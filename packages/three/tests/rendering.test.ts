import { afterEach, expect, test } from "vite-plus/test";
import { NeutralToneMapping, NoToneMapping, AgXToneMapping } from "three";
import { ResourceScope } from "../src/resources.ts";
import { attachRendererSettings, createEditorRenderPreset } from "../src/rendering.ts";
import { renderWithRetirement } from "../src/render-retirement.ts";
import type { AnyThreeApp } from "../src/three-app.ts";
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});
function fixture() {
  const resources = new ResourceScope(),
    scope = new ResourceScope();
  const renderer = { toneMapping: NoToneMapping as number, toneMappingExposure: 1.5 };
  const value = { state: "ready", resources, renderer };
  cleanup.push(() => {
    scope.dispose();
    resources.dispose();
  });
  return { ...value, scope, app: value as unknown as AnyThreeApp };
}
test("Editor presets are independent and color attachment restores original native values", () => {
  const first = createEditorRenderPreset(),
    second = createEditorRenderPreset();
  first.color.exposure = 2;
  first.renderer.antialias = false;
  expect(second).toEqual({
    renderer: { antialias: true, reversedDepthBuffer: true },
    color: { toneMapping: "neutral", exposure: 1 },
    shadows: { enabled: true, type: "pcf" },
  });
  const e = fixture(),
    h = attachRendererSettings(e.app, second.color);
  expect(e.renderer.toneMapping).toBe(NeutralToneMapping);
  const settings = h.settings;
  (settings as { exposure: number }).exposure = 9;
  expect(h.settings.exposure).toBe(1);
  h.dispose();
  h.dispose();
  expect(e.renderer).toEqual({ toneMapping: NoToneMapping, toneMappingExposure: 1.5 });
});
test("partial commands during composer rendering merge and apply after temporary states restore", () => {
  const e = fixture(),
    h = attachRendererSettings(e.app);
  renderWithRetirement(e.renderer, () => {
    const saved = e.renderer.toneMapping;
    e.renderer.toneMapping = NoToneMapping;
    h.configure({ toneMapping: "agx" });
    h.configure({ exposure: 2 });
    expect(h.settings).toEqual({ toneMapping: "neutral", exposure: 1 });
    expect(e.renderer.toneMapping).toBe(NoToneMapping);
    e.renderer.toneMapping = saved;
  });
  expect(h.settings).toEqual({ toneMapping: "agx", exposure: 2 });
  expect(e.renderer.toneMapping).toBe(AgXToneMapping);
  expect(e.renderer.toneMappingExposure).toBe(2);
});
test("disposal inside drawing drops pending commands and holds the lease until retirement", () => {
  const e = fixture(),
    h = attachRendererSettings(e.app);
  renderWithRetirement(e.renderer, () => {
    h.configure({ exposure: 4 });
    h.dispose();
    expect(h.disposed).toBe(true);
    expect(e.renderer.toneMapping).toBe(NeutralToneMapping);
    expect(() => attachRendererSettings(e.app)).toThrow("outside a draw");
  });
  expect(e.renderer.toneMapping).toBe(NoToneMapping);
  expect(e.renderer.toneMappingExposure).toBe(1.5);
  expect(() => h.configure({})).toThrow("disposed");
  expect(() => attachRendererSettings(e.app)).not.toThrow();
});
test("scope ownership is exclusive and preserves external native changes", () => {
  const e = fixture(),
    h = attachRendererSettings(e.app, { scope: e.scope });
  expect(() => attachRendererSettings(e.app)).toThrow("already");
  e.renderer.toneMappingExposure = 3;
  e.scope.dispose();
  expect(h.disposed).toBe(true);
  expect(e.renderer.toneMappingExposure).toBe(3);
  expect(e.renderer.toneMapping).toBe(NoToneMapping);
});
test.each([-1, NaN, Infinity, 11])(
  "invalid exposure %s leaves active values and pending state untouched",
  (exposure) => {
    const e = fixture(),
      h = attachRendererSettings(e.app);
    expect(() => h.configure({ exposure })).toThrow();
    expect(h.settings).toEqual({ toneMapping: "neutral", exposure: 1 });
    h.configure({ exposure: 0 });
    expect(e.renderer.toneMappingExposure).toBe(0);
    h.configure({ exposure: 10 });
    expect(e.renderer.toneMappingExposure).toBe(10);
  },
);
test("all seven Editor choices map to native constants", () => {
  const e = fixture(),
    h = attachRendererSettings(e.app);
  for (const [toneMapping, native] of [
    ["none", 0],
    ["linear", 1],
    ["reinhard", 2],
    ["cineon", 3],
    ["aces-filmic", 4],
    ["agx", 6],
    ["neutral", 7],
  ] as const) {
    h.configure({ toneMapping });
    expect(e.renderer.toneMapping).toBe(native);
  }
});
