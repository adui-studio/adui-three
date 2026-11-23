import { expect, test } from "@playwright/test";

test("GlideSelect studio navigation commits real pointer and keyboard choices without extra canvases", async ({
  page,
}) => {
  await page.goto("/?demo=core");
  const select = page.getByRole("combobox", { name: "验证场景", exact: true });
  await select.click();
  const list = page.getByRole("listbox", { name: "验证场景", exact: true });
  await expect(list.getByRole("option")).toHaveCount(12);
  await list.getByRole("option", { name: "渲染能力诊断", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("检测完成");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await select.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("scene-A").locator("canvas")).toBeVisible();
  await expect(page.getByTestId("scene-B").locator("canvas")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(2);
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("WakeSlider follows native programmatic values and keyboard edits without changing animation ownership", async ({
  page,
}) => {
  await page.goto("/?demo=core");
  const card = page.getByTestId("scene-A");
  await card.getByRole("button", { name: "加载动画样例", exact: true }).click();
  const slider = card.getByRole("slider", { name: "动画倍速", exact: true });
  await expect(slider).toBeEnabled();
  const programmatic = await slider.evaluate((node) => {
    const input = node as HTMLInputElement;
    input.value = "1.25";
    return { value: input.value, presentation: input.parentElement!.dataset.value };
  });
  expect(programmatic).toEqual({ value: "1.25", presentation: "1.25" });
  await slider.focus();
  await page.keyboard.press("Home");
  await expect(card.getByTestId("animation-rate")).toHaveText("0.00");
  await expect(slider.locator("..")).toHaveAttribute("data-value", "0");
  await page.keyboard.press("End");
  await expect(card.getByTestId("animation-rate")).toHaveText("2.00");
  await expect(slider.locator("..").locator('i[data-on="true"]')).toHaveCount(24);
  await card.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(slider).toBeDisabled();
  await expect(slider.locator("..")).toHaveAttribute("data-value", "1");
  await expect(card.locator('[data-vue-bits="wake-slider"]')).toHaveCount(2);
  await expect(page.locator("canvas")).toHaveCount(2);
});

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
