import { expect, test } from "@playwright/test";

test("gallery search and category share a reloadable URL and a usable empty state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/play/?category=visual&q=webgpu");
  const cards = page.locator("a.example-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-example", "webgpu");
  await expect(page.getByRole("button", { name: "视觉与渲染", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const search = page.getByRole("searchbox", { name: "搜索示例" });
  await search.fill("");
  await expect(cards).toHaveCount(4);
  await search.fill("不存在的示例");
  await expect(cards).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "没有找到匹配的示例" })).toBeVisible();
  await page.reload();
  await expect(search).toHaveValue("不存在的示例");
  await page.getByRole("button", { name: "清除筛选", exact: true }).click();
  await expect(cards).toHaveCount(9);
  await expect(page).not.toHaveURL(/category=|q=/);
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "基础与资产", exact: true }).click();
    await expect(cards).toHaveCount(2);
    await page.getByRole("button", { name: "全部示例", exact: true }).click();
    await expect(cards).toHaveCount(9);
  }
  await cards.filter({ hasText: "点云与流光" }).click();
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await expect(page.locator('.example-switcher [aria-current="page"]')).toHaveAttribute(
    "data-example",
    "effects",
  );
  await page.locator('.example-switcher [data-example="basic"]').click();
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("narrow scene navigation brings the active example into view without scrolling the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto("/play/?example=instances&renderer=webgl");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  const active = page.locator('.example-switcher [aria-current="page"]');
  await expect(active).toHaveAttribute("data-example", "instances");
  await expect(active).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.locator('.example-switcher [data-example="basic"]').click();
  await expect(active).toHaveAttribute("data-example", "basic");
  await expect(active).toBeInViewport({ ratio: 1 });
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

test("Vue Bits highlights respond to pointer, keyboard and live reduced motion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const route of ["/play/", "/"]) {
    await page.goto(route);
    const card = page.locator('[data-vue-bits="spotlight-card"]').first();
    await card.scrollIntoViewIfNeeded();
    await card.hover({ position: { x: 36, y: 36 } });
    await expect(card).toHaveAttribute("data-spotlight", "pointer");
    await expect(card.locator(".spotlight-card__light")).toHaveCSS("opacity", "0.14");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(card).toHaveAttribute("data-spotlight", "stationary");
    await page.mouse.move(0, 0);
    await expect(card).toHaveAttribute("data-spotlight", "idle");
    await card.getByRole("link").first().focus();
    await expect(card).toHaveAttribute("data-spotlight", "stationary");
    await expect(card.getByRole("link").first()).toBeFocused();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(card).toHaveAttribute("data-spotlight", "stationary");
  }
  expect(errors).toEqual([]);
});

test("source language selection keeps its readable colors while hovered in both themes", async ({
  page,
}) => {
  await page.goto("/play/?example=basic&renderer=webgl");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await page.getByText("查看示例源码", { exact: true }).click();
  const language = page.getByRole("button", { name: "JavaScript", exact: true });
  await language.click();
  for (const light of [false, true]) {
    if (light) await page.getByRole("button", { name: "浅色主题", exact: true }).click();
    const color = light ? "rgb(255, 255, 255)" : "rgb(16, 19, 25)";
    const background = light ? "rgb(91, 43, 130)" : "rgb(202, 177, 242)";
    await page.mouse.move(0, 0);
    await expect(language).toHaveCSS("color", color);
    await expect(language).toHaveCSS("background-color", background);
    await language.hover();
    await expect(language).toHaveCSS("color", color);
    await expect(language).toHaveCSS("background-color", background);
  }
});

test("Vue Bits documentation cards and guide content remain usable without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator(".hero-copy h1")).toBeVisible();
    await expect(page.locator('[data-vue-bits="spotlight-card"]')).toHaveCount(3);
    await page.getByRole("link", { name: "开始使用", exact: true }).click();
    await expect(page.locator(".vp-doc h1")).toContainText("快速开始");
    await expect(page.locator(".doc-masthead")).toContainText("ADUI THREE / DOCS");
    await expect(page.locator(".vp-doc pre").first()).toBeVisible();
  } finally {
    await context.close();
  }
});
