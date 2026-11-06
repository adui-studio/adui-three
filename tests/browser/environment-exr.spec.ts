import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Locator, Page, Route } from "@playwright/test";

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
    let brightness = 0;
    for (let index = 0; index < bytes.length; index += 4)
      brightness += bytes[index]! + bytes[index + 1]! + bytes[index + 2]!;
    return { corner: Array.from(bytes.subarray(0, 3)), brightness, error: gl.getError() };
  });
}

test("real EXR half-float lighting and background render while paused and remain independent with bloom", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A"),
    b = page.getByTestId("scene-B");
  const before = await pixels(a),
    peer = await pixels(b),
    frames = await a.getByTestId("frames").textContent();
  await a.getByRole("button", { name: "加载 EXR", exact: true }).click();
  await expect(a).toHaveAttribute("data-environment-state", "loaded");
  const sky = await pixels(a);
  expect(sky.corner).not.toEqual(before.corner);
  expect(sky.brightness).not.toBe(before.brightness);
  expect(sky.error).toBe(0);
  await a.getByRole("button", { name: "环境背景", exact: true }).click();
  const lighting = await pixels(a);
  expect(lighting.corner).toEqual(before.corner);
  expect(lighting.brightness).not.toBe(before.brightness);
  await a.getByRole("button", { name: "环境背景", exact: true }).click();
  await a.getByRole("button", { name: "泛光", exact: true }).click();
  expect((await pixels(a)).error).toBe(0);
  expect((await pixels(b)).brightness).toBe(peer.brightness);
  await expect(a.getByTestId("frames")).toHaveText(frames!);
  await page.screenshot({ path: "test-results/environment-exr.png", fullPage: true, scale: "css" });
  await a.getByRole("button", { name: "释放后处理", exact: true }).click();
  await a.getByRole("button", { name: "移除环境", exact: true }).click();
  expect((await pixels(a)).corner).toEqual(before.corner);
  expect(errors).toEqual([]);
});

test("equal-URL EXR requests share transport while cancellation, invalid data, retry and disposal remain task-local", async ({
  page,
}) => {
  const body = await readFile("apps/website/public/environments/studio.exr"),
    held: Route[] = [];
  let blocked = true,
    requests = 0;
  await page.route("**/environments/studio.exr", (route) => {
    requests++;
    if (blocked) {
      held.push(route);
      return;
    }
    return route.fulfill({ status: 200, contentType: "image/x-exr", body });
  });
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A"),
    b = page.getByTestId("scene-B");
  await a.getByRole("button", { name: "加载 EXR", exact: true }).click();
  await b.getByRole("button", { name: "加载 EXR", exact: true }).click();
  await expect.poll(() => held.length).toBe(1);
  expect(requests).toBe(1);
  await a.getByRole("button", { name: "取消环境", exact: true }).click();
  blocked = false;
  await held.shift()!.fulfill({ status: 200, contentType: "image/x-exr", body });
  await expect(a).toHaveAttribute("data-environment-state", "cancelled");
  await expect(b).toHaveAttribute("data-environment-state", "loaded");
  await a.getByRole("button", { name: "EXR 失败", exact: true }).click();
  await expect(a).toHaveAttribute("data-environment-state", "error");
  await a.getByRole("button", { name: "加载 EXR", exact: true }).click();
  await expect(a).toHaveAttribute("data-environment-state", "loaded");
  await a.getByRole("button", { name: "移除环境", exact: true }).click();
  blocked = true;
  await a.getByRole("button", { name: "加载 EXR", exact: true }).click();
  await expect.poll(() => held.length).toBe(1);
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  await held.shift()!.fulfill({ status: 200, contentType: "image/x-exr", body });
  await expect(a.locator("canvas")).toHaveCount(0);
  await expect(b).toHaveAttribute("data-environment-state", "loaded");
  expect((await pixels(b)).error).toBe(0);
});

test("EXR source and native converted targets return to the warmed GPU baseline across three releases", async ({
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
      __exrGPU: () => ({ textures: textures.size, framebuffers: framebuffers.size }),
    });
  });
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const count = () =>
    page.evaluate(() =>
      (Reflect.get(window, "__exrGPU") as () => { textures: number; framebuffers: number })(),
    );
  await a.getByRole("button", { name: "加载 EXR", exact: true }).click();
  await expect(a).toHaveAttribute("data-environment-state", "loaded");
  await pixels(a);
  await a.getByRole("button", { name: "移除环境", exact: true }).click();
  await pixels(a);
  const baseline = await count();
  for (let cycle = 0; cycle < 3; cycle++) {
    await a.getByRole("button", { name: "加载 EXR", exact: true }).click();
    await expect(a).toHaveAttribute("data-environment-state", "loaded");
    expect((await pixels(a)).error).toBe(0);
    const active = await count();
    expect(active.textures).toBeGreaterThan(baseline.textures);
    expect(active.framebuffers).toBeGreaterThan(baseline.framebuffers);
    await a.getByRole("button", { name: "移除环境", exact: true }).click();
    await pixels(a);
    expect(await count()).toEqual(baseline);
  }
});
