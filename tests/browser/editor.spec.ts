import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
const action = (card: Locator, name: string) => card.getByRole("button", { name, exact: true });
async function pixels(card: Locator) {
  return card.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const gl = element.querySelector("canvas")!.getContext("webgl2")!;
    const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bytes,
    );
    let hash = 2166136261,
      sum = 0,
      chromatic = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      const r = bytes[i]!,
        g = bytes[i + 1]!,
        b = bytes[i + 2]!;
      hash = Math.imul(hash ^ r, 16777619);
      hash = Math.imul(hash ^ g, 16777619);
      hash = Math.imul(hash ^ b, 16777619);
      sum += r + g + b;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 10) chromatic++;
    }
    return {
      hash: hash >>> 0,
      sum,
      chromatic,
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      antialias: gl.getContextAttributes()!.antialias,
      error: gl.getError(),
    };
  });
}
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?demo=editor");
});
test.afterEach(() => expect(errors).toEqual([]));
test("Editor defaults and seven tone choices match native renderer pixels with independent exposure", async ({
  page,
}) => {
  const a = page.getByTestId("editor-a"),
    b = page.getByTestId("editor-b");
  await expect(a).toHaveAttribute("data-tone", "7");
  await expect(a).toHaveAttribute("data-exposure", "1");
  await expect(a).toHaveAttribute("data-shadow", "1");
  const original = await pixels(a);
  expect(original.chromatic).toBeGreaterThan(100);
  expect(original.error).toBe(0);
  expect(original.antialias).toBe(true);
  expect(await pixels(b)).toEqual(original);
  await a.getByRole("slider", { name: "曝光", exact: true }).fill("1.7");
  await b.getByRole("slider", { name: "曝光", exact: true }).fill("1.7");
  const hashes = new Set<number>();
  for (const mode of ["none", "linear", "reinhard", "cineon", "aces-filmic", "agx", "neutral"]) {
    await a.getByRole("combobox", { name: "色调", exact: true }).selectOption(mode);
    await b.getByRole("combobox", { name: "色调", exact: true }).selectOption(mode);
    const result = await pixels(a);
    expect(await pixels(b)).toEqual(result);
    hashes.add(result.hash);
  }
  expect(hashes.size).toBe(7);
  await action(a, "恢复 Editor 默认").click();
  await action(b, "恢复 Editor 默认").click();
  await a.getByRole("slider", { name: "曝光", exact: true }).fill("2");
  expect((await pixels(a)).sum).toBeGreaterThan(original.sum);
  expect(await pixels(b)).toEqual(original);
  await action(a, "恢复 Editor 默认").click();
  expect(await pixels(a)).toEqual(original);
});
test("Basic PCF and VSM generate different real shadow pixels and reset restores baseline", async ({
  page,
}) => {
  const a = page.getByTestId("editor-a"),
    b = page.getByTestId("editor-b");
  const baseline = await pixels(a),
    peer = await pixels(b),
    hashes = new Set<number>();
  for (const kind of ["basic", "pcf", "vsm", "off"]) {
    await a.getByRole("combobox", { name: "阴影", exact: true }).selectOption(kind);
    const output = await pixels(a);
    expect(output.error).toBe(0);
    hashes.add(output.hash);
  }
  expect(hashes.size).toBe(4);
  expect(await pixels(b)).toEqual(peer);
  await action(a, "恢复 Editor 默认").click();
  expect(await pixels(a)).toEqual(baseline);
});
test("Room IBL matches native PMREM and repeated removal restores GPU texture and geometry baseline", async ({
  page,
}) => {
  const a = page.getByTestId("editor-a"),
    b = page.getByTestId("editor-b");
  const baseline = await pixels(a);
  const textures = await a.getAttribute("data-textures"),
    geometries = await a.getAttribute("data-geometries");
  await action(a, "生成 Room 环境").click();
  await expect(a.locator('[data-value="room"]')).toHaveText("on");
  const room = await pixels(a);
  expect(room.hash).not.toBe(baseline.hash);
  expect(room.error).toBe(0);
  await action(b, "生成 Room 环境").click();
  expect(await pixels(b)).toEqual(room);
  await action(b, "清除 Room 环境").click();
  await action(a, "清除 Room 环境").click();
  expect(await pixels(a)).toEqual(baseline);
  await expect(a).toHaveAttribute("data-textures", textures!);
  await expect(a).toHaveAttribute("data-geometries", geometries!);
  await action(a, "生成 Room 环境").click();
  expect(await pixels(a)).toEqual(room);
  await page.screenshot({ path: "test-results/editor-room.png", fullPage: true });
  await action(a, "清除 Room 环境").click();
  expect(await pixels(a)).toEqual(baseline);
  await expect(a).toHaveAttribute("data-textures", textures!);
});
test("draw-time changes survive OutputPass restoration and release/rebuild stays independent", async ({
  page,
}) => {
  const a = page.getByTestId("editor-a"),
    b = page.getByTestId("editor-b");
  const peer = await pixels(b);
  await action(a, "切换输出管线").click();
  await action(a, "绘制中切换 AgX").click();
  await expect(a).toHaveAttribute("data-tone", "6");
  await expect(a).toHaveAttribute("data-exposure", "2");
  const changed = await pixels(a);
  expect(changed.hash).not.toBe(peer.hash);
  expect(changed.error).toBe(0);
  await action(a, "切换输出管线").click();
  expect((await pixels(a)).error).toBe(0);
  await expect(a).toHaveAttribute("data-tone", "6");
  expect(await pixels(b)).toEqual(peer);
  await action(a, "销毁场景").click();
  await expect(a.locator("canvas")).toHaveCount(0);
  await action(a, "重建场景").click();
  await expect(a.locator("canvas")).toHaveCount(1);
  expect(await pixels(a)).toEqual(peer);
});
