import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __closedModelBitmaps: number;
  }
}

async function observeBitmapCleanup(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__closedModelBitmaps = 0;
    const original = Object.getOwnPropertyDescriptor(ImageBitmap.prototype, "close")!.value as (
      this: ImageBitmap,
    ) => void;
    ImageBitmap.prototype.close = function (): void {
      window.__closedModelBitmaps++;
      original.call(this);
    };
  });
}

test("equal-URL GLB tasks cancel independently, clean late images, and GLTF can replace the model", async ({
  page,
}) => {
  await observeBitmapCleanup(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/models/sample.glb", async (route) => {
    requests++;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/");
    const first = page.getByTestId("scene-A");
    const second = page.getByTestId("scene-B");
    await first.getByRole("button", { name: "加载 GLB", exact: true }).click();
    await second.getByRole("button", { name: "加载 GLB", exact: true }).click();
    await expect(first).toHaveAttribute("data-model-state", "loading");
    await expect(second).toHaveAttribute("data-model-state", "loading");
    await first.getByRole("button", { name: "取消加载" }).click();
    await expect(first).toHaveAttribute("data-model-state", "cancelled");
    release();
    await expect(second).toHaveAttribute("data-model-state", "loaded");
    await expect.poll(() => page.evaluate(() => window.__closedModelBitmaps)).toBe(1);
    expect(requests).toBe(1);
    await expect(first).toHaveAttribute("data-model-state", "cancelled");
    await second.getByRole("button", { name: "移除模型" }).click();
    await expect(second).toHaveAttribute("data-model-state", "idle");
    await expect.poll(() => page.evaluate(() => window.__closedModelBitmaps)).toBe(2);
    await first.getByRole("button", { name: "加载 GLTF", exact: true }).click();
    await expect(first).toHaveAttribute("data-model-state", "loaded");
    await expect(first.getByTestId("draw-calls")).not.toHaveText("0");
    await page.screenshot({ path: "test-results/model-playground.png", fullPage: true });
    await first.getByRole("button", { name: "销毁", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__closedModelBitmaps)).toBe(3);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});

test("disposing a loading host prevents resurrection and invalid GLTF reports a recoverable error", async ({
  page,
}) => {
  await observeBitmapCleanup(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/models/sample.glb", async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/");
    const panel = page.getByTestId("scene-A");
    await panel.getByRole("button", { name: "加载 GLB", exact: true }).click();
    await expect(panel).toHaveAttribute("data-model-state", "loading");
    await panel.getByRole("button", { name: "销毁", exact: true }).click();
    release();
    await expect.poll(() => page.evaluate(() => window.__closedModelBitmaps)).toBe(1);
    await expect(panel.locator("canvas")).toHaveCount(0);
    await expect(panel).toHaveAttribute("data-state", "disposed");
    await expect(panel).toHaveAttribute("data-model-state", "idle");
    await panel.getByRole("button", { name: "重建 ↻" }).click();
    await panel.getByRole("button", { name: "失败示例" }).click();
    await expect(panel).toHaveAttribute("data-model-state", "error");
    await expect(panel.locator(".model-feedback")).toContainText("加载失败");
    await expect(panel).toHaveAttribute("data-state", "running");
    await panel.getByRole("button", { name: "加载 GLTF", exact: true }).click();
    await expect(panel).toHaveAttribute("data-model-state", "loaded");
    await expect(panel.locator("canvas")).toHaveCount(1);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
