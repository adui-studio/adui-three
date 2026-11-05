import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

async function seek(panel: Locator, value: string): Promise<void> {
  await panel.getByRole("slider", { name: "动画定位" }).fill(value);
}

test("timeline seeks real animated poses while the host stays stopped and resume starts at the selected time", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await a.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  await b.getByRole("button", { name: "暂停", exact: true }).click();
  await a.getByRole("button", { name: "播放动画", exact: true }).click();
  const frames = await a.getByTestId("frames").textContent();
  await seek(a, "0");
  const label = a.getByTestId("object-label").last();
  const start = await label.boundingBox();
  await seek(a, "50");
  await expect(a.getByTestId("animation-time")).toHaveText("1.000");
  await expect(a).toHaveAttribute("data-animation-state", "paused");
  await expect(a).toHaveAttribute("data-state", "stopped");
  await expect
    .poll(async () => Math.abs((await label.boundingBox())!.y - start!.y))
    .toBeGreaterThan(10);
  await expect(a.getByTestId("frames")).toHaveText(frames!);
  await expect(b).toHaveAttribute("data-animation-state", "idle");
  await page.screenshot({ path: "test-results/animation-seek.png", fullPage: true, scale: "css" });
  await a.getByRole("button", { name: "继续动画", exact: true }).click();
  await expect(a.getByTestId("animation-time")).toHaveText("1.000");
  await a.getByRole("button", { name: "运行", exact: true }).click();
  await expect(a.getByTestId("animation-time")).not.toHaveText("1.000");
  await a.getByRole("button", { name: "停止动画", exact: true }).click();
  await expect(a.getByRole("slider", { name: "动画定位" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("timeline can inspect completed one-shot endpoints and is detached by model removal or host rebuild", async ({
  page,
}) => {
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  await a.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "单次播放", exact: true }).click();
  // Seek deliberately reaches the endpoint without waiting for wall-clock completion.
  await seek(a, "100");
  await expect(a.getByTestId("animation-time")).toHaveText("2.000");
  await a.getByRole("button", { name: "继续动画", exact: true }).click();
  await expect(a).toHaveAttribute("data-animation-state", "finished");
  await seek(a, "25");
  await expect(a.getByTestId("animation-time")).toHaveText("0.500");
  await expect(a).toHaveAttribute("data-animation-state", "paused");
  await a.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect(a.getByRole("slider", { name: "动画定位" })).toBeDisabled();
  await expect(a.getByTestId("animation-progress")).toHaveText("0");
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(a.getByRole("slider", { name: "动画定位" })).toBeDisabled();
  await expect(a.locator("canvas")).toHaveCount(1);
});
