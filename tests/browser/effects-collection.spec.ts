import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
const button = (card: Locator, name: string) => card.getByRole("button", { name, exact: true });
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
      sum = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      hash = Math.imul(hash ^ bytes[i]!, 16777619);
      hash = Math.imul(hash ^ bytes[i + 1]!, 16777619);
      hash = Math.imul(hash ^ bytes[i + 2]!, 16777619);
      sum += bytes[i]! + bytes[i + 1]! + bytes[i + 2]!;
    }
    return { hash: hash >>> 0, sum, error: gl.getError() };
  });
}
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/?demo=effects-collection");
  await button(page.getByTestId("collection-a"), "暂停场景").click();
  await button(page.getByTestId("collection-b"), "暂停场景").click();
});
test.afterEach(async ({ page }) => {
  await expect(page.locator('[role="alert"]:visible')).toHaveCount(0);
  expect(errors).toEqual([]);
});
for (const id of ["a", "b"])
  test(
    "five effects produce animated GPU pixels in " +
      (id === "a" ? "perspective" : "orthographic") +
      " projection",
    async ({ page }) => {
      const card = page.getByTestId("collection-" + id),
        peer = page.getByTestId("collection-" + (id === "a" ? "b" : "a"));
      const peerImage = await pixels(peer);
      const select = card.getByRole("combobox", { name: "显示特效" });
      await select.selectOption("none");
      const baseline = await pixels(card);
      for (const mode of ["ripple", "pillar", "shield", "points", "flow"]) {
        await select.selectOption(mode);
        await card.getByRole("slider", { name: "特效定位" }).fill("15");
        const first = await pixels(card);
        expect(first.error).toBe(0);
        expect(first.hash).not.toBe(baseline.hash);
        expect(first.sum).toBeGreaterThan(baseline.sum);
        if (mode === "points") await expect(card).toHaveAttribute("data-points", "192");
        await card.getByRole("slider", { name: "特效定位" }).fill("37");
        const second = await pixels(card);
        expect(second.hash).not.toBe(first.hash);
        expect(await pixels(card)).toEqual(second);
      }
      await select.selectOption("none");
      expect(await pixels(card)).toEqual(baseline);
      expect(await pixels(peer)).toEqual(peerImage);
      await select.selectOption("all");
      if (id === "a")
        await page.screenshot({ path: "test-results/effects-collection.png", fullPage: true });
    },
  );
test("effect clocks pause independently, zero rate freezes phase and bloom is optional", async ({
  page,
}) => {
  const a = page.getByTestId("collection-a"),
    b = page.getByTestId("collection-b");
  const peer = await pixels(a);
  await button(b, "运行场景").click();
  const initial = await b.locator('[data-value="phase"]').textContent();
  await expect(b.locator('[data-value="phase"]')).not.toHaveText(initial!);
  await button(b, "暂停特效").click();
  const frozen = await b.locator('[data-value="phase"]').textContent(),
    frames = Number(await b.getAttribute("data-frames"));
  await expect
    .poll(async () => Number(await b.getAttribute("data-frames")))
    .toBeGreaterThan(frames + 1);
  await expect(b.locator('[data-value="phase"]')).toHaveText(frozen!);
  await button(b, "继续特效").click();
  await expect(b.locator('[data-value="phase"]')).not.toHaveText(frozen!);
  await b.getByRole("slider", { name: "特效倍速" }).fill("0");
  const zero = await b.locator('[data-value="phase"]').textContent(),
    zeroFrames = Number(await b.getAttribute("data-frames"));
  await expect
    .poll(async () => Number(await b.getAttribute("data-frames")))
    .toBeGreaterThan(zeroFrames + 1);
  await expect(b.locator('[data-value="phase"]')).toHaveText(zero!);
  await button(b, "暂停场景").click();
  const direct = await pixels(b);
  await button(b, "切换泛光").click();
  const glow = await pixels(b);
  expect(glow.hash).not.toBe(direct.hash);
  expect(glow.error).toBe(0);
  await button(b, "切换泛光").click();
  expect(await pixels(b)).toEqual(direct);
  expect(await pixels(a)).toEqual(peer);
});
test("Points draw callbacks and composer disposal retire all owned GPU geometry/programs across repeated rebuilds", async ({
  page,
}) => {
  const a = page.getByTestId("collection-a"),
    b = page.getByTestId("collection-b");
  const peer = await pixels(b);
  for (const card of [a, b]) {
    if (card === b) await button(card, "切换泛光").click();
    await card.getByRole("combobox", { name: "显示特效" }).selectOption("points");
    let baseline:
      | { geometries: string | null; programs: string | null; textures: string | null }
      | undefined;
    for (let i = 0; i < 3; i++) {
      await button(card, "绘制中释放特效").click();
      await expect(card.locator('[data-value="state"]')).toHaveText("disposed");
      expect((await pixels(card)).error).toBe(0);
      const current = {
        geometries: await card.getAttribute("data-geometries"),
        programs: await card.getAttribute("data-programs"),
        textures: await card.getAttribute("data-textures"),
      };
      // Native composer owns one additional shared full-screen triangle.
      expect(Number(current.geometries)).toBe(card === b ? 4 : 3);
      if (baseline) expect(current).toEqual(baseline);
      else baseline = current;
      if (i < 2) {
        await button(card, "重建特效").click();
        await expect(card.locator('[data-value="state"]')).toHaveText("running");
      }
    }
    if (card === a) expect(await pixels(b)).toEqual(peer);
    else {
      await button(card, "切换泛光").click();
      expect((await pixels(card)).error).toBe(0);
      await expect(card).toHaveAttribute("data-geometries", "3");
      await expect(card).toHaveAttribute("data-textures", "0");
    }
  }
  await button(a, "销毁场景").click();
  await expect(a.locator("canvas")).toHaveCount(0);
  await button(a, "重建场景").click();
  await button(a, "暂停场景").click();
  await expect(a.locator("canvas")).toHaveCount(1);
  expect((await pixels(a)).error).toBe(0);
  await expect(b.locator("canvas")).toHaveCount(1);
});
