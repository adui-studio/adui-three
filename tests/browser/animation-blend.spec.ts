import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

async function load(panel: Locator): Promise<void> {
  await panel.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await panel.getByRole("button", { name: "播放动画", exact: true }).click();
}

test("real GLB crossfade follows host/controller pause and interrupted handoff preserves the displayed pose", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await load(a);
  await load(b);
  await a.getByRole("button", { name: "下次平滑渐变", exact: true }).click();
  await expect(a.getByRole("button", { name: "下次平滑渐变", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await b.getByRole("button", { name: "暂停", exact: true }).click();
  const other = await b.getByTestId("animation-time").textContent();
  await a.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="animation-fade"]')!.click();
    element.querySelector<HTMLButtonElement>('[data-action="stop"]')!.click();
  });
  await expect(a).toHaveAttribute("data-animation-blending", "true");
  await expect(a).toHaveAttribute("data-animation-blend-progress", "0.000");
  const stoppedFrames = await a.getByTestId("frames").textContent();
  await a.getByRole("button", { name: "绘制一帧", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-blend-progress", "0.000");
  await expect(a.getByTestId("frames")).toHaveText(stoppedFrames!);
  await a.getByRole("button", { name: "运行", exact: true }).click();
  await expect
    .poll(async () => Number(await a.getAttribute("data-animation-blend-progress")))
    .toBeGreaterThan(0.1);
  await a.getByRole("button", { name: "暂停动画", exact: true }).click();
  const progress = await a.getAttribute("data-animation-blend-progress");
  const frames = Number(await a.getByTestId("frames").textContent());
  const pose = await a.getByTestId("object-label").last().boundingBox();
  await expect
    .poll(async () => Number(await a.getByTestId("frames").textContent()))
    .toBeGreaterThan(frames + 2);
  await expect(a).toHaveAttribute("data-animation-blend-progress", progress!);
  const frozen = await a.getByTestId("object-label").last().boundingBox();
  expect(frozen!.x).toBeCloseTo(pose!.x, 0);
  expect(frozen!.y).toBeCloseTo(pose!.y, 0);
  const interruption = await a.evaluate((element) => {
    const hash = (): number => {
      element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
      const gl = element.querySelector("canvas")!.getContext("webgl2")!,
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
      let value = 2166136261;
      for (const byte of bytes) value = Math.imul(value ^ byte, 16777619);
      return value;
    };
    const beforeHash = hash();
    const label = element.querySelectorAll<HTMLElement>('[data-testid="object-label"]');
    const before = label[label.length - 1]!.getBoundingClientRect();
    element.querySelector<HTMLButtonElement>('[data-action="animation-fade"]')!.click();
    element.querySelector<HTMLButtonElement>('[data-action="stop"]')!.click();
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const after = label[label.length - 1]!.getBoundingClientRect();
    return {
      x: after.x - before.x,
      y: after.y - before.y,
      beforeHash,
      afterHash: hash(),
      error: element.querySelector("canvas")!.getContext("webgl2")!.getError(),
    };
  });
  expect(Math.abs(interruption.x)).toBeLessThan(0.5);
  expect(Math.abs(interruption.y)).toBeLessThan(0.5);
  expect(interruption.afterHash).toBe(interruption.beforeHash);
  expect(interruption.error).toBe(0);
  await expect(a.getByTestId("animation-clip")).toHaveText("Lift");
  await expect(a).toHaveAttribute("data-animation-blend-progress", "0.000");
  await a.getByRole("button", { name: "运行", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-blending", "false");
  await expect(a).toHaveAttribute("data-animation-blend-progress", "1.000");
  await expect(b.getByTestId("animation-time")).toHaveText(other!);
  await expect(b).toHaveAttribute("data-animation-blending", "false");
  await page.screenshot({ path: "test-results/animation-blend.png", fullPage: true, scale: "css" });
  expect(errors).toEqual([]);
});

test("seek, immediate stop, model removal and host rebuild release active blend actions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await load(a);
  await load(b);
  await a.getByRole("button", { name: "渐变切换", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-blending", "true");
  await a.getByRole("slider", { name: "动画定位" }).fill("50");
  await expect(a).toHaveAttribute("data-animation-blending", "false");
  await expect(a).toHaveAttribute("data-animation-state", "paused");
  await expect(a.getByTestId("animation-time")).toHaveText("1.000");
  await a.getByRole("button", { name: "渐变切换", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-blending", "true");
  await a.getByRole("button", { name: "停止动画", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-state", "idle");
  await expect(a).toHaveAttribute("data-animation-blending", "false");
  await a.getByRole("button", { name: "渐变切换", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-state", "playing");
  await expect(a).toHaveAttribute("data-animation-blending", "false");
  await a.getByRole("button", { name: "渐变切换", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-blending", "true");
  await a.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-blending", "false");
  await expect(a).toHaveAttribute("data-animation-state", "idle");
  await expect(b).toHaveAttribute("data-animation-state", "playing");
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-blending", "false");
  await expect(a.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});
