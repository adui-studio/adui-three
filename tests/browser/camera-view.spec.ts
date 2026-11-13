import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

for (const id of ["orthographic", "perspective"]) {
  test(`${id} smooth bookmark restoration pauses with its host and restores exact GPU pixels independently`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?demo=orthographic");
    const panel = page.getByTestId(id),
      peer = page.getByTestId(id === "orthographic" ? "perspective" : "orthographic");
    await panel.getByRole("button", { name: "保存视角", exact: true }).click();
    const original = await pixels(panel),
      other = await pixels(peer);
    await panel.getByRole("button", { name: "放大视图", exact: true }).click();
    const canvas = panel.locator("canvas");
    await canvas.scrollIntoViewIfNeeded();
    const rect = (await canvas.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(rect.x + rect.width / 2 + 50, rect.y + rect.height / 2 + 20, {
      steps: 4,
    });
    await page.mouse.up({ button: "right" });
    const altered = await pixels(panel);
    expect(altered.signature).not.toBe(original.signature);
    await panel.evaluate((element) => {
      element.querySelector<HTMLButtonElement>('[data-action="smooth-view"]')!.click();
      element.querySelector<HTMLButtonElement>('[data-action="pause-host"]')!.click();
    });
    await expect(panel.getByTestId("projection-view-motion")).toHaveText("running");
    await expect(panel.getByTestId("projection-view-progress")).toHaveText("0.000");
    expect((await pixels(panel)).signature).toBe(altered.signature);
    await panel.getByRole("button", { name: "运行场景", exact: true }).click();
    await expect(panel.getByTestId("projection-view-motion")).toHaveText("completed");
    await panel.getByRole("button", { name: "暂停场景", exact: true }).click();
    const restored = await pixels(panel);
    expect(restored.signature).toBe(original.signature);
    expect(restored.error).toBe(0);
    expect((await pixels(peer)).signature).toBe(other.signature);
    await expect(panel.getByTestId("projection-error")).toBeEmpty();
    expect(errors).toEqual([]);
  });

  test(`${id} bookmark transitions hand off to input, resize, immediate restoration and reconstructed hosts`, async ({
    page,
  }) => {
    await page.goto("/?demo=orthographic");
    const panel = page.getByTestId(id);
    await panel.getByRole("button", { name: "保存视角", exact: true }).click();
    const original = await pixels(panel);
    await panel.getByRole("button", { name: "放大视图", exact: true }).click();
    await panel.evaluate((element) => {
      element.querySelector<HTMLButtonElement>('[data-action="smooth-view"]')!.click();
      element
        .querySelector("canvas")!
        .dispatchEvent(new WheelEvent("wheel", { deltaY: 1, bubbles: true, cancelable: true }));
      element.querySelector<HTMLButtonElement>('[data-action="pause-host"]')!.click();
    });
    await expect(panel.getByTestId("projection-view-motion")).toHaveText("cancelled");
    await panel.evaluate((element) => {
      element.querySelector<HTMLButtonElement>('[data-action="smooth-view"]')!.click();
      element.querySelector<HTMLButtonElement>('[data-action="width"]')!.click();
    });
    await expect(panel.getByTestId("projection-view-motion")).toHaveText("cancelled");
    await panel.getByRole("button", { name: "暂停场景", exact: true }).click();
    await panel.evaluate((element) => {
      element.querySelector<HTMLButtonElement>('[data-action="smooth-view"]')!.click();
      element.querySelector<HTMLButtonElement>('[data-action="restore-view"]')!.click();
      element.querySelector<HTMLButtonElement>('[data-action="pause-host"]')!.click();
    });
    await expect(panel.getByTestId("projection-view-motion")).toHaveText("cancelled");
    expect((await pixels(panel)).redHeight).toBe(original.redHeight);
    await panel.getByRole("button", { name: "重建", exact: true }).click();
    await panel.getByRole("button", { name: "放大视图", exact: true }).click();
    await panel.getByRole("button", { name: "平滑恢复视角", exact: true }).click();
    await expect(panel.getByTestId("projection-view-motion")).toHaveText("completed");
    await panel.getByRole("button", { name: "暂停场景", exact: true }).click();
    const restored = await pixels(panel);
    expect(restored.redHeight).toBe(original.redHeight);
    expect(restored.error).toBe(0);
    await expect(panel.getByTestId("projection-error")).toBeEmpty();
  });
}

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
