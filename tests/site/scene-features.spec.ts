import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("asset batch retries only failed HDR while preserving the prepared model", async ({
  page,
}) => {
  let hdr = 0,
    model = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("animated.glb")) model++;
  });
  await page.route("**/environments/studio.hdr", async (route) => {
    hdr++;
    if (hdr === 1) await route.fulfill({ status: 503, body: "temporary failure" });
    else await route.continue();
  });
  await page.goto("/play/?example=model&renderer=webgl");
  await expect(page.getByRole("button", { name: "启用预加载环境", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("资产准备 2/2");
  expect(hdr).toBe(2);
  expect(model).toBe(1);
  await page.getByRole("button", { name: "启用预加载环境", exact: true }).click();
  await expect(page.getByRole("button", { name: "启用预加载环境", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "取消加载", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "重建", exact: true }).click();
  await expect(page.getByRole("button", { name: "暂停动画", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "启用预加载环境", exact: true })).toBeEnabled();
});

test("cancelled asset batches never expose a late model or animation controls", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const buffer = await readFile(new URL("../../fixtures/models/animated.glb", import.meta.url));
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route("**/models/animated.glb", async (route) => {
    started();
    await gate;
    await route.fulfill({ status: 200, contentType: "model/gltf-binary", body: buffer });
  });
  await page.goto("/play/?example=model&renderer=webgl");
  await requestStarted;
  await page.getByRole("button", { name: "取消加载", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("AbortError");
  release();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "暂停动画", exact: true })).toHaveCount(0);
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await page.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("host pause freezes the scene timeline while explicit seek renders a different pose", async ({
  page,
}) => {
  await page.goto("/play/?example=basic&renderer=webgl");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const canvas = page.locator("canvas");
  const first = await canvas.screenshot();
  expect(await canvas.screenshot()).toEqual(first);
  await page.getByRole("button", { name: "定位中点", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("6 秒");
  const sought = await canvas.screenshot();
  expect(sought.equals(first)).toBe(false);
  expect(await canvas.screenshot()).toEqual(sought);
  await page.getByRole("button", { name: "运行", exact: true }).click();
  await page.getByRole("button", { name: "重播时间线", exact: true }).click();
  await page.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(canvas).toHaveCount(0);
  await page.getByRole("button", { name: "重建", exact: true }).click();
  await expect(canvas).toHaveCount(1);
});

for (const renderer of ["webgl", "webgpu"]) {
  test(`orthographic ${renderer} renders effects, captures and rebuilds a single host`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/play/?example=webgpu&projection=orthographic&renderer=${renderer}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "暂停动画", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "使用透视相机", exact: true })).toBeVisible();
    await expect(page.locator(".detail")).toHaveAttribute("data-renderer", renderer);
    await page.getByRole("button", { name: "切换环境", exact: true }).click();
    await page.getByRole("button", { name: "切换泛光", exact: true }).click();
    await page.getByRole("button", { name: "截图", exact: true }).click();
    const image = page.getByRole("img", { name: "当前渲染截图", exact: true });
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(100);
    const colors = await image.evaluate((element) => {
      const picture = element as HTMLImageElement;
      const canvas = document.createElement("canvas");
      canvas.width = picture.naturalWidth;
      canvas.height = picture.naturalHeight;
      const context = canvas.getContext("2d")!;
      context.drawImage(picture, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const unique = new Set<number>();
      for (let i = 0; i < pixels.length; i += 16)
        unique.add((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!);
      return unique.size;
    });
    expect(colors).toBeGreaterThan(8);
    await page.getByRole("button", { name: "销毁", exact: true }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.getByRole("button", { name: "重建", exact: true }).click();
    await expect(page.getByRole("button", { name: "暂停动画", exact: true })).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(1);
    await page.getByRole("button", { name: "使用透视相机", exact: true }).click();
    await expect(page.getByRole("button", { name: "使用正交相机", exact: true })).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}
