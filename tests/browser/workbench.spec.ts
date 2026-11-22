import { expect, test } from "@playwright/test";

test("Vue Bits studio menu retains all twelve scenarios and returns keyboard focus", async ({
  page,
}) => {
  await page.goto("/?demo=capabilities");
  const trigger = page.getByRole("button", { name: "场景目录", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "场景目录", exact: true });
  await expect(dialog.getByRole("link")).toHaveCount(12);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: /场景、模型与资源/ }).click();
  await expect(page.getByTestId("scene-A").locator("canvas")).toBeVisible();
  await expect(page.getByTestId("scene-B").locator("canvas")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(2);
});

test("workbench navigation preserves the core scene and exposes browser adapter diagnostics", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "回归工作台导航" })).toBeVisible();
  await expect(page.getByTestId("scene-A").locator("canvas")).toBeVisible();
  await page.getByRole("combobox", { name: "验证场景", exact: true }).selectOption("capabilities");
  await expect(page).toHaveURL(/demo=capabilities/);
  await expect(page.getByRole("status")).toHaveText("检测完成");
  for (const level of ["core", "compatibility"])
    await expect(page.locator(`[data-adapter=${level}]`)).toHaveAttribute(
      "data-state",
      /available|unavailable|error/,
    );
  await expect(page.getByRole("main")).toContainText("不是需要安装的 npm 包");
  await page.getByRole("button", { name: "重新检测", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("检测完成");
  await page.getByRole("combobox", { name: "验证场景", exact: true }).selectOption("core");
  await expect(page.getByTestId("scene-B").locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});

test("workbench exposes the same complete feature self-check to users on the node fallback", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/?demo=webgpu-features&backend=auto");
  await expect(page.getByRole("status")).toHaveText("ready");
  await expect(page.locator("[data-actual-backend]")).toHaveText(/webgpu \/ (webgpu|webgl2)/);
  await page.getByRole("button", { name: "运行扩展自检", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("自检通过", { timeout: 90000 });
  await expect(page.locator("[data-check-results] li")).toHaveCount(17);
  await expect(page.locator('[data-check-results] [data-result="failed"]')).toHaveCount(0);
  await page.getByRole("button", { name: "截图", exact: true }).click();
  await expect(page.getByAltText("扩展场景截图")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByAltText("扩展场景截图")
        .evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/workbench-features.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("workbench navigation and diagnostics fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=capabilities");
  await expect(page.getByRole("status")).toHaveText("检测完成");
  await expect(page.getByRole("combobox", { name: "验证场景", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/workbench-mobile.png", fullPage: true });
});
