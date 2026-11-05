import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

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
    const gl = element.querySelector("canvas")!.getContext("webgl2")!;
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
    let brightness = 0;
    for (let index = 0; index < data.length; index += 4)
      brightness += data[index]! + data[index + 1]! + data[index + 2]!;
    return { corner: Array.from(data.subarray(0, 3)), brightness, error: gl.getError() };
  });
}

test("real HDR lighting and background change paused pixels, detach restores the view and bloom can coexist", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  const before = await pixels(a);
  const other = await pixels(b);
  const frames = await a.getByTestId("frames").textContent();
  await a.getByRole("button", { name: "加载 HDR", exact: true }).click();
  await expect(a).toHaveAttribute("data-environment-state", "loaded");
  const sky = await pixels(a);
  expect(sky.brightness).toBeGreaterThan(before.brightness * 1.2);
  expect(sky.corner).not.toEqual(before.corner);
  await a.getByRole("button", { name: "环境背景", exact: true }).click();
  const lighting = await pixels(a);
  expect(lighting.corner).toEqual(before.corner);
  expect(lighting.brightness).toBeGreaterThan(before.brightness);
  await a.getByRole("button", { name: "泛光", exact: true }).click();
  const combined = await pixels(a);
  expect(combined.error).toBe(0);
  await a.getByRole("button", { name: "释放后处理", exact: true }).click();
  await a.getByRole("button", { name: "移除环境", exact: true }).click();
  expect(await pixels(a)).toEqual(before);
  expect(await pixels(b)).toEqual(other);
  await expect(a.getByTestId("frames")).toHaveText(frames!);
  await expect(a).toHaveAttribute("data-state", "stopped");
  expect(errors).toEqual([]);
  await a.getByRole("button", { name: "加载 HDR", exact: true }).click();
  await expect(a).toHaveAttribute("data-environment-state", "loaded");
  await a.getByRole("button", { name: "环境背景", exact: true }).click();
  await page.screenshot({ path: "test-results/environment-hdr.png", fullPage: true, scale: "css" });
});

test("same-URL HDR transport is shared while cancellation, host teardown, malformed input and retries stay independent", async ({
  page,
}) => {
  const body = await readFile("apps/website/public/environments/studio.hdr");
  let release: () => void = () => {};
  let requests = 0;
  let gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/environments/studio.hdr", async (route) => {
    requests++;
    await gate;
    await route.fulfill({ body, contentType: "application/octet-stream" });
  });
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await page.evaluate(() => {
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-action="environment"]',
    ))
      button.click();
  });
  await expect.poll(() => requests).toBe(1);
  await expect(a).toHaveAttribute("data-environment-state", "loading");
  await expect(b).toHaveAttribute("data-environment-state", "loading");
  await a.getByRole("button", { name: "取消环境", exact: true }).click();
  await expect(a).toHaveAttribute("data-environment-state", "cancelled");
  release();
  await expect(b).toHaveAttribute("data-environment-state", "loaded");
  await expect(a).toHaveAttribute("data-environment-state", "cancelled");
  expect(requests).toBe(1);
  const before = await pixels(b);
  gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await a.getByRole("button", { name: "加载 HDR", exact: true }).click();
  await expect.poll(() => requests).toBe(2);
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  release();
  await expect(a).toHaveAttribute("data-state", "disposed");
  await expect(a.locator("canvas")).toHaveCount(0);
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await a.getByRole("button", { name: "环境失败", exact: true }).click();
  await expect(a).toHaveAttribute("data-environment-state", "error");
  await a.getByRole("button", { name: "加载 HDR", exact: true }).click();
  await expect(a).toHaveAttribute("data-environment-state", "loaded");
  expect(await pixels(b)).toEqual(before);
});

test("HDR source, cubemap and PMREM targets return to the warmed renderer baseline after repeated release", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const counts = new WeakMap<
      WebGL2RenderingContext,
      { textures: Set<WebGLTexture>; frames: Set<WebGLFramebuffer> }
    >();
    function stats(gl: WebGL2RenderingContext) {
      let value = counts.get(gl);
      if (!value) {
        value = { textures: new Set(), frames: new Set() };
        counts.set(gl, value);
      }
      return value;
    }
    const proto = WebGL2RenderingContext.prototype;
    const createTexture = Reflect.get(proto, "createTexture") as typeof proto.createTexture;
    const deleteTexture = Reflect.get(proto, "deleteTexture") as typeof proto.deleteTexture;
    const createFramebuffer = Reflect.get(
      proto,
      "createFramebuffer",
    ) as typeof proto.createFramebuffer;
    const deleteFramebuffer = Reflect.get(
      proto,
      "deleteFramebuffer",
    ) as typeof proto.deleteFramebuffer;
    proto.createTexture = function () {
      const value = createTexture.call(this);
      if (value) stats(this).textures.add(value);
      return value;
    };
    proto.deleteTexture = function (value) {
      if (value) stats(this).textures.delete(value);
      deleteTexture.call(this, value);
    };
    proto.createFramebuffer = function () {
      const value = createFramebuffer.call(this);
      if (value) stats(this).frames.add(value);
      return value;
    };
    proto.deleteFramebuffer = function (value) {
      if (value) stats(this).frames.delete(value);
      deleteFramebuffer.call(this, value);
    };
    Object.assign(window, {
      __environmentGPU: (canvas: HTMLCanvasElement) => {
        const value = stats(canvas.getContext("webgl2")!);
        return { textures: value.textures.size, frames: value.frames.size };
      },
    });
  });
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const counts = () =>
    a.locator("canvas").evaluate((canvas) => {
      const probe = window as unknown as {
        __environmentGPU(canvas: HTMLCanvasElement): { textures: number; frames: number };
      };
      return probe.__environmentGPU(canvas as HTMLCanvasElement);
    });
  // Native PMREM keeps generator scratch resources until renderer disposal; warm once before the baseline.
  await a.getByRole("button", { name: "加载 HDR", exact: true }).click();
  await expect(a).toHaveAttribute("data-environment-state", "loaded");
  await a.getByRole("button", { name: "移除环境", exact: true }).click();
  const baseline = await counts();
  for (let index = 0; index < 3; index++) {
    await a.getByRole("button", { name: "加载 HDR", exact: true }).click();
    await expect(a).toHaveAttribute("data-environment-state", "loaded");
    const active = await counts();
    expect(active.textures).toBeGreaterThan(baseline.textures);
    expect(active.frames).toBeGreaterThan(baseline.frames);
    await a.getByRole("button", { name: "移除环境", exact: true }).click();
    expect(await counts()).toEqual(baseline);
  }
});
