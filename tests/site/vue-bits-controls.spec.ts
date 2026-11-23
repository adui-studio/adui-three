import { expect, test } from "@playwright/test";

test("icon-only VitePress copy buttons retain their accessible name under WarmTooltip", async ({
  page,
}) => {
  await page.goto("/guide/getting-started.html");
  const copy = page.getByRole("button", { name: "Copy Code", exact: true }).first();
  await expect(copy).toHaveAttribute("data-vue-bits-tooltip", "warm-tooltip");
  await copy.scrollIntoViewIfNeeded();
  await copy.focus();
  await expect(copy).toHaveAccessibleName("Copy Code");
  await expect(page.getByRole("tooltip")).toHaveText("Copy Code");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(copy).not.toHaveAttribute("aria-describedby");
  await expect(copy).toHaveAccessibleName("Copy Code");
});

test("GlideSelect supports actual pointer/keyboard choices while preserving the controller's native select", async ({
  page,
}) => {
  await page.goto("/play/?example=basic&renderer=webgl");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  const select = page.getByRole("combobox", { name: "渲染器", exact: true });
  await select.evaluate((node) => {
    (node as HTMLElement).dataset.identity = "original";
  });
  await select.click();
  const list = page.getByRole("listbox", { name: "渲染器", exact: true });
  await expect(list).toBeVisible();
  await expect(page.getByRole("option", { name: "WebGL", exact: true })).toHaveCount(1);
  await list.getByRole("option", { name: "WebGPU · 允许回退", exact: true }).click();
  await expect(page.locator(".detail")).toHaveAttribute("data-renderer", "webgpu");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await expect(select).toHaveAttribute("data-identity", "original");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await select.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(select).toHaveValue("webgl");
  await expect(page.locator(".detail")).toHaveAttribute("data-renderer", "webgl");
  await expect(page.locator(".viewport canvas")).toHaveCount(1);
  await select.evaluate((node) => {
    (node as HTMLSelectElement).options[2]!.disabled = true;
  });
  await select.click();
  await page.keyboard.press("End");
  await expect(select).toHaveAttribute("aria-activedescendant", /-1$/);
  await page
    .getByRole("listbox")
    .getByRole("option", { name: "WebGPU · 严格模式", exact: true })
    .click({ force: true });
  await expect(select).toHaveValue("webgl");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(select).toBeFocused();
  await expect(select).not.toHaveAttribute("aria-controls");
  expect(await select.locator("option[aria-hidden]").count()).toBe(0);
});

test("dynamically inserted controls gain real choices and tooltips, then release their floating UI", async ({
  page,
}) => {
  await page.goto("/api/collision.html");
  await page.evaluate(() => {
    const region = document.createElement("section");
    region.id = "dynamic-bits-test";
    region.innerHTML =
      '<button title="动态说明">动态操作</button><select aria-label="动态选项"><option value="a">第一项</option><option value="b">第二项</option></select><input type="range" aria-label="动态时间轴" min="0" max="100" value="25">';
    document.querySelector(".vp-doc")!.append(region);
  });
  const button = page.getByRole("button", { name: "动态操作", exact: true });
  await button.focus();
  await expect(page.getByRole("tooltip")).toHaveText("动态说明");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  const select = page.getByRole("combobox", { name: "动态选项", exact: true });
  await select.click();
  await page.getByRole("listbox").getByRole("option", { name: "第二项", exact: true }).click();
  await expect(select).toHaveValue("b");
  await select.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  const range = await page.getByRole("slider", { name: "动态时间轴", exact: true }).elementHandle();
  expect(await range!.evaluate((node) => Object.hasOwn(node, "value"))).toBe(true);
  await page.locator("#dynamic-bits-test").evaluate((node) => node.remove());
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect.poll(() => range!.evaluate((node) => Object.hasOwn(node, "value"))).toBe(false);
  await range!.dispose();
  await page
    .getByRole("navigation", { name: "文档目录", exact: true })
    .getByRole("link", { name: "相机", exact: true })
    .click();
  await expect(page).toHaveURL(/\/api\/camera\.html$/);
});
