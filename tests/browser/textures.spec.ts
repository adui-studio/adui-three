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
    let hash = 2166136261;
    let red = 0;
    let blue = 0;
    for (let index = 0; index < data.length; index += 4) {
      hash = Math.imul(hash ^ data[index]!, 16777619);
      hash = Math.imul(hash ^ data[index + 1]!, 16777619);
      hash = Math.imul(hash ^ data[index + 2]!, 16777619);
      if (
        data[index]! > 100 &&
        data[index]! > data[index + 1]! * 1.4 &&
        data[index]! > data[index + 2]! * 1.4
      )
        red++;
      if (
        data[index + 2]! > 100 &&
        data[index + 2]! > data[index]! * 1.4 &&
        data[index + 2]! > data[index + 1]! * 1.4
      )
        blue++;
    }
    return { hash, red, blue, error: gl.getError() };
  });
}

async function probe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const live = new Set<ImageBitmap>();
    let created = 0;
    let closed = 0;
    const pending: Array<() => void> = [];
    const native = window.createImageBitmap.bind(window);
    const close = Reflect.get(ImageBitmap.prototype, "close") as typeof ImageBitmap.prototype.close;
    let hold = false;
    window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => {
      return Reflect.apply(native, window, args).then((bitmap: ImageBitmap) => {
        live.add(bitmap);
        created++;
        if (!hold) return bitmap;
        return new Promise<ImageBitmap>((resolve) => {
          pending.push(() => resolve(bitmap));
        });
      });
    }) as typeof createImageBitmap;
    ImageBitmap.prototype.close = function () {
      if (live.delete(this)) closed++;
      close.call(this);
    };
    const counts = new WeakMap<WebGL2RenderingContext, Set<WebGLTexture>>();
    function textures(gl: WebGL2RenderingContext) {
      let value = counts.get(gl);
      if (!value) {
        value = new Set();
        counts.set(gl, value);
      }
      return value;
    }
    const proto = WebGL2RenderingContext.prototype;
    const create = Reflect.get(proto, "createTexture") as typeof proto.createTexture;
    const remove = Reflect.get(proto, "deleteTexture") as typeof proto.deleteTexture;
    proto.createTexture = function () {
      const result = create.call(this);
      if (result) textures(this).add(result);
      return result;
    };
    proto.deleteTexture = function (value) {
      if (value) textures(this).delete(value);
      remove.call(this, value);
    };
    Object.assign(window, {
      __textureProbe: {
        hold(value: boolean) {
          hold = value;
        },
        release() {
          hold = false;
          for (const resolve of pending.splice(0)) resolve();
        },
        stats(canvas: HTMLCanvasElement) {
          return {
            created,
            closed,
            live: live.size,
            textures: textures(canvas.getContext("webgl2")!).size,
          };
        },
      },
    });
  });
}

async function stats(panel: Locator) {
  return panel.locator("canvas").evaluate((canvas) => {
    const probe = window as unknown as {
      __textureProbe: {
        stats(canvas: HTMLCanvasElement): {
          created: number;
          closed: number;
          live: number;
          textures: number;
        };
      };
    };
    return probe.__textureProbe.stats(canvas as HTMLCanvasElement);
  });
}

test("real independently loaded PNG changes paused pixels, baked flip changes orientation and release restores the original view", async ({
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
  await a.getByRole("button", { name: "加载纹理", exact: true }).click();
  await expect(a).toHaveAttribute("data-texture-state", "loaded");
  const flipped = await pixels(a);
  expect(flipped.red).toBeGreaterThan(before.red + 20);
  expect(flipped.blue).toBeGreaterThan(before.blue + 20);
  expect(flipped.error).toBe(0);
  await a.getByRole("button", { name: "纹理翻转", exact: true }).click();
  await expect(a).toHaveAttribute("data-texture-state", "loaded");
  const plain = await pixels(a);
  expect(plain.hash).not.toBe(flipped.hash);
  expect(plain.error).toBe(0);
  await page.screenshot({ path: "test-results/texture-png.png", fullPage: true, scale: "css" });
  await a.getByRole("button", { name: "移除纹理", exact: true }).click();
  expect(await pixels(a)).toEqual(before);
  expect(await pixels(b)).toEqual(other);
  await expect(a.getByTestId("frames")).toHaveText(frames!);
  expect(errors).toEqual([]);
});

test("same URL downloads once but decodes separate bitmaps, and cancellation/disposal close late images without reviving hosts", async ({
  page,
}) => {
  await probe(page);
  const body = await readFile("apps/website/public/textures/quadrants.png");
  let requests = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/textures/quadrants.png", async (route) => {
    requests++;
    await gate;
    await route.fulfill({ body, contentType: "image/png" });
  });
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await page.evaluate(() => {
    const value = window as unknown as { __textureProbe: { hold(value: boolean): void } };
    value.__textureProbe.hold(true);
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action="texture"]'))
      button.click();
  });
  await expect.poll(() => requests).toBe(1);
  release();
  await expect.poll(async () => (await stats(b)).created).toBe(2);
  await a.getByRole("button", { name: "取消纹理", exact: true }).click();
  await expect(a).toHaveAttribute("data-texture-state", "cancelled");
  await page.evaluate(() =>
    (window as unknown as { __textureProbe: { release(): void } }).__textureProbe.release(),
  );
  await expect(b).toHaveAttribute("data-texture-state", "loaded");
  await expect.poll(async () => (await stats(b)).live).toBe(1);
  await expect(a).toHaveAttribute("data-texture-state", "cancelled");
  expect(requests).toBe(1);
  await page.evaluate(() =>
    (window as unknown as { __textureProbe: { hold(value: boolean): void } }).__textureProbe.hold(
      true,
    ),
  );
  await a.getByRole("button", { name: "加载纹理", exact: true }).click();
  await expect.poll(async () => (await stats(b)).created).toBe(3);
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  await page.evaluate(() =>
    (window as unknown as { __textureProbe: { release(): void } }).__textureProbe.release(),
  );
  await expect.poll(async () => (await stats(b)).live).toBe(1);
  await expect(a.locator("canvas")).toHaveCount(0);
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(a).toHaveAttribute("data-texture-state", "idle");
  await expect(b).toHaveAttribute("data-texture-state", "loaded");
  await b.getByRole("button", { name: "移除纹理", exact: true }).click();
  await expect.poll(async () => (await stats(b)).live).toBe(0);
});

test("three native texture/bitmap release cycles return to baseline and malformed images can be retried", async ({
  page,
}) => {
  await probe(page);
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const baseline = await stats(a);
  await a.getByRole("button", { name: "纹理失败", exact: true }).click();
  await expect(a).toHaveAttribute("data-texture-state", "error");
  for (let index = 0; index < 3; index++) {
    await a.getByRole("button", { name: "加载纹理", exact: true }).click();
    await expect(a).toHaveAttribute("data-texture-state", "loaded");
    const active = await stats(a);
    expect(active.live).toBe(baseline.live + 1);
    expect(active.textures).toBeGreaterThan(baseline.textures);
    await a.getByRole("button", { name: "移除纹理", exact: true }).click();
    const released = await stats(a);
    expect(released.live).toBe(baseline.live);
    expect(released.textures).toBe(baseline.textures);
    expect(released.created - released.closed).toBe(baseline.live);
  }
});
