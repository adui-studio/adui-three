import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { observeKTX2 } from "./ktx2-probe.ts";

async function pause(page: Page): Promise<void> {
  for (const id of ["A", "B"])
    await page
      .getByTestId("scene-" + id)
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
    let hash = 2166136261;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
    return { hash, error: gl.getError() };
  });
}

test("standalone KTX2 uploads real compressed mips while paused and repeated disposal deletes each owned texture", async ({
  page,
}) => {
  await observeKTX2(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  const before = await pixels(a);
  const other = await pixels(b);
  const frames = await a.getByTestId("frames").textContent();
  for (let index = 0; index < 3; index++) {
    await a.getByRole("button", { name: "加载 KTX2 纹理", exact: true }).click();
    await expect(a).toHaveAttribute("data-texture-state", "loaded");
    await expect
      .poll(() => page.evaluate(() => window.__ktx))
      .toMatchObject({ created: index + 1, terminated: index + 1, revoked: index + 1 });
    await expect(a.getByRole("button", { name: "纹理翻转", exact: true })).toBeDisabled();
    const active = await pixels(a);
    expect(active.hash).not.toBe(before.hash);
    expect(active.error).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__ktx.compressed)).toBeGreaterThan(0);
    if (index === 0)
      await page.screenshot({
        path: "test-results/standalone-ktx2.png",
        fullPage: true,
        scale: "css",
      });
    const deleted = await page.evaluate(() => window.__ktx.deleted);
    await a.getByRole("button", { name: "移除纹理", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__ktx.deleted)).toBeGreaterThan(deleted);
    expect(await pixels(a)).toEqual(before);
  }
  expect(await pixels(b)).toEqual(other);
  await expect(a.getByTestId("frames")).toHaveText(frames!);
  expect(errors).toEqual([]);
});

test("equal URLs share one download, cancellation skips only one parse and disposal during Basis init cleans late workers", async ({
  page,
}) => {
  await observeKTX2(page);
  const body = await readFile("apps/website/public/models/checker.ktx2");
  let requests = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/models/checker.ktx2", async (route) => {
    requests++;
    await gate;
    await route.fulfill({ body, contentType: "image/ktx2" });
  });
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await page.evaluate(() => {
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-action="texture-ktx2"]',
    ))
      button.click();
  });
  await expect.poll(() => requests).toBe(1);
  await a.getByRole("button", { name: "取消纹理", exact: true }).click();
  await expect(a).toHaveAttribute("data-texture-state", "cancelled");
  release();
  await expect(b).toHaveAttribute("data-texture-state", "loaded");
  await expect
    .poll(() => page.evaluate(() => window.__ktx))
    .toMatchObject({ created: 1, terminated: 1, revoked: 1 });
  await expect(a).toHaveAttribute("data-texture-state", "cancelled");
  let binaryStarted = false;
  let releaseBinary: () => void = () => {};
  const binaryGate = new Promise<void>((resolve) => {
    releaseBinary = resolve;
  });
  await page.route("**/*basis_transcoder*.wasm*", async (route) => {
    binaryStarted = true;
    await binaryGate;
    await route.continue();
  });
  await a.getByRole("button", { name: "加载 KTX2 纹理", exact: true }).click();
  await expect.poll(() => binaryStarted).toBe(true);
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  releaseBinary();
  await expect
    .poll(() => page.evaluate(() => window.__ktx))
    .toMatchObject({ created: 2, terminated: 2, revoked: 2 });
  await expect(a.locator("canvas")).toHaveCount(0);
  await expect(b).toHaveAttribute("data-texture-state", "loaded");
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(a).toHaveAttribute("data-texture-state", "idle");
});

test("standalone KTX2 recovers from missing transcoder or malformed container and uses real RGBA fallback", async ({
  page,
}) => {
  await observeKTX2(page, true);
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  await page.route("**/*basis_transcoder*.js*", (route) =>
    route.fulfill({ status: 404, body: "missing transcoder" }),
  );
  await a.getByRole("button", { name: "加载 KTX2 纹理", exact: true }).click();
  await expect(a).toHaveAttribute("data-texture-state", "error");
  expect(await page.evaluate(() => window.__ktx.created)).toBe(0);
  await page.unroute("**/*basis_transcoder*.js*");
  await a.getByRole("button", { name: "加载 KTX2 纹理", exact: true }).click();
  await expect(a).toHaveAttribute("data-texture-state", "loaded");
  expect((await pixels(a)).error).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__ktx.rgba)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__ktx.compressed)).toBe(0);
  await a.getByRole("button", { name: "KTX2 纹理失败", exact: true }).click();
  await expect(a).toHaveAttribute("data-texture-state", "error");
  await a.getByRole("button", { name: "加载 KTX2 纹理", exact: true }).click();
  await expect(a).toHaveAttribute("data-texture-state", "loaded");
});
