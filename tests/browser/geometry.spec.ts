import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __instanceBuffers: Set<WebGLBuffer>;
    __instanceDraws: number[];
  }
}

async function pixels(page: Page, channel: "red" | "green") {
  return page.getByTestId("instances").evaluate((element, channel) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;
    const width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    const bytes = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let count = 0,
      sumX = 0,
      sumY = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const offset = (y * width + x) * 4;
        if (
          bytes[offset + (channel === "red" ? 0 : 1)]! > 150 &&
          bytes[offset + (channel === "red" ? 1 : 0)]! < 60 &&
          bytes[offset + 2]! < 60
        ) {
          count++;
          sumX += x;
          sumY += y;
        }
      }
    const rect = canvas.getBoundingClientRect();
    return {
      count,
      x: rect.left + (sumX / count / width) * rect.width,
      y: rect.top + (1 - sumY / count / height) * rect.height,
      error: gl.getError(),
    };
  }, channel);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__instanceBuffers = new Set();
    window.__instanceDraws = [];
    const create = Reflect.get(
      WebGL2RenderingContext.prototype,
      "createBuffer",
    ) as typeof WebGL2RenderingContext.prototype.createBuffer;
    const remove = Reflect.get(
      WebGL2RenderingContext.prototype,
      "deleteBuffer",
    ) as typeof WebGL2RenderingContext.prototype.deleteBuffer;
    const draw = Reflect.get(
      WebGL2RenderingContext.prototype,
      "drawElementsInstanced",
    ) as typeof WebGL2RenderingContext.prototype.drawElementsInstanced;
    WebGL2RenderingContext.prototype.createBuffer = function () {
      const buffer = create.call(this);
      if (buffer) window.__instanceBuffers.add(buffer);
      return buffer;
    };
    WebGL2RenderingContext.prototype.deleteBuffer = function (buffer) {
      if (buffer) window.__instanceBuffers.delete(buffer);
      remove.call(this, buffer);
    };
    WebGL2RenderingContext.prototype.drawElementsInstanced = function (
      mode,
      count,
      type,
      offset,
      instances,
    ) {
      window.__instanceDraws.push(instances);
      draw.call(this, mode, count, type, offset, instances);
    };
  });
  await page.goto("/?demo=instances");
  await expect(page.getByTestId("instance-count")).toHaveText("25");
});

test("instanced GPU draw, moved bounds, color upload and native instance picking", async ({
  page,
}) => {
  await expect(page.getByTestId("instance-calls")).toHaveText("1");
  expect(await page.evaluate(() => window.__instanceDraws.at(-1))).toBe(25);
  await page.getByRole("button", { name: "仅首个", exact: true }).click();
  const original = await pixels(page, "red");
  expect(original.count).toBeGreaterThan(100);
  expect(original.error).toBe(0);
  await page.mouse.click(original.x, original.y);
  await expect(page.getByTestId("instance-picked")).toHaveText("0");
  await page.getByRole("button", { name: "移动首个", exact: true }).click();
  const moved = await pixels(page, "red");
  expect(moved.count).toBeGreaterThan(100);
  expect(moved.x - original.x).toBeGreaterThan(60);
  await page.mouse.click(original.x, original.y);
  await expect(page.getByTestId("instance-picked")).toHaveText("—");
  await page.mouse.click(moved.x, moved.y);
  await expect(page.getByTestId("instance-picked")).toHaveText("0");
  await page.getByRole("button", { name: "首个变绿", exact: true }).click();
  const green = await pixels(page, "green");
  expect(green.count).toBe(moved.count);
  expect(green.error).toBe(0);
  expect((await pixels(page, "red")).count).toBe(0);
  await page.getByRole("button", { name: "隐藏全部", exact: true }).click();
  await expect(page.getByTestId("instance-calls")).toHaveText("0");
  expect((await pixels(page, "green")).count).toBe(0);
  await page.getByRole("button", { name: "显示全部", exact: true }).click();
  await page.screenshot({ path: "test-results/instances.png", fullPage: true });
  await expect(page.getByTestId("instance-error")).toBeHidden();
});

test("hover moves between native instances of one GPU mesh and clears on exit", async ({
  page,
}) => {
  const center = await pixels(page, "red");
  const sibling = await page.getByTestId("instances").evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;
    const width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    const bytes = new Uint8Array(width * 4);
    gl.readPixels(0, Math.floor(height / 2), width, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let start = -1,
      end = -1;
    for (let x = Math.floor(width / 2); x < width; x++) {
      const blue = bytes[x * 4 + 2]! > 150 && bytes[x * 4]! < 60;
      if (blue && start === -1) start = x;
      if (!blue && start !== -1) {
        end = x;
        break;
      }
    }
    const rect = canvas.getBoundingClientRect();
    return {
      found: start !== -1 && end > start,
      x: rect.left + ((start + end) / 2 / width) * rect.width,
      y: rect.top + rect.height / 2,
    };
  });
  expect(sibling.found).toBe(true);
  await page.mouse.move(center.x, center.y);
  await expect(page.getByTestId("instance-hovered")).toHaveText("0");
  await page.mouse.move(sibling.x, sibling.y);
  await expect(page.getByTestId("instance-hovered")).toHaveText("13");
  await page.mouse.move(center.x, center.y);
  await expect(page.getByTestId("instance-hovered")).toHaveText("0");
  await page.mouse.move(0, 0);
  await expect(page.getByTestId("instance-hovered")).toHaveText("—");
});

test("instance buffers return to the warm borrowed-asset baseline across repeated rebuilds", async ({
  page,
}) => {
  const buffers = () => page.evaluate(() => window.__instanceBuffers.size);
  const initial = await buffers();
  await page.getByRole("button", { name: "释放网格", exact: true }).click();
  const baseline = await buffers();
  expect(initial - baseline).toBe(2);
  await expect(page.getByTestId("instance-calls")).toHaveText("0");
  for (let iteration = 0; iteration < 3; iteration++) {
    await page.getByRole("button", { name: "重建网格", exact: true }).click();
    expect(await buffers()).toBe(initial);
    await expect(page.getByTestId("instance-calls")).toHaveText("1");
    expect((await pixels(page, "red")).count).toBeGreaterThan(100);
    await page.getByRole("button", { name: "释放网格", exact: true }).click();
    expect(await buffers()).toBe(baseline);
  }
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.getByTestId("instance-error")).toBeHidden();
});
