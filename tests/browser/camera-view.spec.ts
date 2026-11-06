import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

async function pixels(panel: Locator) {
  return panel.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const gl = element.querySelector("canvas")!.getContext("webgl2")!;
    const width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    const data = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let signature = 0,
      minY = height,
      maxY = -1;
    for (let offset = 0; offset < data.length; offset += 4) {
      const x = (offset / 4) % width,
        y = Math.floor(offset / 4 / width);
      signature +=
        (data[offset]! + data[offset + 1]! * 3 + data[offset + 2]! * 7) * (1 + x + 2 * y);
      if (data[offset]! > 180 && data[offset + 1]! < 130 && data[offset + 2]! < 130) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return { signature, redHeight: maxY - minY + 1, width, error: gl.getError() };
  });
}

test("saved JSON views restore exact perspective and orthographic pixels after zoom and native pan", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?demo=orthographic");
  for (const id of ["orthographic", "perspective"]) {
    const panel = page.getByTestId(id);
    await panel.getByRole("button", { name: "保存视角", exact: true }).click();
    await expect(panel.getByTestId("projection-view")).toHaveText("已保存");
    const original = await pixels(panel);
    await panel.getByRole("button", { name: "放大视图", exact: true }).click();
    const canvas = panel.locator("canvas");
    await canvas.scrollIntoViewIfNeeded();
    const rect = (await canvas.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(rect.x + rect.width / 2 + 70, rect.y + rect.height / 2 + 25, {
      steps: 5,
    });
    await page.mouse.up({ button: "right" });
    expect((await pixels(panel)).signature).not.toBe(original.signature);
    await panel.getByRole("button", { name: "恢复视角", exact: true }).click();
    const restored = await pixels(panel);
    expect(restored.signature).toBe(original.signature);
    expect(restored.error).toBe(0);
    await expect(panel.getByTestId("projection-zoom")).toHaveText("1.000");
    await expect(panel.getByTestId("projection-state")).toHaveText("ready");
    await expect(panel.getByTestId("projection-error")).toBeEmpty();
  }
  expect(errors).toEqual([]);
});

test("views outlive host reconstruction, adapt to current width and cancel an active orthographic transition", async ({
  page,
}) => {
  await page.goto("/?demo=orthographic");
  const panel = page.getByTestId("orthographic");
  await panel.getByRole("button", { name: "放大视图", exact: true }).click();
  await panel.getByRole("button", { name: "保存视角", exact: true }).click();
  const original = await pixels(panel);
  await panel.getByRole("button", { name: "收窄容器", exact: true }).click();
  await expect.poll(async () => (await pixels(panel)).width).toBeLessThan(original.width);
  await panel.getByRole("button", { name: "重建", exact: true }).click();
  await expect(panel.getByTestId("projection-zoom")).toHaveText("1.000");
  await expect(panel.getByTestId("projection-view")).toHaveText("已保存");
  await panel.getByRole("button", { name: "恢复视角", exact: true }).click();
  await expect(panel.getByTestId("projection-zoom")).toHaveText("1.500");
  const resized = await pixels(panel);
  expect(resized.redHeight).toBe(original.redHeight);
  expect(resized.error).toBe(0);
  await panel.getByRole("button", { name: "平滑取景", exact: true }).click();
  await panel.getByRole("button", { name: "恢复视角", exact: true }).click();
  await expect(panel.getByTestId("projection-motion")).toHaveText("cancelled");
  await expect(panel.getByTestId("projection-zoom")).toHaveText("1.500");
  await expect(panel.getByTestId("projection-error")).toBeEmpty();
});
