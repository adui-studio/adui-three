import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("example source is highlighted, escaped and copied without line numbers", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  for (const id of ["basic", "labels", "webgpu"]) {
    await page.goto(`/play/?example=${id}&renderer=webgl`);
    await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
    await page.getByText("查看示例源码", { exact: true }).click();
    const pre = page.locator(".source .expressive-code pre");
    await expect(pre).toBeVisible();
    await expect(
      page.getByRole("region", { name: "TypeScript 源码：main.ts", exact: true }),
    ).toBeVisible();
    await expect(pre).toHaveAttribute("tabindex", "0");
    await expect(page.locator(".source-filename")).toHaveText("main.ts");
    const colors = await pre
      .locator("span[style]")
      .evaluateAll((tokens) => new Set(tokens.map((token) => getComputedStyle(token).color)).size);
    expect(colors).toBeGreaterThanOrEqual(4);
    await expect(pre.locator("header, input, button, script")).toHaveCount(0);
    await page.getByRole("button", { name: "复制代码", exact: true }).click();
    await expect(page.locator(".copy-feedback")).toHaveText("已复制");
    const original = (
      await readFile(new URL(`../../examples/recipes/${id}.ts`, import.meta.url), "utf8")
    ).replace(/\r\n/g, "\n");
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(
      original,
    );
  }
  await page.screenshot({ path: "test-results/highlighted-example.png", fullPage: true });
});

test("clipboard rejection gives a readable manual-copy fallback", async ({ page }) => {
  await page.goto("/play/?example=basic");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new Error("clipboard denied")),
      },
    });
  });
  await page.getByText("查看示例源码", { exact: true }).click();
  await page.getByRole("button", { name: "复制代码", exact: true }).click();
  await expect(page.locator(".copy-feedback")).toHaveText("无法复制，请选中代码后手动复制。");
  await expect(page.getByRole("button", { name: "复制代码", exact: true })).toBeEnabled();
  await expect(page.locator(".source pre")).toContainText("export const app");
});

test("GSAP scroll entry, live reduced-motion changes and VitePress route cleanup work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const root = page.locator(".VPContent");
  await expect(root).toHaveAttribute("data-motion", "ready");
  const article = page.locator(".principle-grid article").first();
  await expect
    .poll(async () =>
      Number(await article.evaluate((element) => getComputedStyle(element).opacity)),
    )
    .toBeLessThan(1);
  await article.scrollIntoViewIfNeeded();
  await expect(article).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(root).toHaveAttribute("data-motion", "reduced");
  for (const target of [".hero-copy h1", ".principle-grid article", ".home-code > div"]) {
    await expect(page.locator(target).first()).toHaveCSS("opacity", "1");
    await expect(page.locator(target).first()).toHaveCSS("transform", "none");
  }
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.getByRole("link", { name: "指南", exact: true }).click();
    await expect(page.locator(".vp-doc h1")).toContainText("快速开始");
    await expect(root).toHaveAttribute("data-motion", "reduced");
    await page.locator(".VPNavBarTitle a").click();
    await expect(page.locator(".product-home")).toBeVisible();
    await expect(root).toHaveAttribute("data-motion", "reduced");
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(root).toHaveAttribute("data-motion", "ready");
});

test("example switches release old motion styles and expose the current source", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/play/?example=basic");
  await expect(page.locator(".detail")).toHaveAttribute("data-motion", "ready");
  await page.getByRole("link", { name: "← 全部示例", exact: true }).click();
  await expect(page.locator(".home")).toHaveAttribute("data-motion", "ready");
  await expect(page.locator(".detail")).not.toHaveAttribute("data-motion");
  await page.locator('a.example-card[data-example="labels"]').click();
  await expect(page.locator(".detail")).toHaveAttribute("data-motion", "ready");
  await expect(page.locator(".home")).not.toHaveAttribute("data-motion");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator(".source-filename")).toHaveText("main.ts");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".detail")).toHaveAttribute("data-motion", "reduced");
  await expect(page.locator(".scene-inspector")).toHaveCSS("transform", "none");
});
