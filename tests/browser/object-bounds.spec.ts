import { expect, test } from "@playwright/test";

test("world size is independent of viewport, rendering and the other host, with explicit snapshots", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A"),
    peer = page.getByTestId("scene-B");
  for (const item of [panel, peer])
    await item.getByRole("button", { name: "暂停", exact: true }).click();
  await panel.getByRole("button", { name: "加载 GLB", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  const frames = await panel.getByTestId("frames").textContent();
  const draws = await panel.getAttribute("data-render-count");
  const camera = await panel.getAttribute("data-camera-position");
  const size = panel.getByTestId("bounds-size");
  await panel.getByRole("button", { name: "测量对象", exact: true }).click();
  await expect(size).toHaveText("2.000 × 1.800 × 1.800");
  await panel.getByRole("button", { name: "大模型", exact: true }).click();
  await expect(size).toHaveText("2.000 × 1.800 × 1.800");
  await panel.getByRole("button", { name: "测量对象", exact: true }).click();
  await expect(size).toHaveText("40.000 × 36.000 × 36.000");
  await expect(panel.getByTestId("frames")).toHaveText(frames!);
  await expect(panel).toHaveAttribute("data-render-count", draws!);
  await expect(panel).toHaveAttribute("data-camera-position", camera!);
  await panel.getByRole("button", { name: "收窄容器", exact: true }).click();
  await panel.getByRole("button", { name: "零高度", exact: true }).click();
  await expect(panel.getByTestId("size")).toContainText("× 0");
  await panel.getByRole("button", { name: "测量对象", exact: true }).click();
  await expect(size).toHaveText("40.000 × 36.000 × 36.000");
  await panel.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect(size).toHaveText("—");
  await panel.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(panel.getByRole("button", { name: "测量对象", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(size).toHaveText("—");
  await expect(peer.getByTestId("bounds-size")).toHaveText("—");
  await expect(peer).toHaveAttribute("data-model-state", "idle");
  await expect(peer).toHaveAttribute("data-state", "stopped");
  expect(errors).toEqual([]);
});

test("paused native skin pose and parent scale are measured without advancing animation or drawing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  await panel.getByRole("button", { name: "暂停", exact: true }).click();
  await panel.getByRole("button", { name: "加载骨骼样例", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  const measure = panel.getByRole("button", { name: "测量对象", exact: true }),
    size = panel.getByTestId("bounds-size");
  await measure.click();
  const original = await size.textContent();
  await panel.getByRole("button", { name: "播放动画", exact: true }).click();
  await panel.getByRole("slider", { name: "动画定位" }).fill("50");
  await expect(panel.getByTestId("animation-time")).toHaveText("1.000");
  const draws = await panel.getAttribute("data-render-count");
  await measure.click();
  const posed = await size.textContent();
  expect(posed).not.toBe(original);
  await expect(panel).toHaveAttribute("data-render-count", draws!);
  await expect(panel.getByTestId("animation-time")).toHaveText("1.000");
  await panel.getByRole("button", { name: "大模型", exact: true }).click();
  await measure.click();
  const values = (value: string) => value.split(" × ").map(Number);
  const enlarged = values((await size.textContent())!);
  values(posed!).forEach((value, index) => expect(enlarged[index]! / value).toBeCloseTo(20, 1));
  await panel.getByRole("button", { name: "大模型", exact: true }).click();
  await panel.getByRole("button", { name: "停止动画", exact: true }).click();
  await measure.click();
  await expect(size).toHaveText(original!);
  await expect(panel).toHaveAttribute("data-state", "stopped");
  await expect(panel.locator(".error")).toBeHidden();
  expect(errors).toEqual([]);
});
