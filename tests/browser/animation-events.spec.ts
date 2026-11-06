import { expect, test } from "@playwright/test";

test("a sampled completion can chain the next real GLB clip and loop notices remain independent", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A"),
    b = page.getByTestId("scene-B");
  await b.getByRole("button", { name: "暂停", exact: true }).click();
  await a.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "完成后切换", exact: true }).click();
  await a.getByRole("button", { name: "单次播放", exact: true }).click();
  await expect(a.getByTestId("animation-completions")).toHaveText("1", { timeout: 10000 });
  await expect(a.getByTestId("animation-last-completion")).toHaveText("Lift");
  await expect(a.getByTestId("animation-clip")).toHaveText("Slide");
  await expect(a).toHaveAttribute("data-animation-state", "playing");
  await expect
    .poll(async () => Number(await a.getByTestId("animation-loops").textContent()))
    .toBeGreaterThan(0);
  await expect(a.getByTestId("animation-completions")).toHaveText("1");
  await expect(b.getByTestId("animation-completions")).toHaveText("0");
  await expect(b.getByTestId("animation-loops")).toHaveText("0");
  expect(errors).toEqual([]);
});

test("model replacement and host rebuild reset consumer subscriptions while ping-pong completes once", async ({
  page,
}) => {
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  await page.getByTestId("scene-B").getByRole("button", { name: "暂停", exact: true }).click();
  await a.getByRole("button", { name: "加载动画样例", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "播放动画", exact: true }).click();
  await expect
    .poll(async () => Number(await a.getByTestId("animation-loops").textContent()))
    .toBeGreaterThan(0);
  await a.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect(a.getByTestId("animation-loops")).toHaveText("0");
  await expect(a.getByTestId("animation-completions")).toHaveText("0");
  await a.getByRole("button", { name: "加载骨骼样例", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await a.getByRole("button", { name: "往返一次", exact: true }).click();
  await expect(a.getByTestId("animation-completions")).toHaveText("1", { timeout: 10000 });
  await expect(a.getByTestId("animation-last-completion")).toHaveText("Bend");
  await expect(a).toHaveAttribute("data-animation-state", "finished");
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(a.getByTestId("animation-completions")).toHaveText("0");
  await expect(a.getByTestId("animation-last-completion")).toHaveText("—");
  await expect(a.locator(".error")).toBeHidden();
});
