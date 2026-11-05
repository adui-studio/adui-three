import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

async function pause(page: Page): Promise<void> {
  for (const id of ["A", "B"])
    await page
      .getByTestId(`scene-${id}`)
      .getByRole("button", { name: "暂停", exact: true })
      .click();
}

async function pixels(panel: Locator, action: string) {
  // Draw and read in one browser task: the default WebGL drawing buffer is not preserved.
  return panel.evaluate((element, action) => {
    element.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
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
    let bright = 0;
    for (let index = 0; index < data.length; index += 4)
      if (data[index]! + data[index + 1]! + data[index + 2]! > 450) bright++;
    return {
      bright,
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      error: gl.getError(),
    };
  }, action);
}

test("real HDR bloom changes canvas pixels while paused and bypass retains the same light source", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await pause(page);
  const panel = page.getByTestId("scene-A");
  const frames = await panel.getByTestId("frames").textContent();
  const enabled = await pixels(panel, "bloom");
  await expect(panel).toHaveAttribute("data-bloom-state", "enabled");
  const disabled = await pixels(panel, "bloom");
  await expect(panel).toHaveAttribute("data-bloom-state", "disabled");
  expect(disabled.bright).toBeGreaterThan(0);
  expect(enabled.bright).toBeGreaterThan(disabled.bright * 1.05);
  const strong = await pixels(panel, "bloom-strength");
  expect(strong.error).toBe(0);
  const enabledStrong = await pixels(panel, "bloom");
  expect(enabledStrong.bright).toBeGreaterThan(enabled.bright);
  expect(enabled.error).toBe(0);
  expect(disabled.error).toBe(0);
  await expect(panel.getByTestId("frames")).toHaveText(frames!);
  await expect(panel).toHaveAttribute("data-state", "stopped");
  await expect(panel.getByTestId("object-label").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/postprocessing-bloom.png",
    fullPage: true,
    scale: "css",
  });
  expect(errors).toEqual([]);
});

test("real render-target textures and framebuffers return to baseline after repeated module disposal", async ({
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
      __bloomGPU: (canvas: HTMLCanvasElement) => {
        const value = stats(canvas.getContext("webgl2")!);
        return { textures: value.textures.size, frames: value.frames.size };
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await pause(page);
  const panel = page.getByTestId("scene-A");
  const counts = () =>
    panel.locator("canvas").evaluate((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Expected the host canvas");
      const probe = window as unknown as {
        __bloomGPU(canvas: HTMLCanvasElement): { textures: number; frames: number };
      };
      return probe.__bloomGPU(canvas);
    });
  const baseline = await counts();
  for (let index = 0; index < 3; index++) {
    await panel.getByRole("button", { name: "泛光", exact: true }).click();
    expect((await counts()).textures).toBeGreaterThan(baseline.textures);
    expect((await counts()).frames).toBeGreaterThan(baseline.frames);
    await panel.getByRole("button", { name: "释放后处理", exact: true }).click();
    await expect(panel).toHaveAttribute("data-bloom-state", "idle");
    expect(await counts()).toEqual(baseline);
  }
  await panel.getByRole("button", { name: "泛光", exact: true }).click();
  await panel.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(panel).toHaveAttribute("data-bloom-state", "disposed");
  await panel.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(panel).toHaveAttribute("data-bloom-state", "idle");
  await expect(panel.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("postprocessing follows paused resize and zero-size recovery independently across hosts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await pixels(a, "bloom");
  await pixels(b, "bloom");
  await a.getByRole("button", { name: "收窄容器", exact: true }).click();
  const width = await a.locator(".viewport").evaluate((element) => element.clientWidth);
  await expect(a.getByTestId("size")).toHaveText(`${width} × 340`);
  const narrow = await pixels(a, "render");
  expect(narrow.width).toBe(width * 2);
  expect(narrow.height).toBe(680);
  expect(narrow.bright).toBeGreaterThan(0);
  expect(narrow.error).toBe(0);
  await a.getByRole("button", { name: "零高度", exact: true }).click();
  await expect(a.getByRole("button", { name: "绘制一帧", exact: true })).toBeDisabled();
  await a.getByRole("button", { name: "零高度", exact: true }).click();
  await expect(a.getByRole("button", { name: "绘制一帧", exact: true })).toBeEnabled();
  expect((await pixels(a, "render")).error).toBe(0);
  await a.getByRole("button", { name: "释放后处理", exact: true }).click();
  await expect(b).toHaveAttribute("data-bloom-state", "enabled");
  expect((await pixels(b, "render")).bright).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
