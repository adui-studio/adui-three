import { expect, test } from "@playwright/test";

test("smooth framing follows host pause/resume and completes with a rendered model and labels", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await a.getByRole("button", { name: "加载 GLB", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "平滑取景", exact: true }).click();
  await expect(a).toHaveAttribute("data-transition-state", "running");
  await expect
    .poll(async () => Number(await a.getByTestId("transition-progress").textContent()))
    .toBeGreaterThan(0);
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(a).toHaveAttribute("data-state", "stopped");
  // Let the HUD interval sample the final paused progress before checking stability.
  await page.waitForTimeout(200);
  const progress = await a.getByTestId("transition-progress").textContent();
  const other = Number(await b.getByTestId("frames").textContent());
  await page.waitForTimeout(350);
  await expect(a.getByTestId("transition-progress")).toHaveText(progress!);
  await expect(a).toHaveAttribute("data-transition-state", "running");
  await a.getByRole("button", { name: "运行", exact: true }).click();
  await expect(a).toHaveAttribute("data-transition-state", "completed", { timeout: 15000 });
  await expect(a.getByTestId("transition-progress")).toHaveText("100");
  await expect(a.getByTestId("object-label").last()).toBeVisible();
  await expect(a.getByTestId("draw-calls")).not.toHaveText("0");
  expect(Number(await b.getByTestId("frames").textContent())).toBeGreaterThan(other);
  await expect(b).toHaveAttribute("data-transition-state", "idle");
  await page.screenshot({
    path: "test-results/camera-transition.png",
    fullPage: true,
    scale: "css",
  });
  expect(errors).toEqual([]);
});

test("pointer input, explicit cancellation and instant fitting release smooth framing", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  const start = panel.getByRole("button", { name: "平滑取景", exact: true });
  await start.click();
  await panel.getByRole("button", { name: "取消过渡", exact: true }).click();
  await expect(panel).toHaveAttribute("data-transition-state", "cancelled");
  await start.click();
  await panel.getByRole("button", { name: "适配视角", exact: true }).click();
  await expect(panel).toHaveAttribute("data-transition-state", "cancelled");
  // Keep the request pending while automation scrolls and locates the canvas. These UI actions
  // run in one task so software-rendering latency cannot complete the motion before pointerdown.
  await panel.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="transition"]')!.click();
    element.querySelector<HTMLButtonElement>('[data-action="stop"]')!.click();
  });
  await expect(panel).toHaveAttribute("data-state", "stopped");
  await expect(panel).toHaveAttribute("data-transition-state", "running");
  const canvas = panel.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  const label = panel.getByTestId("object-label").first();
  const before = (await label.boundingBox())!;
  const frames = Number(await panel.getByTestId("frames").textContent());
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 65, bounds.y + bounds.height / 2 + 20, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(panel).toHaveAttribute("data-transition-state", "cancelled");
  await panel.getByRole("button", { name: "运行", exact: true }).click();
  // The same native drag must reach the restored controls and change the projected view.
  await expect
    .poll(async () => {
      const after = (await label.boundingBox())!;
      return Math.hypot(after.x - before.x, after.y - before.y);
    })
    .toBeGreaterThan(2);
  await expect
    .poll(async () => Number(await panel.getByTestId("frames").textContent()))
    .toBeGreaterThan(frames);
  await expect(panel.locator(".error")).toBeHidden();
  expect(errors).toEqual([]);
});

test("superseding, resize, removal and host rebuild clean transitions independently", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  const start = a.getByRole("button", { name: "平滑取景", exact: true });
  await start.click();
  await start.click();
  await expect(a).toHaveAttribute("data-transition-state", "running");
  await a.getByRole("button", { name: "收窄容器", exact: true }).click();
  await expect(a).toHaveAttribute("data-transition-state", "cancelled");
  await a.getByRole("button", { name: "加载 GLB", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await start.click();
  await a.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect(a).toHaveAttribute("data-transition-state", "cancelled");
  await b.getByRole("button", { name: "平滑取景", exact: true }).click();
  await start.click();
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(a).toHaveAttribute("data-transition-state", "cancelled");
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await start.click();
  await expect(a).toHaveAttribute("data-transition-state", "completed", { timeout: 15000 });
  await expect(b).toHaveAttribute("data-transition-state", "completed", { timeout: 15000 });
  await expect(a.locator("canvas")).toHaveCount(1);
  await expect(a.locator(".error")).toBeHidden();
  expect(errors).toEqual([]);
});
