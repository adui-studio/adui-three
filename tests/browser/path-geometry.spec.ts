import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
declare global {
  interface Window {
    __pathGeometryBuffers: WeakMap<WebGL2RenderingContext, Set<WebGLBuffer>>;
  }
}
const action = (card: Locator, name: string) => card.getByRole("button", { name, exact: true });
async function pixels(card: Locator) {
  return card.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!,
      gl = canvas.getContext("webgl2")!,
      bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bytes,
    );
    let orange = 0,
      green = 0,
      hash = 2166136261;
    for (let i = 0; i < bytes.length; i += 4) {
      if (bytes[i]! > 180 && bytes[i]! > bytes[i + 1]! * 1.3 && bytes[i + 1]! > 70) orange++;
      if (bytes[i + 1]! > 120 && bytes[i + 1]! > bytes[i]! * 1.15) green++;
      hash = Math.imul(hash ^ bytes[i]!, 16777619);
      hash = Math.imul(hash ^ bytes[i + 1]!, 16777619);
    }
    return {
      orange,
      green,
      hash: hash >>> 0,
      error: gl.getError(),
      buffers: window.__pathGeometryBuffers?.get(gl)?.size ?? 0,
    };
  });
}
test("native path ribbon and tube progress, UV and shape changes render independently while stopped", async ({
  page,
}) => {
  await page.goto("/?demo=path-geometry");
  const ribbon = page.getByTestId("path-geometry-ribbon"),
    tube = page.getByTestId("path-geometry-tube");
  await action(ribbon, "暂停场景").click();
  await action(tube, "暂停场景").click();
  const full = await pixels(ribbon),
    peer = await pixels(tube);
  expect(full.orange).toBeGreaterThan(30);
  expect(peer.green).toBeGreaterThan(30);
  expect(full.error).toBe(0);
  expect(peer.error).toBe(0);
  await ribbon.getByRole("slider", { name: "路径进度", exact: true }).fill("0");
  expect((await pixels(ribbon)).orange).toBe(0);
  await ribbon.getByRole("slider", { name: "路径进度", exact: true }).fill("50");
  const partial = await pixels(ribbon);
  expect(partial.orange).toBeGreaterThan(10);
  expect(partial.orange).toBeLessThan(full.orange);
  expect(await pixels(tube)).toEqual(peer);
  await ribbon.getByRole("slider", { name: "路径进度", exact: true }).fill("100");
  expect(await pixels(ribbon)).toEqual(full);
  await action(ribbon, "切换箭头").click();
  expect((await pixels(ribbon)).hash).not.toBe(full.hash);
  await action(ribbon, "切换侧边").click();
  await expect(ribbon.locator('[data-value="side"]')).toHaveText("left");
  await action(ribbon, "切换闭合").click();
  await expect(ribbon.locator('[data-value="shape"]')).toHaveText("closed");
  expect((await pixels(ribbon)).orange).toBeGreaterThan(30);
  await tube.getByRole("slider", { name: "路径进度", exact: true }).fill("0");
  expect((await pixels(tube)).green).toBe(0);
  await tube.getByRole("slider", { name: "路径进度", exact: true }).fill("65");
  expect((await pixels(tube)).green).toBeGreaterThan(20);
  await expect(ribbon.getByRole("alert")).toBeHidden();
  await expect(tube.getByRole("alert")).toBeHidden();
  await page.screenshot({ path: "test-results/path-geometry.png", fullPage: true });
});
test("repeated path geometry replacement deletes native buffers and host reconstruction leaves one canvas", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__pathGeometryBuffers = new WeakMap();
    const prototype = WebGL2RenderingContext.prototype;
    // Captured native methods are invoked below with the actual WebGL context via call.
    // oxlint-disable-next-line typescript/unbound-method
    const create = prototype.createBuffer;
    // oxlint-disable-next-line typescript/unbound-method
    const remove = prototype.deleteBuffer;
    prototype.createBuffer = function () {
      const buffer = create.call(this);
      if (buffer) {
        let set = window.__pathGeometryBuffers.get(this);
        if (!set) {
          set = new Set();
          window.__pathGeometryBuffers.set(this, set);
        }
        set.add(buffer);
      }
      return buffer;
    };
    prototype.deleteBuffer = function (buffer) {
      if (buffer) window.__pathGeometryBuffers.get(this)?.delete(buffer);
      remove.call(this, buffer);
    };
  });
  await page.goto("/?demo=path-geometry");
  for (const name of ["ribbon", "tube"]) {
    const card = page.getByTestId("path-geometry-" + name);
    await action(card, "暂停场景").click();
    const baseline = await pixels(card);
    expect(baseline.buffers).toBeGreaterThan(0);
    for (const value of ["20", "80", "40", "100"]) {
      await card.getByRole("slider", { name: "路径进度", exact: true }).fill(value);
      expect((await pixels(card)).buffers).toBe(baseline.buffers);
      await expect(card).toHaveAttribute("data-geometries", "1");
    }
    await card.getByRole("slider", { name: "拐角修剪", exact: true }).fill("0");
    await action(card, "切换闭合").click();
    expect((await pixels(card)).buffers).toBe(baseline.buffers);
    await action(card, "销毁场景").click();
    await expect(card.locator("canvas")).toHaveCount(0);
    await action(card, "重建场景").click();
    await expect(card.locator("canvas")).toHaveCount(1);
    expect((await pixels(card)).error).toBe(0);
    await expect(card.getByRole("alert")).toBeHidden();
  }
});
