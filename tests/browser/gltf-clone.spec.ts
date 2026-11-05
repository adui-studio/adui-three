import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

declare global {
  interface Window {
    __clones: {
      closed: number;
      buffers(canvas: HTMLCanvasElement): number;
      textures(canvas: HTMLCanvasElement): number;
    };
  }
}

async function probe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buffers = new WeakMap<WebGL2RenderingContext, Set<WebGLBuffer>>();
    const textures = new WeakMap<WebGL2RenderingContext, Set<WebGLTexture>>();
    const proto = WebGL2RenderingContext.prototype;
    const createBuffer = Reflect.get(proto, "createBuffer") as typeof proto.createBuffer;
    const deleteBuffer = Reflect.get(proto, "deleteBuffer") as typeof proto.deleteBuffer;
    const createTexture = Reflect.get(proto, "createTexture") as typeof proto.createTexture;
    const deleteTexture = Reflect.get(proto, "deleteTexture") as typeof proto.deleteTexture;
    proto.createBuffer = function () {
      const result = createBuffer.call(this);
      let live = buffers.get(this);
      if (!live) {
        live = new Set();
        buffers.set(this, live);
      }
      if (result) live.add(result);
      return result;
    };
    proto.deleteBuffer = function (buffer) {
      if (buffer) buffers.get(this)?.delete(buffer);
      deleteBuffer.call(this, buffer);
    };
    proto.createTexture = function () {
      const result = createTexture.call(this);
      let live = textures.get(this);
      if (!live) {
        live = new Set();
        textures.set(this, live);
      }
      if (result) live.add(result);
      return result;
    };
    proto.deleteTexture = function (texture) {
      if (texture) textures.get(this)?.delete(texture);
      deleteTexture.call(this, texture);
    };
    window.__clones = {
      closed: 0,
      buffers: (canvas) => buffers.get(canvas.getContext("webgl2")!)?.size ?? 0,
      textures: (canvas) => textures.get(canvas.getContext("webgl2")!)?.size ?? 0,
    };
    const close = Reflect.get(ImageBitmap.prototype, "close") as typeof ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function () {
      window.__clones.closed++;
      close.call(this);
    };
  });
}

async function pause(page: Page): Promise<void> {
  for (const id of ["A", "B"])
    await page
      .getByTestId(`scene-${id}`)
      .getByRole("button", { name: "暂停", exact: true })
      .click();
}

async function pixels(panel: Locator) {
  return panel.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;
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
    let yellow = 0;
    for (let i = 0; i < bytes.length; i += 4)
      if (bytes[i]! > 150 && bytes[i + 1]! > 120 && bytes[i]! > bytes[i + 2]! * 1.25) yellow++;
    return {
      yellow,
      error: gl.getError(),
      buffers: window.__clones.buffers(canvas),
      textures: window.__clones.textures(canvas),
    };
  });
}

test("same-host clone retains real GPU assets and image data after source removal", async ({
  page,
}) => {
  await probe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/models/sample.glb")) requests++;
  });
  await page.goto("/");
  await pause(page);
  const panel = page.getByTestId("scene-A");
  await panel.getByRole("button", { name: "加载 GLB", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  const original = await pixels(panel);
  await panel.getByRole("button", { name: "创建实例", exact: true }).click();
  await expect(panel).toHaveAttribute("data-clone-state", "ready");
  const both = await pixels(panel);
  expect(both.buffers).toBe(original.buffers);
  expect(both.textures).toBe(original.textures);
  await panel.getByRole("button", { name: "移除模型", exact: true }).click();
  const copy = await pixels(panel);
  expect(copy.yellow).toBeGreaterThan(500);
  expect(copy.buffers).toBe(both.buffers);
  expect(copy.textures).toBe(both.textures);
  expect(copy.error).toBe(0);
  expect(await page.evaluate(() => window.__clones.closed)).toBe(0);
  expect(requests).toBe(1);
  await page.screenshot({ path: "test-results/gltf-clone.png", fullPage: true, scale: "css" });
  await panel.getByRole("button", { name: "移除实例", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__clones.closed)).toBe(1);
  expect(errors).toEqual([]);
});

test("cross-host clone keeps independent animation and textures after the source renderer is destroyed", async ({
  page,
}) => {
  await probe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await a.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "播放动画", exact: true }).click();
  await a.getByRole("slider", { name: "动画定位" }).fill("50");
  await a.getByRole("button", { name: "复制到另一场景", exact: true }).click();
  await expect(b).toHaveAttribute("data-clone-state", "ready");
  const label = a.getByTestId("object-label").last();
  const sourcePose = await label.boundingBox();
  await b.getByRole("button", { name: "播放实例", exact: true }).click();
  await b.getByRole("button", { name: "运行", exact: true }).click();
  await expect(b.getByTestId("clone-time")).not.toHaveText("0.000");
  expect(Math.abs((await label.boundingBox())!.y - sourcePose!.y)).toBeLessThan(0.5);
  await expect(a.getByTestId("animation-time")).toHaveText("1.000");
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(a.locator("canvas")).toHaveCount(0);
  expect(await page.evaluate(() => window.__clones.closed)).toBe(0);
  await b.getByRole("button", { name: "暂停", exact: true }).click();
  const visible = await pixels(b);
  expect(visible.yellow).toBeGreaterThan(500);
  expect(visible.error).toBe(0);
  await b.getByRole("button", { name: "移除实例", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__clones.closed)).toBe(1);
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(a.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("repeated clone/source disposal returns native buffers and textures to the warmed baseline", async ({
  page,
}) => {
  await probe(page);
  await page.goto("/");
  await pause(page);
  const panel = page.getByTestId("scene-A");
  const baseline = await pixels(panel);
  for (let cycle = 0; cycle < 3; cycle++) {
    await panel.getByRole("button", { name: "加载 GLB", exact: true }).click();
    await expect(panel).toHaveAttribute("data-model-state", "loaded");
    await panel.getByRole("button", { name: "创建实例", exact: true }).click();
    expect((await pixels(panel)).buffers).toBeGreaterThan(baseline.buffers);
    await panel.getByRole("button", { name: "移除模型", exact: true }).click();
    expect(await page.evaluate(() => window.__clones.closed)).toBe(cycle);
    await panel.getByRole("button", { name: "移除实例", exact: true }).click();
    const after = await pixels(panel);
    expect(after.buffers).toBe(baseline.buffers);
    expect(after.textures).toBe(baseline.textures);
    expect(after.error).toBe(0);
    expect(await page.evaluate(() => window.__clones.closed)).toBe(cycle + 1);
  }
});
