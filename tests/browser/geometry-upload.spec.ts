import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    __instanceTransfers: Array<{ offset: number; bytes: number; sourceBytes: number }>;
  }
}

test("editing one native instance uploads only its matrix and color components", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__instanceTransfers = [];
    const proto = WebGL2RenderingContext.prototype;
    const upload = Reflect.get(proto, "bufferSubData") as typeof proto.bufferSubData;
    proto.bufferSubData = function (
      target: number,
      offset: number,
      source: AllowSharedBufferSource,
      sourceOffset?: number,
      length?: number,
    ): void {
      if (source instanceof Float32Array) {
        const start = sourceOffset ?? 0;
        const count = length === undefined || length === 0 ? source.length - start : length;
        window.__instanceTransfers.push({
          offset,
          bytes: count * 4,
          sourceBytes: source.byteLength,
        });
      }
      Reflect.apply(
        upload,
        this,
        sourceOffset === undefined
          ? [target, offset, source]
          : [target, offset, source, sourceOffset, length],
      );
    };
  });
  await page.goto("/?demo=instances");
  await expect(page.getByTestId("instance-count")).toHaveText("25");
  await page.evaluate(() => {
    window.__instanceTransfers.length = 0;
  });
  await page.getByRole("button", { name: "移动首个", exact: true }).click();
  expect
    .soft(await page.evaluate(() => window.__instanceTransfers))
    .toEqual([{ offset: 0, bytes: 64, sourceBytes: 25 * 16 * 4 }]);
  await page.evaluate(() => {
    window.__instanceTransfers.length = 0;
  });
  await page.getByRole("button", { name: "首个变绿", exact: true }).click();
  expect
    .soft(await page.evaluate(() => window.__instanceTransfers))
    .toEqual([{ offset: 0, bytes: 12, sourceBytes: 25 * 3 * 4 }]);
  // A redraw without edits must not upload either array again.
  await page.evaluate(() => {
    window.__instanceTransfers.length = 0;
  });
  await page.getByRole("button", { name: "绘制一帧", exact: true }).click();
  expect(await page.evaluate(() => window.__instanceTransfers)).toEqual([]);
  expect(
    await page
      .locator("canvas")
      .evaluate((canvas) => (canvas as HTMLCanvasElement).getContext("webgl2")!.getError()),
  ).toBe(0);
});
