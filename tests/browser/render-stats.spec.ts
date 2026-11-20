import { expect, test } from "@playwright/test";

test("workbench statistics isolate two hosts and release panels across reconstruction", async ({
  page,
}) => {
  await page.goto("/");
  const a = page.getByTestId("scene-A"),
    b = page.getByTestId("scene-B");
  const first = a.locator(".render-stats"),
    second = b.locator(".render-stats");
  await first.locator("summary").click();
  await second.locator("summary").click();
  await expect
    .poll(async () =>
      Number((await first.locator('[data-stat="fps"]').textContent())?.replaceAll(",", "")),
    )
    .toBeGreaterThan(0);
  await a.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(first.locator('[data-stat="fps"]')).toHaveText("—");
  const count = Number(await first.getAttribute("data-draws"));
  const peer = Number(await second.getAttribute("data-draws"));
  await expect
    .poll(async () => Number(await second.getAttribute("data-draws")))
    .toBeGreaterThan(peer);
  expect(Number(await first.getAttribute("data-draws"))).toBe(count);
  await a.getByRole("button", { name: "绘制一帧", exact: true }).click();
  expect(Number(await first.getAttribute("data-draws"))).toBe(count + 1);
  for (let cycle = 0; cycle < 2; cycle++) {
    await a.getByRole("button", { name: "销毁", exact: true }).click();
    await expect(first).toHaveCount(0);
    await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
    await expect(first).toHaveCount(1);
  }
  await expect(second).toHaveCount(1);
  await expect(b).toHaveAttribute("data-state", "running");
});
