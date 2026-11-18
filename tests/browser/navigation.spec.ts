import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
const number = async (card: Locator, name: string): Promise<number> =>
  Number(await card.getAttribute(`data-${name}`));
const button = (card: Locator, name: string) => card.getByRole("button", { name, exact: true });
async function pixels(card: Locator) {
  return card.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!,
      gl = canvas.getContext("webgl2")!;
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
    let orange = 0;
    for (let i = 0; i < bytes.length; i += 4)
      if (bytes[i]! > 180 && bytes[i]! > bytes[i + 1]! * 1.3 && bytes[i + 1]! > 70) orange++;
    return { orange, error: gl.getError() };
  });
}
test("third-person uses native GPU rendering, resolves the camera boom and walks against real BVH walls independently", async ({
  page,
}) => {
  await page.goto("/?demo=navigation");
  const a = page.getByTestId("navigation-a"),
    b = page.getByTestId("navigation-b");
  await expect(a.locator('[data-value="grounded"]')).toHaveText("grounded");
  expect(await number(a, "camera-z")).toBeLessThan(5.7);
  const image = await pixels(a);
  expect(image.orange).toBeGreaterThan(10);
  expect(image.error).toBe(0);
  const peer = await b.locator('[data-value="position"]').textContent();
  await button(a, "持续前进").click();
  await expect.poll(() => number(a, "z")).toBeLessThan(0.57);
  await button(a, "停止移动").click();
  expect(await number(a, "z")).toBeGreaterThan(0.54);
  await expect(b.locator('[data-value="position"]')).toHaveText(peer!);
  await button(a, "跳跃").click();
  await expect.poll(() => number(a, "y")).toBeGreaterThan(0.1);
  await expect(a.locator('[data-value="grounded"]')).toHaveText("grounded");
  expect(await number(a, "z")).toBeGreaterThan(0.54);
  await expect(a.getByRole("alert")).toBeHidden();
});
test("focused third-person keyboard stops after focus changes and native first-person pointer lock owns mouse input", async ({
  page,
}) => {
  await page.goto("/?demo=navigation");
  const a = page.getByTestId("navigation-a"),
    b = page.getByTestId("navigation-b");
  await a.locator("canvas").click();
  await page.keyboard.down("KeyW");
  await expect.poll(() => number(a, "z")).toBeLessThan(3.8);
  await button(b, "停止移动").click();
  const stopped = await number(a, "z");
  await expect.poll(() => number(b, "y")).toBeLessThan(0.001);
  expect(await number(a, "z")).toBeCloseTo(stopped, 3);
  await page.keyboard.up("KeyW");
  const lockBox = (await button(b, "锁定鼠标").boundingBox())!;
  await button(b, "锁定鼠标").click();
  await expect(b.locator('[data-value="locked"]')).toHaveText("locked");
  await page.mouse.move(lockBox.x + lockBox.width / 2 + 100, lockBox.y + lockBox.height / 2, {
    steps: 5,
  });
  await expect.poll(async () => Math.abs(await number(b, "forward-x"))).toBeGreaterThan(0.05);
  await page.keyboard.down("KeyW");
  await expect.poll(() => number(b, "z")).toBeLessThan(3.95);
  await page.keyboard.up("KeyW");
  await page.keyboard.press("Escape");
  await expect(b.locator('[data-value="locked"]')).toHaveText("free");
  await expect(b.getByRole("alert")).toBeHidden();
});
test("mode switching, host pause and repeated reconstruction release native controls while the peer continues", async ({
  page,
}) => {
  await page.goto("/?demo=navigation");
  const a = page.getByTestId("navigation-a"),
    b = page.getByTestId("navigation-b");
  await button(b, "持续前进").click();
  await button(a, "暂停场景").click();
  const frame = await a.locator('[data-value="frames"]').textContent();
  await expect.poll(() => number(b, "z")).toBeLessThan(3.5);
  await expect(a.locator('[data-value="frames"]')).toHaveText(frame!);
  await button(a, "运行场景").click();
  await expect(a.locator('[data-value="frames"]')).not.toHaveText(frame!);
  await button(a, "切换视角").click();
  await expect(a.locator('[data-value="mode"]')).toHaveText("第一人称");
  await button(a, "锁定鼠标").click();
  await expect(a.locator('[data-value="locked"]')).toHaveText("locked");
  await page.keyboard.press("Escape");
  await button(a, "切换视角").click();
  await expect(a.locator('[data-value="mode"]')).toHaveText("第三人称");
  for (let i = 0; i < 2; i++) {
    await button(a, "销毁场景").click();
    await expect(a.locator("canvas")).toHaveCount(0);
    await button(a, "重建场景").click();
    await expect(a.locator("canvas")).toHaveCount(1);
    expect((await pixels(a)).orange).toBeGreaterThan(10);
  }
  await expect(a.getByRole("alert")).toBeHidden();
  await expect(b.getByRole("alert")).toBeHidden();
});
