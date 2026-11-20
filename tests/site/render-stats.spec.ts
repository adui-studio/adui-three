import { expect, test } from "@playwright/test";

for (const renderer of ["webgl", "webgpu"]) {
  test(`statistics use real ${renderer} resources and pause/rebuild with their owner`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/play/?example=basic&renderer=${renderer}`);
    await page.waitForLoadState("networkidle");
    const panel = page.locator(".render-stats");
    await expect(panel).toHaveAttribute("data-renderer", renderer);
    await panel.locator("summary").click();
    await expect
      .poll(async () =>
        Number((await panel.locator('[data-stat="fps"]').textContent())?.replaceAll(",", "")),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(async () =>
        Number(
          (await panel.locator('[data-stat="geometries"]').textContent())?.replaceAll(",", ""),
        ),
      )
      .toBeGreaterThan(0);
    const before = Number(await panel.getAttribute("data-draws"));
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    await expect(panel.locator('[data-stat="fps"]')).toHaveText("—");
    const paused = await panel.getAttribute("data-draws");
    await page.getByRole("button", { name: "绘制一帧", exact: true }).click();
    expect(Number(await panel.getAttribute("data-draws"))).toBe(Number(paused) + 1);
    expect(Number(paused)).toBeGreaterThanOrEqual(before);
    if (renderer === "webgl") await expect(panel.locator('[data-stat="bytes"]')).toHaveText("—");
    await page.getByRole("button", { name: "销毁", exact: true }).click();
    await expect(panel).toHaveCount(0);
    await page.getByRole("button", { name: "重建", exact: true }).click();
    await expect(panel).toHaveCount(1);
    await expect(panel).toHaveAttribute("data-renderer", renderer);
    expect(errors).toEqual([]);
  });
}

test("statistics fit mobile layout and remain keyboard accessible", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.goto("/play/?example=webgpu&projection=orthographic&renderer=webgpu");
  const summary = page.locator(".render-stats summary");
  await expect(summary).toBeVisible();
  await summary.focus();
  await summary.press("Enter");
  await expect(page.locator('.render-stats [data-stat="drawCalls"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: "test-results/render-stats-mobile.png", fullPage: true });
});
