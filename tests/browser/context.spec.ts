import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

declare global {
  interface Window {
    __lostGPU: Map<string, { extension: WEBGL_lose_context; canvas: HTMLCanvasElement }>;
    __contextImagesClosed: number;
  }
}

async function probe(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/INVALID_OPERATION|INVALID_VALUE|INVALID_ENUM/.test(message.text()))
      errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__contextImagesClosed = 0;
    const close = Reflect.get(ImageBitmap.prototype, "close") as typeof ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function () {
      window.__contextImagesClosed++;
      close.call(this);
    };
  });
  return errors;
}

async function lose(panel: Locator): Promise<void> {
  await panel.evaluate((element) => {
    const canvas = element.querySelector("canvas")!;
    const extension = canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("WEBGL_lose_context is required for the real GPU regression");
    window.__lostGPU ??= new Map();
    window.__lostGPU.set(element.getAttribute("data-testid")!, { extension, canvas });
    extension.loseContext();
  });
  await expect(panel).toHaveAttribute("data-context-lost", "true");
  await expect(panel).toHaveAttribute("data-state", "disposed");
  await expect(panel.locator("canvas")).toHaveCount(0);
}

async function restoreOld(panel: Locator): Promise<void> {
  await panel.evaluate(async (element) => {
    const { extension, canvas } = window.__lostGPU.get(element.getAttribute("data-testid")!)!;
    await new Promise<void>((resolve) => {
      canvas.addEventListener("webglcontextrestored", () => resolve(), { once: true });
      extension.restoreContext();
    });
  });
}

async function pixels(panel: Locator) {
  return panel.evaluate((element) => {
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
    let bright = 0;
    for (let i = 0; i < bytes.length; i += 4)
      if (bytes[i]! + bytes[i + 1]! + bytes[i + 2]! > 450) bright++;
    return { bright, error: gl.getError() };
  });
}

test("real loss disposes one host while its cross-host model clone and animation remain usable", async ({
  page,
}) => {
  const errors = await probe(page);
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await a.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "复制到另一场景", exact: true }).click();
  await b.getByRole("button", { name: "播放实例", exact: true }).click();
  await expect(b.getByTestId("clone-time")).not.toHaveText("0.000");
  await lose(a);
  const frames = await a.getByTestId("frames").textContent();
  await expect(a).toHaveAttribute("data-model-state", "idle");
  expect(await page.evaluate(() => window.__contextImagesClosed)).toBe(0);
  const time = await b.getByTestId("clone-time").textContent();
  await expect(b.getByTestId("clone-time")).not.toHaveText(time!);
  const image = await pixels(b);
  expect(image.bright).toBeGreaterThan(500);
  expect(image.error).toBe(0);
  await restoreOld(a);
  await expect(a.getByTestId("frames")).toHaveText(frames!);
  await expect(a.locator("canvas")).toHaveCount(0);
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(a).toHaveAttribute("data-context-lost", "false");
  await expect(a.locator("canvas")).toHaveCount(1);
  await b.getByRole("button", { name: "移除实例", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__contextImagesClosed)).toBe(1);
  await page.screenshot({ path: "test-results/context-rebuilt.png", fullPage: true, scale: "css" });
  expect(errors).toEqual([]);
});

test("image, HDR and bloom clean while lost and can be recreated without old-generation GPU errors", async ({
  page,
}) => {
  const errors = await probe(page);
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  for (let cycle = 0; cycle < 2; cycle++) {
    await panel.getByRole("button", { name: "暂停", exact: true }).click();
    await panel.getByRole("button", { name: "加载纹理", exact: true }).click();
    await expect(panel).toHaveAttribute("data-texture-state", "loaded");
    await panel.getByRole("button", { name: "加载 HDR", exact: true }).click();
    await expect(panel).toHaveAttribute("data-environment-state", "loaded");
    await panel.getByRole("button", { name: "泛光", exact: true }).click();
    const image = await pixels(panel);
    expect(image.bright).toBeGreaterThan(50);
    expect(image.error).toBe(0);
    await lose(panel);
    await expect.poll(() => page.evaluate(() => window.__contextImagesClosed)).toBe(cycle + 1);
    await restoreOld(panel);
    await expect(panel.locator("canvas")).toHaveCount(0);
    await panel.getByRole("button", { name: "重建 ↻", exact: true }).click();
    await expect(panel).toHaveAttribute("data-context-lost", "false");
    await expect(panel.locator("canvas")).toHaveCount(1);
  }
  expect(errors).toEqual([]);
});

test("loss aborts a pending model, consumes its late bitmap and never revives the old canvas", async ({
  page,
}) => {
  const errors = await probe(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/models/sample.glb", async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/");
    const panel = page.getByTestId("scene-A");
    await panel.getByRole("button", { name: "加载 GLB", exact: true }).click();
    await expect(panel).toHaveAttribute("data-model-state", "loading");
    await lose(panel);
    release();
    await expect.poll(() => page.evaluate(() => window.__contextImagesClosed)).toBe(1);
    await restoreOld(panel);
    await expect(panel).toHaveAttribute("data-state", "disposed");
    await expect(panel.locator("canvas")).toHaveCount(0);
    await panel.getByRole("button", { name: "重建 ↻", exact: true }).click();
    await expect(panel).toHaveAttribute("data-context-lost", "false");
    const image = await pixels(panel);
    expect(image.bright).toBeGreaterThan(50);
    expect(image.error).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
