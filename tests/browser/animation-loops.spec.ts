import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

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

test("finite native skeletal ping-pong returns to the exact original GPU pose after pause and resume", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A"),
    b = page.getByTestId("scene-B");
  for (const panel of [a, b])
    await panel.getByRole("button", { name: "暂停", exact: true }).click();
  await a.getByRole("button", { name: "加载骨骼样例", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "播放动画", exact: true }).click();
  await a.getByRole("button", { name: "切换片段", exact: true }).click();
  await a.getByRole("button", { name: "切换片段", exact: true }).click();
  await expect(a.getByTestId("animation-clip")).toHaveText("Reach");
  await a.getByRole("button", { name: "往返一次", exact: true }).click();
  const original = await pixels(a);
  await a.getByRole("button", { name: "运行", exact: true }).click();
  await expect
    .poll(async () => Number(await a.getByTestId("animation-time").textContent()))
    .toBeGreaterThan(0.25);
  await a.getByRole("button", { name: "暂停动画", exact: true }).click();
  const paused = await pixels(a);
  expect(paused.hash).not.toBe(original.hash);
  expect(await pixels(a)).toEqual(paused);
  await a.getByRole("button", { name: "继续动画", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-state", "finished", { timeout: 10000 });
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  expect(await pixels(a)).toEqual(original);
  await expect(a.getByTestId("animation-time")).toHaveText("0.000");
  await expect(b).toHaveAttribute("data-state", "stopped");
  await expect(b.getByTestId("animation-time")).toHaveText("0.000");
  expect(errors).toEqual([]);
});

test("finite repeat completes, replays and cleans across model replacement and host rebuild", async ({
  page,
}) => {
  await page.goto("/");
  const a = page.getByTestId("scene-A"),
    b = page.getByTestId("scene-B");
  await b.getByRole("button", { name: "暂停", exact: true }).click();
  await a.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "循环两次", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-state", "finished", { timeout: 10000 });
  await expect(a.getByTestId("animation-time")).toHaveText("2.000");
  await a.getByRole("button", { name: "循环两次", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-state", "playing");
  await a.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect(a.getByRole("button", { name: "往返一次", exact: true })).toBeDisabled();
  await expect(a.getByRole("button", { name: "循环两次", exact: true })).toBeDisabled();
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await a.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "往返一次", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-state", "finished", { timeout: 10000 });
  await expect(a.locator("canvas")).toHaveCount(1);
  await expect(a.locator(".error")).toBeHidden();
  await expect(b).toHaveAttribute("data-state", "stopped");
});
