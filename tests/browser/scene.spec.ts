import { expect, test } from "@playwright/test";

test("two real WebGL scenes render, pause independently, resize, and rebuild without duplicate canvases", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const first = page.getByTestId("scene-A");
  const second = page.getByTestId("scene-B");
  const frameCount = async (panel = first): Promise<number> =>
    Number(await panel.getByTestId("frames").textContent());
  await expect(first).toHaveAttribute("data-state", "running");
  await expect.poll(() => frameCount()).toBeGreaterThan(2);
  await expect(first.getByTestId("draw-calls")).not.toHaveText("0");
  await expect(second.getByTestId("draw-calls")).not.toHaveText("0");
  await expect(first.getByTestId("dpr")).toHaveText("2.00");
  expect(
    await first
      .locator("canvas")
      .evaluate((canvas: HTMLCanvasElement) => canvas.width / canvas.clientWidth),
  ).toBeCloseTo(2, 1);
  await first.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(first).toHaveAttribute("data-state", "stopped");
  await page.waitForTimeout(200);
  const paused = await frameCount();
  const other = await frameCount(second);
  await page.waitForTimeout(200);
  expect(await frameCount()).toBe(paused);
  expect(await frameCount(second)).toBeGreaterThan(other);
  await first.getByRole("button", { name: "运行", exact: true }).click();
  await expect.poll(() => frameCount()).toBeGreaterThan(paused);
  const width = await first.locator("canvas").evaluate((canvas: HTMLCanvasElement) => canvas.width);
  await first.getByRole("button", { name: "收窄容器" }).click();
  await expect
    .poll(() => first.locator("canvas").evaluate((canvas: HTMLCanvasElement) => canvas.width))
    .toBeLessThan(width);
  await first.getByRole("button", { name: "零高度" }).click();
  await expect(first.getByTestId("size")).toContainText("× 0");
  await page.waitForTimeout(200);
  const zeroFrames = await frameCount();
  await page.waitForTimeout(200);
  expect(await frameCount()).toBe(zeroFrames);
  await first.getByRole("button", { name: "零高度" }).click();
  await expect.poll(() => frameCount()).toBeGreaterThan(zeroFrames);
  await first.getByRole("button", { name: "收窄容器" }).click();
  for (let index = 0; index < 3; index++) {
    await first.getByRole("button", { name: "销毁", exact: true }).click();
    await expect(first.locator("canvas")).toHaveCount(0);
    await expect(first).toHaveAttribute("data-state", "disposed");
    await first.getByRole("button", { name: "重建 ↻" }).click();
    await expect(first.locator("canvas")).toHaveCount(1);
    await expect.poll(() => frameCount()).toBeGreaterThan(0);
  }
  const bounds = await first.locator("canvas").boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 100, bounds!.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 220, bounds!.y + 130, { steps: 8 });
  await page.mouse.up();
  await expect(first.locator(".error")).toBeHidden();
  await expect(second.locator(".error")).toBeHidden();
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/core-playground.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileWidth = await first.locator(".viewport").evaluate((element) => element.clientWidth);
  await expect(first.getByTestId("size")).toHaveText(`${mobileWidth} × 340`);
  await expect(second.getByTestId("size")).toHaveText(`${mobileWidth} × 340`);
  await expect
    .poll(() =>
      first
        .locator("canvas")
        .evaluate((canvas: HTMLCanvasElement) => canvas.width / canvas.clientWidth),
    )
    .toBeCloseTo(2, 1);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: "test-results/core-playground-mobile.png", fullPage: true });
});
