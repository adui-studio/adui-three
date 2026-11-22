import { expect, test } from "@playwright/test";
const errors: string[] = [];
test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
});
test.afterEach(() => expect(errors).toEqual([]));
test("VitePress renders guides and API on the server, navigates and searches locally", async ({
  page,
  request,
}) => {
  const html = await request.get("/api/effects.html");
  expect(html.ok()).toBe(true);
  expect(await html.text()).toContain("attachFlyPoints");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /为三维场景，\s*建立清晰秩序/ })).toBeVisible();
  await page.screenshot({ path: "test-results/docs-home.png", fullPage: true });
  await page.getByRole("link", { name: "开始使用", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^快速开始/, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "搜索文档", exact: true }).click();
  await page.locator("#localsearch-input").fill("attachFlyPoints");
  await expect(page.locator(".VPLocalSearchBox")).toContainText("动态特效");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "开发", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^开发文档/, level: 1 })).toBeVisible();
  await page.goto("/examples/basic.html");
  await expect(page.locator(".vp-doc")).toContainText(/ThreeApp\.create/);
  const source = page.locator('.vp-doc a[href*="github.com"][href*="recipes/basic.ts"]').first();
  await expect(source).toHaveAttribute(
    "href",
    /github.com\/adui-studio\/adui-three\/blob\/main\/examples\/recipes\/basic.ts/,
  );
});
for (const id of [
  "basic",
  "model",
  "camera",
  "labels",
  "effects",
  "shadows",
  "navigation",
  "instances",
]) {
  test(
    "formal example " + id + " renders native WebGL pixels and actual source",
    async ({ page }) => {
      await page.goto("/play/?example=" + id);
      // The gallery loads its scene module and raw source after the document load event.
      await page.waitForLoadState("networkidle");
      await expect(page.locator(".detail")).toHaveAttribute("data-example", id);
      await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
      await expect(page.locator("canvas")).toHaveCount(1);
      if (id === "model")
        await expect(page.getByRole("button", { name: "暂停动画", exact: true })).toBeVisible();
      const output = await page.locator("canvas").evaluate(
        (canvas) =>
          new Promise<{ colors: number; error: number }>((resolve) => {
            requestAnimationFrame(() => {
              const gl = (canvas as HTMLCanvasElement).getContext("webgl2")!,
                bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4),
                colors = new Set<number>();
              gl.readPixels(
                0,
                0,
                gl.drawingBufferWidth,
                gl.drawingBufferHeight,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                bytes,
              );
              for (let i = 0; i < bytes.length; i += 4)
                colors.add((bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!);
              resolve({ colors: colors.size, error: gl.getError() });
            });
          }),
      );
      expect(output.error).toBe(0);
      expect(output.colors).toBeGreaterThan(8);
      await page.getByText("查看示例源码", { exact: true }).click();
      await expect(page.locator(".source-code pre")).toBeVisible();
      await expect(page.locator(".source pre")).toContainText("ThreeApp.create");
      if (id === "effects")
        await page.screenshot({ path: "test-results/formal-effects.png", fullPage: true });
    },
  );
}
test("complex DOM labels retain form input, buttons work, and rebuild/history keep one canvas", async ({
  page,
}) => {
  await page.goto("/play/?example=labels");
  const note = page.getByRole("textbox", { name: "设备备注", exact: true });
  await expect(note).toBeVisible();
  await page.screenshot({ path: "test-results/formal-labels.png", fullPage: true });
  await note.fill("例行巡检");
  await page.getByRole("button", { name: "查看设备", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("1 次");
  await expect(note).toHaveValue("例行巡检");
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "stopped");
  await page.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(note).toHaveCount(0);
  await page.getByRole("button", { name: "重建", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(note).toHaveValue("");
  await page.getByRole("link", { name: "← 全部示例", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.locator('a.example-card[data-example="effects"]').click();
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.goBack();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.goForward();
  await expect(page.locator("canvas")).toHaveCount(1);
});
test("leaving a loading model cannot replace the new example or revive its old canvas", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/models/animated.glb", async (route) => {
    await gate;
    await route.continue();
  });
  const requested = page.waitForRequest("**/models/animated.glb");
  await page.goto("/play/?example=model");
  await requested;
  await page.getByRole("link", { name: "← 全部示例", exact: true }).click();
  await page.locator('a.example-card[data-example="effects"]').click();
  const response = page.waitForResponse("**/models/animated.glb");
  release();
  await response;
  await expect(page.locator(".detail")).toHaveAttribute("data-example", "effects");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText("点云");
});

test("WebGPU example initializes asynchronously, exposes its actual backend and survives switching", async ({
  page,
}) => {
  await page.goto("/play/?example=webgpu");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await expect(page.getByRole("status")).toContainText("实际后端：");
  await expect(page.getByRole("button", { name: "暂停动画", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "切换泛光", exact: true }).click();
  await page.getByRole("button", { name: "切换环境", exact: true }).click();
  await page.getByRole("button", { name: "截图", exact: true }).click();
  const preview = page.getByAltText("当前渲染截图");
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.getByText("查看示例源码", { exact: true }).click();
  await expect(page.locator(".source pre")).toContainText("ThreeApp.create");
  await page.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.getByRole("button", { name: "重建", exact: true }).click();
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await page.getByRole("link", { name: "← 全部示例", exact: true }).click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.locator('a.example-card[data-example="basic"]').click();
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await expect(page.locator("canvas")).toHaveCount(1);
});

for (const id of [
  "basic",
  "model",
  "camera",
  "labels",
  "effects",
  "shadows",
  "navigation",
  "instances",
  "webgpu",
]) {
  test(`formal example ${id} uses the same API on the node renderer`, async ({ page }) => {
    await page.goto(`/play/?example=${id}&renderer=webgpu`);
    // The optional renderer chunk is fetched after the initial document load.
    await page.waitForLoadState("networkidle");
    const detail = page.locator(".detail");
    await expect(detail).toHaveAttribute("data-state", "running");
    await expect(detail).toHaveAttribute("data-renderer", "webgpu");
    await expect(detail).toHaveAttribute("data-backend", /webgl2|webgpu/);
    await expect(page.getByRole("combobox", { name: "渲染器", exact: true })).toHaveValue("webgpu");
    const png = await page.locator("canvas").screenshot();
    const colors = await page.evaluate(
      async (bytes) => {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const surface = document.createElement("canvas");
        surface.width = bitmap.width;
        surface.height = bitmap.height;
        const context = surface.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        const pixels = context.getImageData(0, 0, surface.width, surface.height).data,
          values = new Set<number>();
        for (let i = 0; i < pixels.length; i += 4)
          values.add((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!);
        return values.size;
      },
      [...png],
    );
    expect(colors).toBeGreaterThan(8);
    if (id === "effects")
      await page.screenshot({ path: "test-results/formal-webgpu-effects.png", fullPage: true });
  });
}

test("renderer selection rebuilds one host, restores history and keeps strict failures visible", async ({
  page,
}) => {
  await page.goto("/play/?example=basic&renderer=webgl");
  await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  await page.getByRole("combobox", { name: "渲染器", exact: true }).selectOption("webgpu");
  await expect(page).toHaveURL(/renderer=webgpu/);
  await expect(page.locator(".detail")).toHaveAttribute("data-renderer", "webgpu");
  await expect(page.locator("canvas")).toHaveCount(1);
  await page.goBack();
  await expect(page.getByRole("combobox", { name: "渲染器", exact: true })).toHaveValue("webgl");
  await expect(page.locator(".detail")).toHaveAttribute("data-renderer", "webgl");
  const available = await page.evaluate(async () => {
    const gpu = Reflect.get(navigator, "gpu") as
      | { requestAdapter(options: { featureLevel: string }): Promise<object | null> }
      | undefined;
    return !!(await gpu?.requestAdapter({ featureLevel: "compatibility" }));
  });
  await page.getByRole("combobox", { name: "渲染器", exact: true }).selectOption("webgpu-strict");
  if (available) {
    await expect(page.locator(".detail")).toHaveAttribute("data-backend", "webgpu");
    await expect(page.locator(".detail")).toHaveAttribute("data-state", "running");
  } else {
    await expect(page.locator(".detail")).toHaveAttribute("data-state", "error");
    await expect(page.getByRole("status")).toContainText("原生 WebGPU 初始化失败");
    await expect(page.locator("canvas")).toHaveCount(0);
  }
  await page.getByText("查看示例源码", { exact: true }).click();
  await expect(page.locator(".source-code pre")).toContainText("ThreeApp.create");
  await expect(page.getByRole("button", { name: "复制代码", exact: true })).toBeEnabled();
});
