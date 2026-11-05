import { expect, test } from "@playwright/test";

test("HTML labels follow camera movement, decorative labels pass through and buttons stay interactive", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  const other = page.getByTestId("scene-B");
  const label = panel.getByTestId("object-label");
  await expect(label).toBeVisible();
  await expect(other.getByTestId("object-label")).toBeVisible();
  await panel.getByRole("button", { name: "暂停", exact: true }).click();
  const before = (await label.boundingBox())!;
  const canvas = (await panel.locator("canvas").boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 70, canvas.y + canvas.height / 2 + 30, {
    steps: 5,
  });
  await page.mouse.up();
  // Resume one owned loop to refresh DOM after the control's camera change.
  await panel.getByRole("button", { name: "运行", exact: true }).click();
  await expect
    .poll(async () => {
      const after = (await label.boundingBox())!;
      return Math.hypot(after.x - before.x, after.y - before.y);
    })
    .toBeGreaterThan(2);
  await panel.getByRole("button", { name: "暂停", exact: true }).click();
  expect(
    await label.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.tagName;
    }),
  ).toBe("CANVAS");
  const count = await panel.getAttribute("data-pick-count");
  const marker = panel.getByTestId("label-button");
  await marker.click();
  await expect(marker).toHaveAttribute("aria-pressed", "true");
  await expect(other.getByTestId("label-button")).toHaveAttribute("aria-pressed", "false");
  await marker.focus();
  await page.keyboard.press("Enter");
  await expect(marker).toHaveAttribute("aria-pressed", "false");
  await expect(panel).toHaveAttribute("data-pick-count", count!);
  expect(errors).toEqual([]);
});

test("labels stay aligned under CSS scaling and resize and hide at zero size while stopped", async ({
  page,
}) => {
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  const label = panel.getByTestId("object-label");
  const viewport = panel.locator(".viewport");
  await panel.getByRole("button", { name: "暂停", exact: true }).click();
  const before = (await label.boundingBox())!;
  const bounds = (await viewport.boundingBox())!;
  const relative = {
    x: (before.x - bounds.x) / bounds.width,
    y: (before.y - bounds.y) / bounds.height,
  };
  await viewport.evaluate((element: HTMLElement) => {
    element.style.transformOrigin = "top left";
    element.style.transform = "scale(0.75)";
  });
  const scaled = (await label.boundingBox())!;
  const scaledBounds = (await viewport.boundingBox())!;
  expect((scaled.x - scaledBounds.x) / scaledBounds.width).toBeCloseTo(relative.x, 2);
  expect((scaled.y - scaledBounds.y) / scaledBounds.height).toBeCloseTo(relative.y, 2);
  await panel.getByRole("button", { name: "收窄容器", exact: true }).click();
  await expect(label).toBeVisible();
  await panel.getByRole("button", { name: "零高度", exact: true }).click();
  await expect(label).toBeHidden();
  await panel.getByRole("button", { name: "零高度", exact: true }).click();
  await expect(label).toBeVisible();
  await panel.getByRole("button", { name: "显示标签", exact: true }).click();
  await expect(label).toBeHidden();
  await expect(page.getByTestId("scene-B").getByTestId("object-label")).toBeVisible();
  await panel.getByRole("button", { name: "显示标签", exact: true }).click();
  await expect(label).toBeVisible();
});

test("model labels are removed on replacement and all label DOM is removed on host teardown", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  await panel.getByRole("button", { name: "加载 GLB", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await expect(panel.getByTestId("object-label").last()).toHaveText("原创模型 · 场景 A");
  await expect(panel.getByTestId("object-label").last()).toBeVisible();
  await expect(panel.getByTestId("object-label").first()).toBeHidden();
  await panel.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect(panel.getByTestId("object-label")).toHaveCount(1);
  await expect(panel.getByTestId("object-label")).toBeVisible();
  await panel.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(panel.locator(".label-overlay > *")).toHaveCount(0);
  await expect(page.getByTestId("scene-B").getByTestId("object-label")).toBeVisible();
  await panel.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(panel.locator(".label-overlay > *")).toHaveCount(1);
  await expect(panel.getByTestId("object-label")).toHaveCount(1);
  await expect(panel.getByTestId("object-label")).toBeVisible();
  await page.screenshot({
    path: "test-results/labels-playground.png",
    fullPage: true,
    scale: "css",
  });
  expect(errors).toEqual([]);
});
