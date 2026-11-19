import { expect, test } from "@playwright/test";

for (const width of [375, 768, 1440]) {
  test(`visual layout keeps navigation and scene controls usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const route of ["/", "/guide/getting-started.html", "/play/", "/play/?example=labels"]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      if (route.includes("example=")) {
        await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
        const canvas = await page.locator(".scene-display").boundingBox();
        const controls = await page.getByRole("complementary", { name: "场景设置" }).boundingBox();
        expect(canvas).not.toBeNull();
        expect(controls).not.toBeNull();
        if (width > 760) expect(controls!.x).toBeGreaterThanOrEqual(canvas!.x + canvas!.width - 1);
        else expect(controls!.y).toBeGreaterThanOrEqual(canvas!.y + canvas!.height - 1);
        for (const command of ["运行", "暂停", "绘制一帧", "销毁", "重建"]) {
          const button = page.getByRole("button", { name: command, exact: true });
          expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
        await page.getByRole("button", { name: "暂停", exact: true }).click();
        await expect(page.locator(".detail")).toHaveAttribute("data-state", "stopped");
      }
    }
    await page.screenshot({ path: `test-results/redesign-example-${width}.png`, fullPage: true });
  });
}

test("gallery keyboard skip and modified links retain browser navigation semantics", async ({
  page,
}) => {
  await page.goto("/play/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  const popup = page.context().waitForEvent("page");
  await page
    .locator('a.example-card[data-example="basic"]')
    .click({ modifiers: ["ControlOrMeta"] });
  const newPage = await popup;
  await expect(newPage).toHaveURL(/example=basic/);
  await expect(page).not.toHaveURL(/example=/);
  await newPage.close();
});

test("documentation theme switches retain readable surfaces and locally rendered content", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  for (const dark of [true, false]) {
    await page
      .getByRole("switch", { name: dark ? "Switch to dark theme" : "Switch to light theme" })
      .click();
    await expect(page.locator(".product-home")).toHaveCSS(
      "color",
      dark ? "rgb(238, 234, 244)" : "rgb(36, 35, 43)",
    );
    await expect(page.locator(".hero-copy h1")).toBeVisible();
    const colors = await page.locator(".product-home").evaluate((element) => {
      const style = getComputedStyle(element);
      return { text: style.color, background: style.getPropertyValue("--ui-bg").trim() };
    });
    expect(colors.background).toBe(dark ? "#18171e" : "#f6f5f2");
    expect(colors.text).toBe(dark ? "rgb(238, 234, 244)" : "rgb(36, 35, 43)");
    await page.screenshot({
      path: `test-results/redesign-docs-${dark ? "dark" : "light"}.png`,
      fullPage: true,
    });
  }
});
