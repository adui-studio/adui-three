import { expect, test } from "@playwright/test";
import type { WebGPUFeatureProbe } from "../../apps/website/src/webgpu-features.ts";

for (const backend of ["webgl", "auto", "webgpu"] as const) {
  test(`${backend}: unified bloom, outline, color, room IBL, shadows, effects and capture`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`/?demo=webgpu-features&backend=${backend}`);
    if (backend === "webgpu") {
      const available = await page.evaluate(async () => {
        const gpu = Reflect.get(navigator, "gpu") as
          | { requestAdapter(): Promise<object | null> }
          | undefined;
        return !!(await gpu?.requestAdapter());
      });
      if (process.env.ADUI_REQUIRE_WEBGPU === "1") expect(available).toBe(true);
      test.skip(!available, "No native WebGPU adapter; node WebGL fallback is covered separately");
    }
    await expect(page.getByRole("status")).toHaveText("ready");
    const result = await page.evaluate(async () => {
      const p = Reflect.get(window, "gpuFeatureProbe") as WebGPUFeatureProbe;
      const base = await p.image();
      p.color(2);
      const bright = await p.image();
      p.clear();
      const restored = await p.image();
      p.post({
        bloom: { enabled: false },
        outline: { enabled: false },
        colorAdjustment: { enabled: false },
      });
      const reference = await p.image();
      p.configure({ bloom: { strength: 2, threshold: 0 } });
      const glow = await p.image();
      p.configure({
        bloom: { enabled: false },
        outline: {
          selectedObjects: [p.app.scene.children[0]!],
          visibleEdgeColor: 0xffff00,
          edgeStrength: 4,
        },
      });
      const edges = await p.image();
      p.configure({ outline: { enabled: false }, colorAdjustment: { brightness: 0.1 } });
      const grade = await p.image();
      p.post({
        bloom: { strength: 2, threshold: 0.05 },
        outline: { visibleEdgeColor: 0xffff00, edgeStrength: 4 },
        colorAdjustment: { saturation: -0.5 },
      });
      const composed = await p.image();
      p.configure({
        bloom: { enabled: false },
        outline: { enabled: false },
        colorAdjustment: { enabled: false },
      });
      const bypass = await p.image();
      p.clear();
      const shadows: number[] = [];
      for (const type of ["basic", "pcf", "vsm"] as const) {
        p.shadow(type);
        const on = await p.image();
        p.clear();
        p.shadow(type, false);
        const off = await p.image();
        p.clear();
        shadows.push(on.sum - off.sum);
      }
      p.room();
      const room = await p.image();
      p.clear();
      const environments: number[] = [];
      for (const format of ["hdr", "exr"] as const) {
        await p.environment(format);
        environments.push((await p.image()).sum);
        p.clear();
      }
      const effects: Array<{ kind: string; lit: number; changed: boolean; stable: boolean }> = [];
      for (const kind of ["fly", "flow", "points", "wall", "radar", "ripple", "pillar", "shield"]) {
        p.effect(kind);
        const first = await p.image(),
          repeated = await p.image();
        p.seek(0.65);
        const moved = await p.image();
        effects.push({
          kind,
          lit: first.lit,
          changed: first.sum !== moved.sum,
          stable: first.sum === repeated.sum,
        });
      }
      p.reset();
      const region = await p.image({ x: 80, y: 60, width: 100, height: 90 });
      const expected = await p.image();
      let crop = true;
      for (let y = 0; y < 90; y++)
        for (let x = 0; x < 100; x++)
          for (let c = 0; c < 4; c++)
            if (
              region.pixels[(y * 100 + x) * 4 + c] !==
              expected.pixels[((y + 60) * expected.width + x + 80) * 4 + c]
            )
              crop = false;
      const cycles = [];
      for (let i = 0; i < 4; i++) {
        p.post({ bloom: { threshold: 0.1 }, outline: {}, colorAdjustment: { brightness: 0.1 } });
        p.draw();
        p.clear();
        p.draw();
        p.effect("points");
        p.draw();
        p.reset();
        p.shadow("vsm");
        p.draw();
        p.clear();
        p.room();
        p.draw();
        p.clear();
        p.draw();
        cycles.push(p.memory());
      }
      await p.destroy();
      return {
        base: base.sum,
        bright: bright.sum,
        restored: restored.sum,
        composed: composed.sum,
        bypass: bypass.sum,
        reference: reference.sum,
        glow: glow.sum,
        edges: edges.sum,
        grade: grade.sum,
        room: room.sum,
        shadows,
        environments,
        effects,
        crop,
        cycles,
      };
    });
    await test
      .info()
      .attach("metrics", { body: JSON.stringify(result), contentType: "application/json" });
    expect(errors).toEqual([]);
    expect(result.bright).toBeGreaterThan(result.base);
    expect(result.restored).toBe(result.base);
    expect(result.glow, JSON.stringify(result)).toBeGreaterThan(result.reference);
    expect(result.edges).not.toBe(result.reference);
    expect(result.grade).toBeGreaterThan(result.reference);
    expect(result.composed).not.toBe(result.base);
    expect(result.bypass).toBe(result.reference);
    for (const environment of result.environments) expect(environment).toBeGreaterThan(result.base);
    expect(result.room).toBeGreaterThan(result.base);
    for (const shadow of result.shadows) expect(Math.abs(shadow)).toBeGreaterThan(1000);
    for (const effect of result.effects) {
      expect(effect.lit, effect.kind).toBeGreaterThan(15);
      expect(effect.changed, effect.kind).toBe(true);
      expect(effect.stable, effect.kind).toBe(true);
    }
    expect(result.crop).toBe(true);
    expect(result.cycles[3]).toEqual(result.cycles[1]);
    expect(errors).toEqual([]);
  });
}
