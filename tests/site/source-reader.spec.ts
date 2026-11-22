import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const width of [1440, 375]) {
  test(`source explorer supports files, wrapping, themes and modal reading at ${width}px`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/play/?example=model&renderer=webgl");
    await page.getByText("查看示例源码", { exact: false }).click();
    const main = page.getByRole("tab", { name: "model.ts", exact: true });
    const helper = page.getByRole("tab", { name: "shared.ts", exact: true });
    await expect(main).toHaveAttribute("aria-selected", "true");
    await main.focus();
    await main.press("ArrowRight");
    await expect(helper).toBeFocused();
    await expect(helper).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".source-filename")).toHaveText("src/shared.ts");
    await page.getByRole("button", { name: "复制代码", exact: true }).click();
    await expect(page.locator(".copy-feedback")).toHaveText("已复制");
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(
      (await readFile(new URL("../../examples/src/shared.ts", import.meta.url), "utf8")).replace(
        /\r\n/g,
        "\n",
      ),
    );
    await helper.press("Home");
    await expect(main).toBeFocused();
    await expect(page.locator(".source-code .ec-line.mark")).toHaveCount(1);
    const wrap = page.getByRole("button", { name: "自动换行", exact: true });
    await wrap.click();
    await expect(wrap).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".source-code pre")).toHaveCSS("white-space", "pre-wrap");
    await expect(page.locator(".source-code .ec-line .code").first()).toHaveCSS(
      "white-space",
      "pre-wrap",
    );
    expect(
      await page.locator(".source-code pre").evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    const pre = page.locator(".source-code pre");
    const dark = await pre.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByRole("button", { name: "浅色主题", exact: true }).click();
    await expect(page.locator(".source-workspace")).toHaveAttribute("data-code-theme", "light");
    expect(await pre.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(dark);
    await page.getByRole("button", { name: "展开阅读", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "源码阅读", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "收起阅读", exact: true })).toBeFocused();
    await page.screenshot({ path: `test-results/source-reader-${width}.png` });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("button", { name: "展开阅读", exact: true })).toBeFocused();
    await expect(page.locator(".source > .source-workspace")).toHaveCount(1);
  });
}

test("late clipboard results cannot replace feedback for a different source file", async ({
  page,
}) => {
  await page.goto("/play/?example=basic");
  await page.getByText("查看示例源码", { exact: false }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          new Promise<void>((resolve) => {
            window.addEventListener("resolve-copy", () => resolve(), { once: true });
          }),
      },
    });
  });
  await page.getByRole("button", { name: "复制代码", exact: true }).click();
  await expect(page.locator(".copy-feedback")).toHaveText("正在复制…");
  await page.getByRole("tab", { name: "shared.ts", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("resolve-copy")));
  await expect(page.locator(".copy-feedback")).toHaveText("");
  await expect(page.getByRole("button", { name: "复制代码", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "← 全部示例", exact: true }).click();
  await expect(page.locator(".source-code")).toBeEmpty();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("source remains readable when strict WebGPU creation fails", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { configurable: true, get: () => undefined });
  });
  await page.goto("/play/?example=webgpu&renderer=webgpu-strict");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "error");
  await page.getByText("查看示例源码", { exact: false }).click();
  await expect(page.locator(".source-code pre")).toContainText("ThreeApp.create");
  await expect(page.getByRole("tab", { name: "webgpu.ts", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "复制代码", exact: true })).toBeEnabled();
});
