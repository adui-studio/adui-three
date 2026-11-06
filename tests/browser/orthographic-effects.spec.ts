import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

async function effectPixels(panel: Locator) {
  return panel.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!,
      gl = canvas.getContext("webgl2")!;
    const width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    const bytes = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let sum = 0,
      yellow = 0,
      red = 0,
      x = 0,
      y = 0;
    for (let offset = 0; offset < bytes.length; offset += 4) {
      const r = bytes[offset]!,
        g = bytes[offset + 1]!,
        b = bytes[offset + 2]!;
      sum += r + g + b;
      if (r > 180 && g > 150 && b < 140) yellow++;
      if (r > 180 && g < 130 && b < 130) {
        red++;
        x += (offset / 4) % width;
        y += Math.floor(offset / 4 / width);
      }
    }
    const rect = canvas.getBoundingClientRect();
    return {
      sum,
      yellow,
      red,
      width,
      height,
      error: gl.getError(),
      x: rect.left + (x / red / width) * rect.width,
      y: rect.bottom - (y / red / height) * rect.height,
    };
  });
}

test("orthographic outline follows real picking and bloom combines while paused without changing its perspective peer", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?demo=orthographic");
  const a = page.getByTestId("orthographic"),
    b = page.getByTestId("perspective");
  const native = await effectPixels(a),
    peer = await effectPixels(b);
  await page.mouse.click(native.x, native.y);
  await expect(a.getByTestId("projection-picked")).toHaveText("红色方块");
  await a.getByRole("button", { name: "组合效果", exact: true }).click();
  await expect(a.getByTestId("projection-effects")).toHaveText("active");
  await a.getByRole("button", { name: "泛光开关", exact: true }).click();
  const outlined = await effectPixels(a);
  expect(outlined.yellow).toBeGreaterThan(40);
  await a.getByRole("button", { name: "描边开关", exact: true }).click();
  const plain = await effectPixels(a);
  expect(plain.yellow).toBe(0);
  await a.getByRole("button", { name: "泛光开关", exact: true }).click();
  const bloom = await effectPixels(a);
  expect(bloom.sum).toBeGreaterThan(plain.sum + 10000);
  await a.getByRole("button", { name: "描边开关", exact: true }).click();
  const combined = await effectPixels(a);
  expect(combined.yellow).toBeGreaterThan(40);
  expect(combined.error).toBe(0);
  expect((await effectPixels(b)).sum).toBe(peer.sum);
  await expect(a.getByTestId("projection-state")).toHaveText("ready");
  await page.screenshot({
    path: "test-results/orthographic-effects.png",
    fullPage: true,
    scale: "css",
  });
  await a.getByRole("button", { name: "组合效果", exact: true }).click();
  expect((await effectPixels(a)).sum).toBe(native.sum);
  await expect(a.getByTestId("projection-error")).toBeEmpty();
  expect(errors).toEqual([]);
});

test("orthographic combined effects survive paused resize and zero recovery and release owned GPU targets repeatedly", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const textures = new Set<WebGLTexture>(),
      framebuffers = new Set<WebGLFramebuffer>();
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
      if (value) textures.add(value);
      return value;
    };
    proto.deleteTexture = function (value) {
      if (value) textures.delete(value);
      return deleteTexture.call(this, value);
    };
    proto.createFramebuffer = function () {
      const value = createFramebuffer.call(this);
      if (value) framebuffers.add(value);
      return value;
    };
    proto.deleteFramebuffer = function (value) {
      if (value) framebuffers.delete(value);
      return deleteFramebuffer.call(this, value);
    };
    Object.assign(window, {
      __orthoEffectsGPU: () => ({ textures: textures.size, framebuffers: framebuffers.size }),
    });
  });
  await page.goto("/?demo=orthographic");
  const a = page.getByTestId("orthographic"),
    b = page.getByTestId("perspective");
  const count = () =>
    page.evaluate(() =>
      (
        Reflect.get(window, "__orthoEffectsGPU") as () => { textures: number; framebuffers: number }
      )(),
    );
  await b.getByRole("button", { name: "销毁", exact: true }).click();
  await a.getByRole("button", { name: "组合效果", exact: true }).click();
  await effectPixels(a);
  await a.getByRole("button", { name: "组合效果", exact: true }).click();
  await effectPixels(a);
  const baseline = await count();
  for (let cycle = 0; cycle < 3; cycle++) {
    await a.getByRole("button", { name: "组合效果", exact: true }).click();
    const active = await effectPixels(a),
      allocated = await count();
    expect(allocated.textures).toBeGreaterThan(baseline.textures);
    expect(allocated.framebuffers).toBeGreaterThan(baseline.framebuffers);
    if (cycle === 0) {
      await a.getByRole("button", { name: "收窄容器", exact: true }).click();
      await expect.poll(async () => (await effectPixels(a)).width).toBeLessThan(active.width);
      await a.getByRole("button", { name: "零高度", exact: true }).click();
      await expect(a.getByTestId("projection-height")).toHaveText("0");
      await a.getByRole("button", { name: "零高度", exact: true }).click();
    }
    expect((await effectPixels(a)).error).toBe(0);
    await a.getByRole("button", { name: "组合效果", exact: true }).click();
    await effectPixels(a);
    expect(await count()).toEqual(baseline);
  }
  await a.getByRole("button", { name: "组合效果", exact: true }).click();
  await effectPixels(a);
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(a.locator("canvas")).toHaveCount(0);
  await a.getByRole("button", { name: "重建", exact: true }).click();
  await expect(a.getByTestId("projection-effects")).toHaveText("idle");
  expect((await effectPixels(a)).error).toBe(0);
  await expect(a.getByTestId("projection-error")).toBeEmpty();
});
