import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

async function loadAnimated(panel: Locator): Promise<void> {
  await panel.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await expect(panel.getByRole("button", { name: "播放动画", exact: true })).toBeEnabled();
}

test("real GLB animation moves the model label, pauses, resumes and restores the initial pose on stop", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  await loadAnimated(panel);
  const label = panel.getByTestId("object-label").last();
  await expect(label).toBeVisible();
  const origin = (await label.boundingBox())!;
  await panel.getByRole("button", { name: "播放动画", exact: true }).click();
  await expect(panel.getByTestId("animation-clip")).toHaveText("Lift");
  await expect
    .poll(async () => Number(await panel.getByTestId("animation-time").textContent()))
    .toBeGreaterThan(0.15);
  await panel.getByRole("button", { name: "暂停动画", exact: true }).click();
  await expect(panel).toHaveAttribute("data-animation-state", "paused");
  const frozen = await panel.getByTestId("animation-time").textContent();
  const pose = (await label.boundingBox())!;
  expect(Math.abs(pose.y - origin.y)).toBeGreaterThan(1);
  await page.waitForTimeout(250);
  await expect(panel.getByTestId("animation-time")).toHaveText(frozen!);
  await panel.getByRole("button", { name: "继续动画", exact: true }).click();
  await expect(panel.getByTestId("animation-time")).not.toHaveText(frozen!);
  await panel.getByRole("button", { name: "停止动画", exact: true }).click();
  await expect(panel).toHaveAttribute("data-animation-state", "idle");
  await expect(panel.getByTestId("animation-time")).toHaveText("0.000");
  await expect
    .poll(async () => Math.abs((await label.boundingBox())!.y - origin.y))
    .toBeLessThan(1);
  expect(errors).toEqual([]);
});

test("one-shot finishes at the last time and switching selects a fresh second clip", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  await loadAnimated(panel);
  await panel.getByRole("button", { name: "单次播放", exact: true }).click();
  await expect(panel).toHaveAttribute("data-animation-state", "finished", { timeout: 10000 });
  await expect(panel.getByTestId("animation-time")).toHaveText("2.000");
  await page.waitForTimeout(200);
  await expect(panel.getByTestId("animation-time")).toHaveText("2.000");
  await panel.getByRole("button", { name: "切换片段", exact: true }).click();
  await expect(panel.getByTestId("animation-clip")).toHaveText("Slide");
  await expect(panel).toHaveAttribute("data-animation-state", "playing");
  await expect
    .poll(async () => Number(await panel.getByTestId("animation-time").textContent()))
    .toBeGreaterThan(0.1);
  await panel.getByRole("button", { name: "暂停动画", exact: true }).click();
  await page.screenshot({
    path: "test-results/animation-playground.png",
    fullPage: true,
    scale: "css",
  });
  expect(errors).toEqual([]);
});

test("host pause, model removal and rebuild leave another instance's animation independent", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await loadAnimated(a);
  await loadAnimated(b);
  await a.getByRole("button", { name: "播放动画", exact: true }).click();
  await b.getByRole("button", { name: "播放动画", exact: true }).click();
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  const frozen = await a.getByTestId("animation-time").textContent();
  const other = await b.getByTestId("animation-time").textContent();
  await page.waitForTimeout(250);
  await expect(a.getByTestId("animation-time")).toHaveText(frozen!);
  await expect(b.getByTestId("animation-time")).not.toHaveText(other!);
  await a.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect(a.getByRole("button", { name: "播放动画", exact: true })).toBeDisabled();
  await expect(a.getByTestId("animation-clip")).toHaveText("—");
  await expect(b).toHaveAttribute("data-animation-state", "playing");
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(a.locator("canvas")).toHaveCount(1);
  await expect(a.getByRole("button", { name: "播放动画", exact: true })).toBeDisabled();
  await b.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(b.locator("canvas")).toHaveCount(0);
  await expect(b.getByRole("button", { name: "播放动画", exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});
