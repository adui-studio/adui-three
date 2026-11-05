import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

async function point(canvas: Locator, x = 0.5, y = 0.45): Promise<{ x: number; y: number }> {
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  return { x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y };
}

async function clickAt(page: Page, canvas: Locator, x = 0.5, y = 0.45): Promise<void> {
  const position = await point(canvas, x, y);
  await page.mouse.click(position.x, position.y);
}

test("picking uses each canvas bounds, CSS scaling, hover and empty clicks without confusing orbit drags", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  const canvas = a.locator("canvas");
  await expect(a).toHaveAttribute("data-state", "running");
  await clickAt(page, canvas);
  await expect(a.getByTestId("selected")).toHaveText("立方体");
  await expect(a.getByTestId("hovered")).toHaveText("立方体");
  await expect(b.getByTestId("selected")).toHaveText("—");
  await clickAt(page, b.locator("canvas"));
  await expect(b.getByTestId("selected")).toHaveText("二十面体");
  // B's pick is verified; later steps only read its selection, so its GPU loop can stay stopped.
  await b.getByRole("button", { name: "暂停", exact: true }).click();
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  await canvas.evaluate((element) => {
    element.style.transformOrigin = "top left";
    element.style.transform = "scale(0.75)";
  });
  await clickAt(page, canvas);
  await expect(a.getByTestId("selected")).toHaveText("立方体");
  const count = await a.getAttribute("data-pick-count");
  const center = await point(canvas);
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 55, center.y + 20, { steps: 5 });
  await page.mouse.move(center.x, center.y, { steps: 5 });
  await page.mouse.up();
  await expect(a).toHaveAttribute("data-pick-count", count!);
  await clickAt(page, canvas, 0.05, 0.1);
  await expect(a.getByTestId("selected")).toHaveText("—");
  await expect(a.getByTestId("hovered")).toHaveText("—");
  await expect(b.getByTestId("selected")).toHaveText("二十面体");
  expect(errors).toEqual([]);
});

test("picking follows loaded model targets and removes old canvas listeners on rebuild", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  const canvas = panel.locator("canvas");
  await panel.getByRole("button", { name: "加载 GLB", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await clickAt(page, canvas, 0.5, 0.5);
  await expect(panel.getByTestId("selected")).not.toHaveText("—");
  await expect(panel.getByTestId("selected")).not.toHaveText("立方体");
  await panel.getByRole("button", { name: "移除模型", exact: true }).click();
  await clickAt(page, canvas);
  await expect(panel.getByTestId("selected")).toHaveText("立方体");
  const oldCanvas = await canvas.elementHandle();
  await panel.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(panel).toHaveAttribute("data-pick-count", "0");
  await oldCanvas!.evaluate((element) => {
    const event = {
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      isPrimary: true,
      pointerType: "mouse",
      button: 0,
    };
    for (const type of ["pointermove", "pointerdown", "pointerup"])
      element.dispatchEvent(new PointerEvent(type, event));
  });
  await expect(panel).toHaveAttribute("data-pick-count", "0");
  await expect(panel.getByTestId("hovered")).toHaveText("—");
  await clickAt(page, canvas);
  await expect(panel).toHaveAttribute("data-pick-count", "1");
  await expect(panel.getByTestId("selected")).toHaveText("立方体");
  await page.screenshot({ path: "test-results/picking-playground.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("picking tracks a skinned pose beyond its cached rest bounds while the host stays stopped", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  const other = page.getByTestId("scene-B");
  await panel.getByRole("button", { name: "暂停", exact: true }).click();
  await other.getByRole("button", { name: "暂停", exact: true }).click();
  await panel.getByRole("button", { name: "加载骨骼样例", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  const canvas = panel.locator("canvas");
  const coloredPoint = async () => {
    await canvas.scrollIntoViewIfNeeded();
    return panel.evaluate((element) => {
      element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
      const canvas = element.querySelector("canvas")!;
      const gl = canvas.getContext("webgl2")!;
      const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(
        0,
        0,
        gl.drawingBufferWidth,
        gl.drawingBufferHeight,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
      let x = 0,
        y = 0,
        count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i]! > 150 && data[i + 1]! > 120 && data[i]! > data[i + 2]! * 1.25) {
          x += (i / 4) % gl.drawingBufferWidth;
          y += Math.floor(i / 4 / gl.drawingBufferWidth);
          count++;
        }
      }
      if (count < 500) throw new Error("Expected the real skinned tetrahedron pixels");
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (x / count / gl.drawingBufferWidth) * rect.width,
        y: rect.bottom - (y / count / gl.drawingBufferHeight) * rect.height,
        error: gl.getError(),
      };
    });
  };
  // Drawing first establishes the native rest-pose bounding sphere.
  const rest = await coloredPoint();
  await panel.getByRole("button", { name: "播放动画", exact: true }).click();
  await panel.getByRole("button", { name: "切换片段", exact: true }).click();
  await panel.getByRole("button", { name: "切换片段", exact: true }).click();
  await panel.getByRole("slider", { name: "动画定位" }).fill("50");
  await expect(panel.getByTestId("animation-clip")).toHaveText("Reach");
  const moved = await coloredPoint();
  expect(Math.abs(moved.x - rest.x)).toBeGreaterThan(70);
  expect(moved.error).toBe(0);
  const frames = await panel.getByTestId("frames").textContent();
  await page.mouse.move(moved.x, moved.y);
  await expect(panel.getByTestId("hovered")).toHaveText("SkinMorphTetrahedron");
  await page.mouse.click(moved.x, moved.y);
  await expect(panel.getByTestId("selected")).toHaveText("SkinMorphTetrahedron");
  await panel.getByRole("slider", { name: "动画定位" }).fill("0");
  const returned = await coloredPoint();
  await page.mouse.click(returned.x, returned.y);
  await expect(panel.getByTestId("selected")).toHaveText("SkinMorphTetrahedron");
  await expect(panel.getByTestId("frames")).toHaveText(frames!);
  await expect(other.getByTestId("selected")).toHaveText("—");
  expect(errors).toEqual([]);
});
