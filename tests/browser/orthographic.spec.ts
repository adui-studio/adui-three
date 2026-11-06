import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

async function pixels(panel: Locator) {
  return panel.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!,
      gl = canvas.getContext("webgl2")!;
    const width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    const bytes = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    const rect = canvas.getBoundingClientRect();
    const bounds = [0, 1].map((color) => {
      let minX = width,
        maxX = -1,
        minY = height,
        maxY = -1,
        count = 0;
      for (let offset = 0; offset < bytes.length; offset += 4) {
        const r = bytes[offset]!,
          g = bytes[offset + 1]!,
          b = bytes[offset + 2]!;
        if (color === 0 ? r > 180 && g < 130 && b < 130 : b > 180 && r < 130 && g < 180) {
          const x = (offset / 4) % width,
            y = Math.floor(offset / 4 / width);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          count++;
        }
      }
      return {
        count,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
        x: rect.left + ((minX + maxX + 1) / 2 / width) * rect.width,
        y: rect.bottom - ((minY + maxY + 1) / 2 / height) * rect.height,
      };
    });
    return { red: bounds[0]!, blue: bounds[1]!, error: gl.getError(), width, height };
  });
}

test("orthographic GPU pixels retain object size across depth while the perspective peer shrinks", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?demo=orthographic");
  const a = page.getByTestId("orthographic"),
    b = page.getByTestId("perspective");
  const original = await pixels(a),
    perspective = await pixels(b);
  expect(original.red.count).toBeGreaterThan(1000);
  expect(Math.abs(original.red.width - original.blue.width)).toBeLessThanOrEqual(1);
  expect(perspective.blue.width / perspective.red.width).toBeLessThan(0.8);
  await a.getByRole("button", { name: "改变蓝色深度", exact: true }).click();
  await b.getByRole("button", { name: "改变蓝色深度", exact: true }).click();
  const moved = await pixels(a),
    far = await pixels(b);
  expect(moved.blue.width).toBe(original.blue.width);
  expect(moved.blue.count).toBe(original.blue.count);
  expect(far.blue.width).toBeLessThan(perspective.blue.width * 0.8);
  expect([original.error, moved.error, far.error]).toEqual([0, 0, 0]);
  await page.screenshot({
    path: "test-results/orthographic-playground.png",
    fullPage: true,
    scale: "css",
  });
  expect(errors).toEqual([]);
});

test("orthographic native zoom, picking and labels work without a running host", async ({
  page,
}) => {
  await page.goto("/?demo=orthographic");
  const panel = page.getByTestId("orthographic");
  const original = await pixels(panel);
  await panel.getByRole("button", { name: "放大视图", exact: true }).click();
  const zoomed = await pixels(panel);
  expect(zoomed.red.width / original.red.width).toBeCloseTo(1.5, 1);
  await page.mouse.click(zoomed.red.x, zoomed.red.y);
  await expect(panel.getByTestId("projection-picked")).toHaveText("红色方块");
  const label = await panel.getByTestId("projection-red-label").boundingBox();
  expect(Math.abs(label!.x + label!.width / 2 - zoomed.red.x)).toBeLessThan(1);
  expect(label!.y + label!.height).toBeLessThan(zoomed.red.y);
  await panel.locator("canvas").hover();
  await page.mouse.wheel(0, -200);
  await expect(panel.getByTestId("projection-zoom")).not.toHaveText("1.500");
  await expect(panel.getByTestId("projection-state")).toHaveText("ready");
  await expect(page.getByTestId("perspective").getByTestId("projection-zoom")).toHaveText("1.000");
  const wheel = await pixels(panel);
  expect(wheel.red.width).toBeGreaterThan(zoomed.red.width);
  expect(wheel.error).toBe(0);
});

test("orthographic resize and zero recovery preserve zoom and repeated disposal releases GPU buffers", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const buffers = new Set<WebGLBuffer>();
    const proto = WebGL2RenderingContext.prototype;
    const create = Reflect.get(proto, "createBuffer") as typeof proto.createBuffer;
    const remove = Reflect.get(proto, "deleteBuffer") as typeof proto.deleteBuffer;
    proto.createBuffer = function () {
      const buffer = create.call(this);
      if (buffer) buffers.add(buffer);
      return buffer;
    };
    proto.deleteBuffer = function (buffer) {
      if (buffer) buffers.delete(buffer);
      return remove.call(this, buffer);
    };
    Object.assign(window, { __projectionBufferCount: () => buffers.size });
  });
  await page.goto("/?demo=orthographic");
  const a = page.getByTestId("orthographic"),
    b = page.getByTestId("perspective");
  await b.getByRole("button", { name: "销毁", exact: true }).click();
  await a.getByRole("button", { name: "放大视图", exact: true }).click();
  const original = await pixels(a);
  await a.getByRole("button", { name: "收窄容器", exact: true }).click();
  await expect.poll(async () => (await pixels(a)).width).toBeLessThan(original.width);
  const narrow = await pixels(a);
  expect(narrow.red.height).toBe(original.red.height);
  await a.getByRole("button", { name: "零高度", exact: true }).click();
  await expect(a.getByTestId("projection-height")).toHaveText("0");
  await a.getByRole("button", { name: "零高度", exact: true }).click();
  await expect
    .poll(async () => Number(await a.getByTestId("projection-height").textContent()))
    .toBeGreaterThan(0);
  await expect(a.getByTestId("projection-zoom")).toHaveText("1.500");
  for (let cycle = 0; cycle < 3; cycle++) {
    await a.getByRole("button", { name: "销毁", exact: true }).click();
    await expect(a.locator("canvas")).toHaveCount(0);
    await expect(a.getByTestId("projection-red-label")).toHaveCount(0);
    expect(
      await page.evaluate(() => (Reflect.get(window, "__projectionBufferCount") as () => number)()),
    ).toBe(0);
    await a.getByRole("button", { name: "重建", exact: true }).click();
    await expect(a.locator("canvas")).toHaveCount(1);
    expect((await pixels(a)).red.count).toBeGreaterThan(1000);
    await expect(a.getByTestId("projection-error")).toBeEmpty();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});

test("orthographic framing restores a twenty-times larger model and keeps paused picking and labels aligned", async ({
  page,
}) => {
  await page.goto("/?demo=orthographic");
  const a = page.getByTestId("orthographic"),
    b = page.getByTestId("perspective");
  const peer = await pixels(b);
  await a.getByRole("button", { name: "放大模型", exact: true }).click();
  await a.getByRole("button", { name: "适配视角", exact: true }).click();
  await expect(a.getByTestId("projection-error")).toBeEmpty();
  const zoom = Number(await a.getByTestId("projection-zoom").textContent());
  expect(zoom).toBeGreaterThan(0);
  expect(zoom).toBeLessThan(0.1);
  const frame = await pixels(a);
  expect(frame.red.count).toBeGreaterThan(1000);
  expect(frame.blue.count).toBeGreaterThan(1000);
  expect(frame.error).toBe(0);
  await page.mouse.click(frame.blue.x, frame.blue.y);
  await expect(a.getByTestId("projection-picked")).toHaveText("蓝色方块");
  const label = await a.getByTestId("projection-blue-label").boundingBox();
  expect(Math.abs(label!.x + label!.width / 2 - frame.blue.x)).toBeLessThan(1);
  expect((await pixels(b)).blue.count).toBe(peer.blue.count);
  await expect(a.getByTestId("projection-state")).toHaveText("ready");
});

test("orthographic framing reuses the resized frustum and recovers after a zero-size rejection", async ({
  page,
}) => {
  await page.goto("/?demo=orthographic");
  const a = page.getByTestId("orthographic");
  await a.getByRole("button", { name: "适配视角", exact: true }).click();
  const zoom = Number(await a.getByTestId("projection-zoom").textContent());
  const desktopWidth = Number(await a.getByTestId("projection-width").textContent());
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => Number(await a.getByTestId("projection-width").textContent()))
    .toBeLessThan(desktopWidth);
  await a.getByRole("button", { name: "收窄容器", exact: true }).click();
  await a.getByRole("button", { name: "适配视角", exact: true }).click();
  expect(Number(await a.getByTestId("projection-zoom").textContent())).toBeLessThan(zoom);
  await a.getByRole("button", { name: "零高度", exact: true }).click();
  await a.getByRole("button", { name: "适配视角", exact: true }).click();
  await expect(a.getByTestId("projection-error")).toContainText("nonzero");
  await a.getByRole("button", { name: "零高度", exact: true }).click();
  await a.getByRole("button", { name: "适配视角", exact: true }).click();
  const result = await pixels(a);
  expect(result.red.count).toBeGreaterThan(1000);
  expect(result.blue.count).toBeGreaterThan(1000);
  expect(result.error).toBe(0);
});
