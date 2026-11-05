import { expect, test } from "@playwright/test";

test("one-shot rendering draws a paused view without advancing updates or scheduling frames", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(a).toHaveAttribute("data-state", "stopped");
  const frames = await a.getByTestId("frames").textContent();
  const before = Number(await a.getAttribute("data-render-count"));
  const other = Number(await b.getByTestId("frames").textContent());
  await a.getByRole("button", { name: "绘制一帧", exact: true }).click();
  await expect(a).toHaveAttribute("data-render-count", String(before + 1));
  await expect(a.getByTestId("frames")).toHaveText(frames!);
  await expect(a.getByTestId("draw-calls")).not.toHaveText("0");
  await expect(a.getByTestId("object-label").first()).toBeVisible();
  await page.waitForTimeout(250);
  await expect(a).toHaveAttribute("data-render-count", String(before + 1));
  await expect(a).toHaveAttribute("data-state", "stopped");
  await expect
    .poll(async () => Number(await b.getByTestId("frames").textContent()))
    .toBeGreaterThan(other);
  await a.getByRole("button", { name: "零高度", exact: true }).click();
  await expect(a.getByRole("button", { name: "绘制一帧", exact: true })).toBeDisabled();
  await a.getByRole("button", { name: "零高度", exact: true }).click();
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(a.getByRole("button", { name: "绘制一帧", exact: true })).toBeDisabled();
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(a.locator("canvas")).toHaveCount(1);
  await expect(a.locator(".error")).toBeHidden();
  expect(errors).toEqual([]);
});
