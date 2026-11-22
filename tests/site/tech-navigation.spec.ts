import { writeFile, unlink } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("finite interface entry settles without relying on advancing animation frames", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
    window.cancelAnimationFrame = () => {};
  });
  await page.goto("/");
  await expect(page.locator(".VPContent")).toHaveAttribute("data-motion", "ready");
  await expect
    .poll(() =>
      page.locator(".bits-split-letter").evaluateAll(
        (nodes) =>
          nodes.length > 0 &&
          nodes.every((node) => {
            const style = getComputedStyle(node);
            return style.opacity === "1" && style.transform === "none";
          }),
      ),
    )
    .toBe(true);
  await expect(page.locator(".hero-copy h1")).toBeVisible();
});

test("Vue Bits owns finite home entry and restores its styles when motion preferences change", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const letters = page.locator(".hero-copy .bits-split-letter");
  await expect(letters).toHaveCount(Array.from("为三维场景，").length);
  await expect
    .poll(() =>
      letters.evaluateAll((nodes) =>
        nodes.every((node) => {
          const style = getComputedStyle(node);
          return style.opacity === "1" && style.transform === "none";
        }),
      ),
    )
    .toBe(true);
  await expect(page.locator('.hero-study[data-vue-bits="animated-content"]')).toHaveCSS(
    "transform",
    "none",
  );
  await expect(page.locator(".bits-gradient-text")).toHaveCSS("animation-iteration-count", "1");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".bits-gradient-text")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".hero-copy h1")).toHaveCSS("transform", "none");
  await page.getByRole("link", { name: "指南", exact: true }).click();
  await page.locator(".VPNavBarTitle a").click();
  await expect(letters).toHaveCount(Array.from("为三维场景，").length);
  await expect(page.locator(".hero-copy h1")).toBeVisible();
});

test("documentation directory opens the active group, filters and navigates after direct entry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/api/collision.html");
  const directory = page.getByRole("navigation", { name: "文档目录", exact: true });
  await expect(directory.getByRole("link", { name: "碰撞", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const filter = page.getByRole("searchbox", { name: "筛选文档目录" });
  await filter.fill("相机");
  await directory.getByRole("link", { name: "相机", exact: true }).click();
  await expect(page).toHaveURL(/\/api\/camera\.html$/);
  await expect(directory.getByRole("link", { name: "相机", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await filter.fill("");
  const summary = page.locator(".doc-directory summary").filter({ hasText: "API 参考" });
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(directory.getByRole("link", { name: "模型加载", exact: true })).not.toBeVisible();
  await page.keyboard.press("Enter");
  await directory.getByRole("link", { name: "模型加载", exact: true }).click();
  await expect(page).toHaveURL(/\/api\/loaders\.html$/);
  await page.reload();
  await expect(directory.getByRole("link", { name: "模型加载", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(errors).toEqual([]);
});

test("mobile documentation directory navigates, closes and restores focus with Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/api/collision.html");
  const trigger = page.getByRole("button", { name: "文档目录", exact: true });
  await trigger.click();
  await expect(page.locator(".VPSidebar")).toHaveClass(/\bopen\b/);
  await page
    .getByRole("navigation", { name: "文档目录", exact: true })
    .getByRole("link", { name: "相机", exact: true })
    .click();
  await expect(page).toHaveURL(/\/api\/camera\.html$/);
  await expect(page.locator(".VPSidebar")).not.toHaveClass(/\bopen\b/);
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".VPSidebar")).not.toHaveClass(/\bopen\b/);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

test("Vue Bits layered menus support focus, live reduced motion and native navigation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ["/", "/play/"]) {
    await page.goto(route);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const trigger = page.getByRole("button", { name: "探索", exact: true });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "探索", exact: true });
    await expect(dialog).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(dialog.getByRole("link").first()).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole("link", { name: route === "/" ? /开始使用/ : /使用文档/ }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).not.toHaveURL(new RegExp(`${route.replace(/[?./]/g, "\\$&")}$`));
  }
  expect(errors).toEqual([]);
});

test("documentation directory remains navigable with JavaScript disabled", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/api/collision.html");
    await page
      .getByRole("navigation", { name: "文档目录", exact: true })
      .getByRole("link", { name: "相机", exact: true })
      .click();
    await expect(page).toHaveURL(/\/api\/camera\.html$/);
    await expect(page.locator(".vp-doc h1")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("preview serves newly written build files and their updates without a restart", async ({
  request,
}) => {
  const name = `__preview-refresh-${process.pid}.html`;
  const file = new URL(`../../apps/docs/dist/${name}`, import.meta.url);
  await writeFile(file, "<h1>first build</h1>", { flag: "wx" });
  try {
    const first = await request.get(`/${name}`);
    expect(first.status()).toBe(200);
    expect(first.headers()["cache-control"]).toBe("no-store");
    expect(await first.text()).toContain("first build");
    await writeFile(file, "<h1>second build</h1>");
    expect(await (await request.get(`/${name}`)).text()).toContain("second build");
    expect((await request.get("/assets/__not-an-existing-module.js")).status()).toBe(404);
  } finally {
    await unlink(file);
  }
});
