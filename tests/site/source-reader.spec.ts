import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { unzipSync, strFromU8 } from "fflate";

for (const width of [1440, 375]) {
  test(`source explorer supports files, wrapping, themes and modal reading at ${width}px`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/play/?example=model&renderer=webgl");
    await page.getByText("查看示例源码", { exact: false }).click();
    const main = page.getByRole("tab", { name: "main.ts", exact: true });
    const helper = page.getByRole("tab", { name: "index.html", exact: true });
    await expect(main).toHaveAttribute("aria-selected", "true");
    await main.focus();
    await main.press("ArrowRight");
    await expect(helper).toBeFocused();
    await expect(helper).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(".source-filename")).toHaveText("index.html");
    await page.getByRole("button", { name: "复制代码", exact: true }).click();
    await expect(page.locator(".copy-feedback")).toHaveText("已复制");
    expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(
      (
        await readFile(new URL("../../examples/recipes/index-ts.html", import.meta.url), "utf8")
      ).replace(/\r\n/g, "\n"),
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
  await page.getByRole("tab", { name: "index.html", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("resolve-copy")));
  await expect(page.locator(".copy-feedback")).toHaveText("");
  await expect(page.getByRole("button", { name: "复制代码", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "← 全部示例", exact: true }).click();
  await expect(page.locator(".source-code")).toBeEmpty();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("JavaScript source copies a standalone entry and downloads the same complete project", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/play/?example=model&renderer=webgl");
  await page.getByText("查看示例源码", { exact: true }).click();
  await page.getByRole("button", { name: "JavaScript", exact: true }).click();
  const entry = page.getByRole("tab", { name: "main.js", exact: true });
  await expect(entry).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("region", { name: "JavaScript 源码：main.js", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "复制代码", exact: true }).click();
  await expect(page.locator(".copy-feedback")).toHaveText("已复制");
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n");
  expect(copied).toBe(
    (await readFile(new URL("../../examples/recipes/model.js", import.meta.url), "utf8")).replace(
      /\r\n/g,
      "\n",
    ),
  );
  expect(copied).not.toMatch(/shared\.ts|ExampleContext|import\.meta\.env|from ["']\.\./);
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载完整工程", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("model-js.zip");
  const files = unzipSync(await readFile((await download.path())!));
  expect(strFromU8(files["main.js"]!)).toBe(copied);
  expect(strFromU8(files["index.html"]!)).toContain('src="./main.js"');
  expect(JSON.parse(strFromU8(files["package.json"]!)).dependencies["@adui/three"]).toBe(
    "file:vendor/adui-three-0.0.0.tgz",
  );
  expect(files["models/animated.glb"]).toEqual(
    new Uint8Array(await readFile(new URL("../../fixtures/models/animated.glb", import.meta.url))),
  );
  expect(files["vendor/adui-three-0.0.0.tgz"]!.length).toBeGreaterThan(1000);
  await page.getByRole("tab", { name: "index.html", exact: true }).click();
  await expect(page.locator(".source-code pre script")).toHaveCount(0);
});

test("source remains readable when strict WebGPU creation fails", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "gpu", { configurable: true, get: () => undefined });
  });
  await page.goto("/play/?example=webgpu&renderer=webgpu-strict");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "error");
  await page.getByText("查看示例源码", { exact: false }).click();
  await expect(page.locator(".source-code pre")).toContainText("ThreeApp.create");
  await expect(page.getByRole("tab", { name: "main.ts", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "复制代码", exact: true })).toBeEnabled();
});

test("a delayed standalone-source module does not block the live scene", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/assets/labels-*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes("downloads/labels-ts.zip")) await gate;
    await route.fulfill({ response, body });
  });
  try {
    await page.goto("/play/?example=labels&renderer=webgl");
    await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
    await expect(page.locator("canvas")).toHaveCount(1);
    await page.getByText("查看示例源码", { exact: true }).click();
    await expect(page.locator(".source-filename")).toHaveText("正在加载源码…");
    await expect(page.getByRole("button", { name: "复制代码", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "展开阅读", exact: true })).toBeDisabled();
    release();
    await expect(page.locator(".source-filename")).toHaveText("main.ts");
    await expect(page.getByRole("button", { name: "复制代码", exact: true })).toBeEnabled();
  } finally {
    release();
  }
});

test("a failed standalone-source module leaves the live scene usable", async ({ page }) => {
  await page.route("**/assets/labels-*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes("downloads/labels-ts.zip")) await route.abort();
    else await route.fulfill({ response, body });
  });
  await page.goto("/play/?example=labels&renderer=webgl");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await page.getByText("查看示例源码", { exact: true }).click();
  await expect(page.locator(".source-filename")).toHaveText("示例代码加载失败");
  await expect(page.locator(".copy-feedback")).toHaveText("示例代码暂时不可用，请刷新页面重试。");
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "stopped");
});
