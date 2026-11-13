import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __pathBuffers: Set<WebGLBuffer>;
  }
}

async function arrow(page: Page) {
  return page.getByTestId("path-demo").evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!,
      gl = canvas.getContext("webgl2")!;
    const width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    const bytes = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let count = 0,
      x = 0,
      y = 0;
    for (let offset = 0; offset < bytes.length; offset += 4) {
      if (
        bytes[offset]! > 180 &&
        bytes[offset + 1]! > 70 &&
        bytes[offset]! > bytes[offset + 1]! * 1.3
      ) {
        count++;
        x += (offset / 4) % width;
        y += Math.floor(offset / 4 / width);
      }
    }
    const rect = canvas.getBoundingClientRect();
    return {
      count,
      x: rect.left + (x / count / width) * rect.width,
      y: rect.bottom - (y / count / height) * rect.height,
      error: gl.getError(),
    };
  });
}

test("path timeline samples paused native pixels, retains picking and resumes or rebuilds independently", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?demo=path");
  await expect(page.getByTestId("path-state")).toHaveText("running");
  await page.getByRole("button", { name: "暂停场景", exact: true }).click();
  await page.getByRole("button", { name: "播放一次", exact: true }).click();
  const first = await arrow(page),
    peer = await page.getByTestId("path-peer-progress").textContent();
  const slider = page.getByRole("slider", { name: "路径 A 定位" });
  await slider.fill("50");
  await expect(page.getByTestId("path-state")).toHaveText("paused");
  await expect(page.getByTestId("path-progress")).toHaveText("0.500");
  await expect(page.getByTestId("path-host")).toHaveText("stopped");
  await expect(page.getByTestId("path-peer-progress")).toHaveText(peer!);
  const sampled = await arrow(page);
  expect(sampled.count).toBeGreaterThan(15);
  expect(sampled.error).toBe(0);
  expect(Math.hypot(first.x - sampled.x, first.y - sampled.y)).toBeGreaterThan(5);
  await page.mouse.click(sampled.x, sampled.y);
  await expect(page.getByTestId("path-picked")).toHaveText("路径 A");
  await slider.fill("0");
  const reset = await arrow(page);
  expect(Math.hypot(first.x - reset.x, first.y - reset.y)).toBeLessThan(1);
  await slider.fill("100");
  await expect(page.getByTestId("path-state")).toHaveText("paused");
  await expect(page.getByTestId("path-result")).toHaveText("—");
  await page.getByRole("button", { name: "继续路径", exact: true }).click();
  await page.getByRole("button", { name: "运行场景", exact: true }).click();
  await expect(page.getByTestId("path-result")).toHaveText("completed");
  await expect(slider).toBeDisabled();
  await page.getByRole("button", { name: "暂停场景", exact: true }).click();
  await page.getByRole("button", { name: "重建目标", exact: true }).click();
  await expect(slider).toBeEnabled();
  await slider.fill("25");
  await expect(page.getByTestId("path-progress")).toHaveText("0.250");
  await page.getByRole("button", { name: "销毁场景", exact: true }).click();
  await expect(slider).toBeDisabled();
  await page.getByRole("button", { name: "重建场景", exact: true }).click();
  await expect(slider).toBeEnabled();
  await expect(page.getByTestId("path-error")).toBeHidden();
  expect(errors).toEqual([]);
});

test("real path pixels move, per-object pause retains picking and another target continues", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?demo=path");
  await expect(page.getByTestId("path-state")).toHaveText("running");
  await page.getByRole("button", { name: "暂停场景", exact: true }).click();
  await page.getByRole("button", { name: "播放一次", exact: true }).click();
  const original = await arrow(page);
  expect(original.count).toBeGreaterThan(15);
  await page.getByRole("button", { name: "运行场景", exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByTestId("path-progress").textContent()))
    .toBeGreaterThan(0.15);
  await page.getByRole("button", { name: "暂停路径", exact: true }).click();
  const moved = await arrow(page);
  expect(moved.count).toBeGreaterThan(15);
  expect(moved.error).toBe(0);
  expect(Math.hypot(moved.x - original.x, moved.y - original.y)).toBeGreaterThan(5);
  const position = await page.getByTestId("path-position").textContent();
  const peer = await page.getByTestId("path-peer-progress").textContent();
  await expect(page.getByTestId("path-peer-progress")).not.toHaveText(peer!);
  await expect(page.getByTestId("path-position")).toHaveText(position!);
  await page.mouse.click(moved.x, moved.y);
  await expect(page.getByTestId("path-picked")).toHaveText("路径 A");
  await page.getByRole("button", { name: "继续路径", exact: true }).click();
  await expect(page.getByTestId("path-state")).toHaveText("completed");
  await expect(page.getByTestId("path-progress")).toHaveText("1.000");
  await expect(page.getByTestId("path-host")).toHaveText("running");
  await page.screenshot({ path: "test-results/path-playground.png", fullPage: true, scale: "css" });
  expect(errors).toEqual([]);
});

test("manual edits and detachment end only the affected target, which can reuse borrowed assets", async ({
  page,
}) => {
  await page.goto("/?demo=path");
  await expect(page.getByTestId("path-state")).toHaveText("running");
  await page.getByRole("button", { name: "手动移动", exact: true }).click();
  await expect(page.getByTestId("path-state")).toHaveText("cancelled");
  await expect(page.getByTestId("path-result")).toHaveText("target-changed");
  const position = await page.getByTestId("path-position").textContent();
  const peer = await page.getByTestId("path-peer-progress").textContent();
  await expect(page.getByTestId("path-peer-progress")).not.toHaveText(peer!);
  await expect(page.getByTestId("path-position")).toHaveText(position!);
  await page.getByRole("button", { name: "重建目标", exact: true }).click();
  await expect(page.getByTestId("path-state")).toHaveText("running");
  await page.getByRole("button", { name: "移除目标", exact: true }).click();
  await expect(page.getByTestId("path-result")).toHaveText("target-changed");
  await expect(page.getByRole("button", { name: "播放一次", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "重建目标", exact: true }).click();
  await page.getByRole("button", { name: "往返路径", exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByTestId("path-progress").textContent()))
    .toBeGreaterThan(0.1);
  await expect(page.getByTestId("path-error")).toBeHidden();
});

test("host pause, mobile resize and repeated host disposal preserve motion and GPU ownership", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__pathBuffers = new Set();
    const create = Reflect.get(
      WebGL2RenderingContext.prototype,
      "createBuffer",
    ) as typeof WebGL2RenderingContext.prototype.createBuffer;
    const remove = Reflect.get(
      WebGL2RenderingContext.prototype,
      "deleteBuffer",
    ) as typeof WebGL2RenderingContext.prototype.deleteBuffer;
    WebGL2RenderingContext.prototype.createBuffer = function () {
      const value = create.call(this);
      if (value) window.__pathBuffers.add(value);
      return value;
    };
    WebGL2RenderingContext.prototype.deleteBuffer = function (value) {
      if (value) window.__pathBuffers.delete(value);
      remove.call(this, value);
    };
  });
  await page.goto("/?demo=path");
  await expect
    .poll(async () => Number(await page.getByTestId("path-progress").textContent()))
    .toBeGreaterThan(0.05);
  await page.getByRole("button", { name: "暂停场景", exact: true }).click();
  const frozen = await page.getByTestId("path-progress").textContent();
  const peer = await page.getByTestId("path-peer-progress").textContent();
  await page.setViewportSize({ width: 390, height: 844 });
  const resized = await arrow(page);
  expect(resized.count).toBeGreaterThan(10);
  expect(resized.error).toBe(0);
  await expect(page.getByTestId("path-progress")).toHaveText(frozen!);
  await expect(page.getByTestId("path-peer-progress")).toHaveText(peer!);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const buffers = () => page.evaluate(() => window.__pathBuffers.size);
  const baseline = await buffers();
  expect(baseline).toBeGreaterThan(0);
  for (let index = 0; index < 3; index++) {
    await page.getByRole("button", { name: "销毁场景", exact: true }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    expect(await buffers()).toBe(0);
    await expect(page.getByTestId("path-state")).toHaveText("cancelled");
    await page.getByRole("button", { name: "重建场景", exact: true }).click();
    await expect.poll(buffers).toBe(baseline);
    await expect(page.locator("canvas")).toHaveCount(1);
  }
  await expect(page.getByTestId("path-error")).toBeHidden();
});
