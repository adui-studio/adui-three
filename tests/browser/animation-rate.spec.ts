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

async function load(panel: Locator) {
  await panel.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
}

test("zero model rate freezes native GPU pose while host frames and a peer animation continue", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A"),
    b = page.getByTestId("scene-B");
  for (const panel of [a, b]) {
    await panel.getByRole("button", { name: "暂停", exact: true }).click();
    await load(panel);
    await panel.getByRole("button", { name: "播放动画", exact: true }).click();
    await panel.getByRole("slider", { name: "动画定位" }).fill("25");
    await panel.getByRole("button", { name: "继续动画", exact: true }).click();
  }
  await a.getByRole("slider", { name: "动画倍速" }).fill("0");
  const frozen = await pixels(a),
    frames = Number(await a.getByTestId("frames").textContent());
  await a.getByRole("button", { name: "运行", exact: true }).click();
  await b.getByRole("button", { name: "运行", exact: true }).click();
  await expect
    .poll(async () => Number(await a.getByTestId("frames").textContent()))
    .toBeGreaterThan(frames + 3);
  await expect(a.getByTestId("animation-time")).toHaveText("0.500");
  await expect(a).toHaveAttribute("data-animation-state", "playing");
  expect(await pixels(a)).toEqual(frozen);
  await expect(b.getByTestId("animation-time")).not.toHaveText("0.500");
  await expect(b).toHaveAttribute("data-animation-rate", "1.000");
  await a.getByRole("slider", { name: "动画倍速" }).fill("2");
  await expect(a.getByTestId("animation-time")).not.toHaveText("0.500");
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  expect((await pixels(a)).hash).not.toBe(frozen.hash);
  await expect(a).toHaveAttribute("data-animation-rate", "2.000");
  expect(errors).toEqual([]);
});

test("model rate freezes and resumes a real GLB crossfade without resetting weights", async ({
  page,
}) => {
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  await load(a);
  await a.getByRole("button", { name: "播放动画", exact: true }).click();
  await a.getByRole("slider", { name: "动画倍速" }).fill("0");
  await a.getByRole("button", { name: "渐变切换", exact: true }).click();
  const frozen = await pixels(a),
    frames = Number(await a.getByTestId("frames").textContent());
  await a.getByRole("button", { name: "运行", exact: true }).click();
  await expect
    .poll(async () => Number(await a.getByTestId("frames").textContent()))
    .toBeGreaterThan(frames + 3);
  await expect(a).toHaveAttribute("data-animation-blend-progress", "0.000");
  expect(await pixels(a)).toEqual(frozen);
  await a.getByRole("slider", { name: "动画倍速" }).fill("2");
  await expect(a).toHaveAttribute("data-animation-blending", "false");
  await expect(a).toHaveAttribute("data-animation-blend-progress", "1.000");
  await expect(a.getByTestId("animation-clip")).toHaveText("Slide");
});

test("changed model rate preserves finite completion and resets only when its owner is replaced", async ({
  page,
}) => {
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  await load(a);
  await a.getByRole("button", { name: "单次播放", exact: true }).click();
  await a.getByRole("slider", { name: "动画定位" }).fill("100");
  const end = await pixels(a);
  await a.getByRole("slider", { name: "动画定位" }).fill("75");
  await a.getByRole("slider", { name: "动画倍速" }).fill("2");
  await expect(a).toHaveAttribute("data-animation-state", "paused");
  await expect(a.getByTestId("animation-time")).toHaveText("1.500");
  await a.getByRole("button", { name: "继续动画", exact: true }).click();
  await a.getByRole("button", { name: "运行", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-state", "finished");
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  expect(await pixels(a)).toEqual(end);
  await expect(a.getByTestId("animation-completions")).toHaveText("1");
  await a.getByRole("button", { name: "停止动画", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-rate", "2.000");
  await a.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect(a.getByRole("slider", { name: "动画倍速" })).toBeDisabled();
  await expect(a).toHaveAttribute("data-animation-rate", "1.000");
  await load(a);
  await expect(a).toHaveAttribute("data-animation-rate", "1.000");
  await a.getByRole("slider", { name: "动画倍速" }).fill("0.5");
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-rate", "1.000");
  await expect(a.getByRole("slider", { name: "动画倍速" })).toBeDisabled();
  await expect(a.locator("canvas")).toHaveCount(1);
});
