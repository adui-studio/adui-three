import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

declare global {
  interface Window {
    __captures: { pending: Array<() => void>; live: Set<string>; created: number; revoked: number };
  }
}

async function probe(page: Page, hold = false): Promise<void> {
  await page.addInitScript(
    ({ hold }) => {
      window.__captures = { pending: [], live: new Set(), created: 0, revoked: 0 };
      const encode = Reflect.get(
        HTMLCanvasElement.prototype,
        "toBlob",
      ) as typeof HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality): void {
        encode.call(
          this,
          (blob) => {
            if (hold) window.__captures.pending.push(() => callback(blob));
            else callback(blob);
          },
          type,
          quality,
        );
      };
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob): string => {
        const url = create(blob);
        window.__captures.live.add(url);
        window.__captures.created++;
        return url;
      };
      URL.revokeObjectURL = (url): void => {
        if (window.__captures.live.delete(url)) window.__captures.revoked++;
        revoke(url);
      };
    },
    { hold },
  );
}

async function pause(page: Page): Promise<void> {
  for (const id of ["A", "B"])
    await page
      .getByTestId(`scene-${id}`)
      .getByRole("button", { name: "暂停", exact: true })
      .click();
}

async function canvasPixels(panel: Locator, center = false) {
  return panel.evaluate((element, center) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const gl = element.querySelector("canvas")!.getContext("webgl2")!;
    const width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    const bytes = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    const outputWidth = center ? Math.max(1, Math.floor(width / 2)) : width;
    const outputHeight = center ? Math.max(1, Math.floor(height / 2)) : height;
    const left = center ? Math.floor((width - outputWidth) / 2) : 0;
    const top = center ? Math.floor((height - outputHeight) / 2) : 0;
    let hash = 2166136261;
    for (let y = 0; y < outputHeight; y++)
      for (let x = 0; x < outputWidth; x++) {
        const offset = ((height - 1 - top - y) * width + left + x) * 4;
        for (let channel = 0; channel < 3; channel++)
          hash = Math.imul(hash ^ bytes[offset + channel]!, 16777619);
      }
    return { hash, width: outputWidth, height: outputHeight, error: gl.getError() };
  }, center);
}

async function encodedPixels(panel: Locator) {
  await expect
    .poll(() =>
      panel
        .getByTestId("capture-preview")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  return panel.getByTestId("capture-preview").evaluate(async (element) => {
    const image = element as HTMLImageElement;
    const blob = await (await fetch(image.src)).blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (let offset = 0; offset < data.length; offset += 4)
        for (let channel = 0; channel < 3; channel++)
          hash = Math.imul(hash ^ data[offset + channel]!, 16777619);
      return { hash, width: bitmap.width, height: bitmap.height, type: blob.type };
    } finally {
      bitmap.close();
    }
  });
}

test("PNG capture matches the real paused postprocessing output without advancing animation or the host", async ({
  page,
}) => {
  await probe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await pause(page);
  const panel = page.getByTestId("scene-A");
  await panel.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await panel.getByRole("button", { name: "播放动画", exact: true }).click();
  await panel.getByRole("slider", { name: "动画定位" }).fill("50");
  await panel.getByRole("button", { name: "泛光", exact: true }).click();
  const expected = await canvasPixels(panel);
  const frames = await panel.getByTestId("frames").textContent();
  const time = await panel.getByTestId("animation-time").textContent();
  await panel.getByRole("button", { name: "截图", exact: true }).click();
  await expect(panel).toHaveAttribute("data-capture-state", "ready");
  const actual = await encodedPixels(panel);
  expect(actual).toEqual({
    hash: expected.hash,
    width: expected.width,
    height: expected.height,
    type: "image/png",
  });
  expect(expected.error).toBe(0);
  await expect(panel.getByTestId("frames")).toHaveText(frames!);
  await expect(panel.getByTestId("animation-time")).toHaveText(time!);
  await expect(panel).toHaveAttribute("data-state", "stopped");
  const downloadPromise = page.waitForEvent("download");
  await panel.getByTestId("capture-download").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("scene-A.png");
  await download.saveAs("test-results/captured-frame.png");
  expect(errors).toEqual([]);
});

test("in-flight encoding keeps the copied pixels and dimensions while the source canvas resizes", async ({
  page,
}) => {
  await probe(page, true);
  await page.goto("/");
  await pause(page);
  const panel = page.getByTestId("scene-A");
  const expected = await canvasPixels(panel);
  await panel.getByRole("button", { name: "截图", exact: true }).click();
  await expect(panel).toHaveAttribute("data-capture-state", "encoding");
  await expect.poll(() => page.evaluate(() => window.__captures.pending.length)).toBe(1);
  const frames = Number(await panel.getByTestId("frames").textContent());
  await panel.getByRole("button", { name: "运行", exact: true }).click();
  await expect
    .poll(async () => Number(await panel.getByTestId("frames").textContent()))
    .toBeGreaterThan(frames + 3);
  await panel.getByRole("button", { name: "暂停", exact: true }).click();
  await panel.getByRole("button", { name: "收窄容器", exact: true }).click();
  await expect.poll(async () => (await canvasPixels(panel)).width).toBeLessThan(expected.width);
  await page.evaluate(() => window.__captures.pending.shift()!());
  await expect(panel).toHaveAttribute("data-capture-state", "ready");
  const actual = await encodedPixels(panel);
  expect(actual.width).toBe(expected.width);
  expect(actual.height).toBe(expected.height);
  expect(actual.hash).toBe(expected.hash);
});

test("cancelled or disposed encodes discard late results and leave the other host independent", async ({
  page,
}) => {
  await probe(page, true);
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A"),
    b = page.getByTestId("scene-B");
  await a.getByRole("button", { name: "截图", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__captures.pending.length)).toBe(1);
  await a.getByRole("button", { name: "取消截图", exact: true }).click();
  await expect(a).toHaveAttribute("data-capture-state", "cancelled");
  await page.evaluate(() => window.__captures.pending.shift()!());
  await expect(a.getByTestId("capture-preview")).toBeHidden();
  expect(await page.evaluate(() => window.__captures.created)).toBe(0);
  await a.getByRole("button", { name: "截图", exact: true }).click();
  await b.getByRole("button", { name: "截图", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__captures.pending.length)).toBe(2);
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  await page.evaluate(() => {
    for (const release of window.__captures.pending.splice(0)) release();
  });
  await expect(a.getByTestId("capture-preview")).toBeHidden();
  await expect(b).toHaveAttribute("data-capture-state", "ready");
  expect(await page.evaluate(() => window.__captures.created)).toBe(1);
  await expect(a.locator("canvas")).toHaveCount(0);
});

test("preview URLs release on replacement, explicit clearing and owner teardown", async ({
  page,
}) => {
  await probe(page);
  await page.goto("/");
  await pause(page);
  const panel = page.getByTestId("scene-A");
  for (let cycle = 0; cycle < 3; cycle++) {
    await panel.getByRole("button", { name: "截图", exact: true }).click();
    await expect(panel).toHaveAttribute("data-capture-state", "ready");
    expect(await page.evaluate(() => window.__captures.live.size)).toBe(1);
    expect(await page.evaluate(() => window.__captures.created)).toBe(cycle + 1);
  }
  expect(await page.evaluate(() => window.__captures.revoked)).toBe(2);
  await panel.getByRole("button", { name: "清除截图", exact: true }).click();
  expect(await page.evaluate(() => window.__captures.live.size)).toBe(0);
  await panel.getByRole("button", { name: "截图", exact: true }).click();
  await expect(panel).toHaveAttribute("data-capture-state", "ready");
  await panel.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(panel.getByTestId("capture-preview")).toBeHidden();
  expect(await page.evaluate(() => window.__captures.live.size)).toBe(0);
  expect(await page.evaluate(() => window.__captures.created === window.__captures.revoked)).toBe(
    true,
  );
});

test("JPEG and WebP use native encoding and expose the actual image type and download extension", async ({
  page,
}) => {
  await probe(page);
  await page.goto("/");
  await pause(page);
  const panel = page.getByTestId("scene-A");
  const expected = await canvasPixels(panel);
  for (const [type, extension] of [
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
  ] as const) {
    await panel.getByRole("combobox", { name: "截图格式" }).selectOption(type);
    await panel.getByRole("button", { name: "截图", exact: true }).click();
    await expect(panel).toHaveAttribute("data-capture-state", "ready");
    const image = await encodedPixels(panel);
    expect(image.type).toBe(type);
    expect(image.width).toBe(expected.width);
    expect(image.height).toBe(expected.height);
    await expect(panel.getByTestId("capture-download")).toHaveAttribute(
      "download",
      `scene-A.${extension}`,
    );
  }
});

test("a cropped PNG matches the real postprocessing pixel region and preserves paused animation", async ({
  page,
}) => {
  await probe(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await pause(page);
  const panel = page.getByTestId("scene-A");
  const other = page.getByTestId("scene-B");
  await panel.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await panel.getByRole("button", { name: "播放动画", exact: true }).click();
  await panel.getByRole("slider", { name: "动画定位" }).fill("50");
  await panel.getByRole("button", { name: "泛光", exact: true }).click();
  const peer = await canvasPixels(other);
  const expected = await canvasPixels(panel, true);
  const frames = await panel.getByTestId("frames").textContent();
  const time = await panel.getByTestId("animation-time").textContent();
  await panel.getByRole("combobox", { name: "截图范围" }).selectOption("center");
  await panel.getByRole("button", { name: "截图", exact: true }).click();
  await expect(panel).toHaveAttribute("data-capture-state", "ready");
  expect(await encodedPixels(panel)).toEqual({
    hash: expected.hash,
    width: expected.width,
    height: expected.height,
    type: "image/png",
  });
  await expect(panel.getByTestId("frames")).toHaveText(frames!);
  await expect(panel.getByTestId("animation-time")).toHaveText(time!);
  expect(await canvasPixels(other)).toEqual(peer);
  expect(expected.error).toBe(0);
  expect(errors).toEqual([]);
  const download = page.waitForEvent("download");
  await panel.getByTestId("capture-download").click();
  await (await download).saveAs("test-results/captured-region.png");
});

test("an in-flight cropped image retains its pixels after canvas resize and capture selection changes", async ({
  page,
}) => {
  await probe(page, true);
  await page.goto("/");
  await pause(page);
  const panel = page.getByTestId("scene-A");
  const expected = await canvasPixels(panel, true);
  await panel.getByRole("combobox", { name: "截图范围" }).selectOption("center");
  await panel.getByRole("button", { name: "截图", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__captures.pending.length)).toBe(1);
  await panel.getByRole("combobox", { name: "截图范围" }).selectOption("full");
  await panel.getByRole("button", { name: "收窄容器", exact: true }).click();
  await expect.poll(async () => (await canvasPixels(panel)).width).toBeLessThan(expected.width * 2);
  await page.evaluate(() => window.__captures.pending.shift()!());
  await expect(panel).toHaveAttribute("data-capture-state", "ready");
  expect(await encodedPixels(panel)).toEqual({
    hash: expected.hash,
    width: expected.width,
    height: expected.height,
    type: "image/png",
  });
  expect(expected.error).toBe(0);
});
