import { expect, test } from "@playwright/test";

test("paused skinned framing and transitions use the current pose after parent scale changes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A"),
    other = page.getByTestId("scene-B");
  for (const item of [panel, other])
    await item.getByRole("button", { name: "暂停", exact: true }).click();
  await panel.getByRole("button", { name: "加载骨骼样例", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await panel.getByRole("button", { name: "播放动画", exact: true }).click();
  await panel.getByRole("button", { name: "切换片段", exact: true }).click();
  await panel.getByRole("button", { name: "切换片段", exact: true }).click();
  await panel.getByRole("slider", { name: "动画定位" }).fill("50");
  await expect(panel.getByTestId("animation-clip")).toHaveText("Reach");
  const pixels = () =>
    panel.evaluate((element) => {
      element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
      const gl = element.querySelector("canvas")!.getContext("webgl2")!;
      const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bytes,
      );
      let count = 0;
      for (let offset = 0; offset < bytes.length; offset += 4)
        if (
          bytes[offset]! > 150 &&
          bytes[offset + 1]! > 120 &&
          bytes[offset]! > bytes[offset + 2]! * 1.25
        )
          count++;
      return { count, error: gl.getError() };
    });
  await panel.getByRole("button", { name: "适配视角", exact: true }).click();
  const original = await pixels();
  const distance = Number(await panel.getAttribute("data-fit-distance"));
  expect(original.count).toBeGreaterThan(500);
  await panel.getByRole("button", { name: "大模型", exact: true }).click();
  // No intermediate draw: the fit itself must synchronize attached bind inverses.
  await panel.getByRole("button", { name: "适配视角", exact: true }).click();
  const enlarged = await pixels();
  expect(Number(await panel.getAttribute("data-fit-distance")) / distance).toBeCloseTo(20, 3);
  expect(enlarged.count / original.count).toBeGreaterThan(0.9);
  expect(enlarged.count / original.count).toBeLessThan(1.1);
  expect(enlarged.error).toBe(0);
  await expect(panel).toHaveAttribute("data-state", "stopped");
  await panel.getByRole("button", { name: "大模型", exact: true }).click();
  await panel.getByRole("button", { name: "平滑取景", exact: true }).click();
  await expect(panel.getByTestId("transition-state")).toHaveText("completed");
  await panel.getByRole("button", { name: "暂停", exact: true }).click();
  expect(Number(await panel.getAttribute("data-fit-distance"))).toBeCloseTo(distance, 3);
  const transitioned = await pixels();
  expect(transitioned.count).toBeGreaterThan(500);
  expect(transitioned.error).toBe(0);
  await expect(other).toHaveAttribute("data-state", "stopped");
  await expect(other).toHaveAttribute("data-model-state", "idle");
  expect(errors).toEqual([]);
});

test("fitting a large loaded model updates a paused view, picking and labels without changing the other host", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await a.getByRole("button", { name: "KTX2 GLB", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  const frames = await a.getByTestId("frames").textContent();
  const other = Number(await b.getByTestId("frames").textContent());
  await a.getByRole("button", { name: "适配视角", exact: true }).click();
  const small = Number(await a.getAttribute("data-fit-distance"));
  await a.getByRole("button", { name: "大模型", exact: true }).click();
  await expect(a.locator(".model-feedback")).toContainText("已放大 20 倍");
  await a.getByRole("button", { name: "适配视角", exact: true }).click();
  const large = Number(await a.getAttribute("data-fit-distance"));
  expect(large).toBeGreaterThan(small * 10);
  await expect(a.getByTestId("object-label").last()).toBeVisible();
  const canvas = a.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(a.getByTestId("selected")).not.toHaveText("—");
  await expect(a).toHaveAttribute("data-state", "stopped");
  await expect(a.getByTestId("frames")).toHaveText(frames!);
  await expect
    .poll(async () => Number(await b.getByTestId("frames").textContent()))
    .toBeGreaterThan(other);
  expect(await b.getAttribute("data-fit-distance")).toBeNull();
  await expect(b).toHaveAttribute("data-model-state", "idle");
  await expect(a.locator(".error")).toBeHidden();
  await page.screenshot({ path: "test-results/camera-framing.png", fullPage: true, scale: "css" });
  expect(errors).toEqual([]);
});

test("framing accounts for a narrow viewport and remains safe across zero size, model removal and rebuild", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  await panel.getByRole("button", { name: "加载 GLB", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await panel.getByRole("button", { name: "暂停", exact: true }).click();
  await panel.getByRole("button", { name: "大模型", exact: true }).click();
  await panel.getByRole("button", { name: "适配视角", exact: true }).click();
  const wide = Number(await panel.getAttribute("data-fit-distance"));
  // Phone layout is square; narrow its container further to make horizontal FOV the limiting axis.
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole("button", { name: "收窄容器", exact: true }).click();
  const width = await panel.locator(".viewport").evaluate((element) => element.clientWidth);
  await expect(panel.getByTestId("size")).toHaveText(`${width} × 340`);
  await panel.getByRole("button", { name: "适配视角", exact: true }).click();
  expect(Number(await panel.getAttribute("data-fit-distance"))).toBeGreaterThan(wide);
  await panel.getByRole("button", { name: "零高度", exact: true }).click();
  await expect(panel.getByRole("button", { name: "适配视角", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "零高度", exact: true }).click();
  await expect(panel.getByRole("button", { name: "适配视角", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect(panel.getByRole("button", { name: "大模型", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "适配视角", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "stopped");
  await panel.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(panel.getByRole("button", { name: "适配视角", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await panel.getByRole("button", { name: "适配视角", exact: true }).click();
  await expect(panel.locator("canvas")).toHaveCount(1);
  await expect(panel.locator(".error")).toBeHidden();
  expect(errors).toEqual([]);
});

test("native OrbitControls keep orbiting the fitted model and a new fit clears drag inertia", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  await panel.getByRole("button", { name: "加载 GLB", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await panel.getByRole("button", { name: "适配视角", exact: true }).click();
  const canvas = panel.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const label = panel.getByTestId("object-label").last();
  const before = (await label.boundingBox())!;
  const bounds = (await canvas.boundingBox())!;
  const count = await panel.getAttribute("data-pick-count");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 70, bounds.y + bounds.height / 2 + 25, {
    steps: 5,
  });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const after = (await label.boundingBox())!;
      return Math.hypot(after.x - before.x, after.y - before.y);
    })
    .toBeGreaterThan(2);
  await expect(panel).toHaveAttribute("data-pick-count", count!);
  await panel.getByRole("button", { name: "适配视角", exact: true }).click();
  await expect(panel).toHaveAttribute("data-state", "running");
  await expect(panel.getByTestId("draw-calls")).not.toHaveText("0");
  await expect(panel.locator(".error")).toBeHidden();
  expect(errors).toEqual([]);
});
