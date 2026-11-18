import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
const action = (card: Locator, name: string) => card.getByRole("button", { name, exact: true });
async function image(card: Locator) {
  return card.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!,
      gl = canvas.getContext("webgl2")!,
      bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bytes,
    );
    let sum = 0;
    let hash = 2166136261,
      chromatic = 0,
      bright = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      const r = bytes[i]!,
        g = bytes[i + 1]!,
        b = bytes[i + 2]!;
      sum += r + g + b;
      hash = Math.imul(hash ^ r, 16777619);
      hash = Math.imul(hash ^ g, 16777619);
      hash = Math.imul(hash ^ b, 16777619);
      if (Math.max(r, g, b) - Math.min(r, g, b) > 8) chromatic++;
      if (g > 120 || b > 120) bright++;
    }
    return {
      hash: hash >>> 0,
      chromatic,
      bright,
      luminance: sum / ((bytes.length / 4) * 3),
      error: gl.getError(),
    };
  });
}
test("fly lines, walls and radar show actual animated pixels and pause independently from the host and peer", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?demo=effects");
  const a = page.getByTestId("effects-a"),
    b = page.getByTestId("effects-b");
  await action(a, "暂停特效").click();
  const peer = await b.locator('[data-value="phase"]').textContent(),
    first = await image(a);
  expect(first.bright).toBeGreaterThan(100);
  expect(first.error).toBe(0);
  await expect(b.locator('[data-value="phase"]')).not.toHaveText(peer!);
  expect(await image(a)).toEqual(first);
  await a.getByRole("slider", { name: "特效定位", exact: true }).fill("40");
  const shifted = await image(a);
  expect(shifted.hash).not.toBe(first.hash);
  await action(a, "继续特效").click();
  await expect(a.locator('[data-value="phase"]')).not.toHaveText("0.400");
  await action(a, "暂停场景").click();
  const stopped = await image(a);
  await expect(b.locator('[data-value="phase"]')).not.toHaveText(peer!);
  expect(await image(a)).toEqual(stopped);
  expect(errors).toEqual([]);
});
test("native PCF/VSM shadows and official grayscale/color filters change stopped pixels and reset exactly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?demo=effects");
  const a = page.getByTestId("effects-a"),
    b = page.getByTestId("effects-b");
  // This test measures B's stopped image; pause the unrelated live 2048px shadow/bloom workload.
  await action(a, "暂停场景").click();
  await a.getByRole("slider", { name: "特效定位", exact: true }).fill("45");
  await action(b, "暂停场景").click();
  const shadow = await image(b);
  expect(shadow.chromatic).toBeGreaterThan(100);
  await action(b, "切换阴影").click();
  const unshadowed = await image(b);
  expect(unshadowed.hash).not.toBe(shadow.hash);
  expect(unshadowed.luminance).toBeGreaterThan(shadow.luminance + 0.05);
  await action(b, "切换阴影").click();
  expect(await image(b)).toEqual(shadow);
  await action(b, "切换 PCF/VSM").click();
  await expect(b.locator('[data-value="shadow-kind"]')).toHaveText("VSM");
  const vsm = await image(b);
  expect(vsm.error).toBe(0);
  expect(vsm.hash).not.toBe(shadow.hash);
  await b.getByRole("slider", { name: "阴影柔和度", exact: true }).fill("5");
  expect((await image(b)).hash).not.toBe(vsm.hash);
  const ungraded = await image(b);
  await action(b, "灰度滤镜").click();
  expect((await image(b)).chromatic).toBe(0);
  await action(b, "电影色调").click();
  expect((await image(b)).chromatic).toBeGreaterThan(100);
  await action(b, "原始色调").click();
  expect(await image(b)).toEqual(ungraded);
  expect((await image(b)).chromatic).toBeGreaterThan(100);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/effects.png", fullPage: true });
});
test("disposal inside native mesh/shadow callbacks releases resources after drawing and supports repeated recreation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/?demo=effects");
  const a = page.getByTestId("effects-a"),
    b = page.getByTestId("effects-b");
  await action(a, "暂停场景").click();
  await action(b, "暂停场景").click();
  const peer = await image(b);
  await action(a, "绘制中释放特效").click();
  await expect(a.locator('[data-value="effect-state"]')).toHaveText("disposed");
  expect((await image(a)).error).toBe(0);
  expect(await image(b)).toEqual(peer);
  let releasedBaseline: number | undefined;
  for (let i = 0; i < 3; i++) {
    if (i === 2) await action(b, "切换 PCF/VSM").click();
    await action(b, "绘制中释放阴影").click();
    await expect(b.getByRole("alert")).toBeHidden();
    await expect(b.locator('[data-value="shadow"]')).toHaveText("disposed");
    const freed = Number(await b.getAttribute("data-textures"));
    if (releasedBaseline === undefined) releasedBaseline = freed;
    else expect(freed).toBe(releasedBaseline);
    expect((await image(b)).error).toBe(0);
    await action(b, "重建阴影").click();
    await expect(b.locator('[data-value="shadow"]')).toHaveText("on");
    expect(Number(await b.getAttribute("data-textures"))).toBe(freed + (i === 2 ? 3 : 2));
  }
  await action(a, "销毁场景").click();
  await expect(a.locator("canvas")).toHaveCount(0);
  await action(a, "重建场景").click();
  await expect(a.locator("canvas")).toHaveCount(1);
  expect((await image(a)).error).toBe(0);
  expect(errors).toEqual([]);
});
