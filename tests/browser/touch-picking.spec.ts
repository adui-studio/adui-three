import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

declare global {
  interface Window {
    __touchInputs: Array<{ type: string; trusted: boolean; primary: boolean }>;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__touchInputs = [];
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.target instanceof HTMLCanvasElement)
          window.__touchInputs.push({
            type: event.pointerType,
            trusted: event.isTrusted,
            primary: event.isPrimary,
          });
      },
      { capture: true },
    );
  });
  await page.goto("/");
  for (const id of ["B", "A"])
    await page
      .getByTestId(`scene-${id}`)
      .getByRole("button", { name: "暂停", exact: true })
      .click();
});

async function point(canvas: Locator, x = 0.5, y = 0.45): Promise<{ x: number; y: number }> {
  await canvas.scrollIntoViewIfNeeded();
  const bounds = (await canvas.boundingBox())!;
  return { x: bounds.x + bounds.width * x, y: bounds.y + bounds.height * y };
}

async function tap(page: Page, canvas: Locator, x = 0.5, y = 0.45): Promise<void> {
  const target = await point(canvas, x, y);
  await page.touchscreen.tap(target.x, target.y);
}

test("trusted touch taps pick CSS-scaled canvases independently and interactive labels keep their input", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const a = page.getByTestId("scene-A"),
    b = page.getByTestId("scene-B");
  const canvas = a.locator("canvas");
  await canvas.evaluate((element) => {
    element.style.transformOrigin = "top left";
    element.style.transform = "scale(0.75)";
  });
  await tap(page, canvas);
  await expect(a.getByTestId("selected")).toHaveText("立方体");
  await expect(a.getByTestId("hovered")).toHaveText("—");
  await expect(b.getByTestId("selected")).toHaveText("—");
  await tap(page, b.locator("canvas"));
  await expect(b.getByTestId("selected")).toHaveText("二十面体");
  const count = await a.getAttribute("data-pick-count");
  await a.getByTestId("label-button").tap();
  await expect(a.getByTestId("label-button")).toHaveAttribute("aria-pressed", "true");
  await expect(b.getByTestId("label-button")).toHaveAttribute("aria-pressed", "false");
  await expect(a).toHaveAttribute("data-pick-count", count!);
  await tap(page, canvas, 0.05, 0.1);
  await expect(a.getByTestId("selected")).toHaveText("—");
  await expect(a).toHaveAttribute("data-pick-count", String(Number(count) + 1));
  await expect(b.getByTestId("selected")).toHaveText("二十面体");
  const events = await page.evaluate(() => window.__touchInputs);
  expect(events.length).toBeGreaterThanOrEqual(3);
  expect(events.every((event) => event.type === "touch" && event.trusted)).toBe(true);
  expect(
    await canvas.evaluate((element) => (element as HTMLCanvasElement).width / element.clientWidth),
  ).toBe(2);
  expect(errors).toEqual([]);
});

test("native two-finger orbit input cancels picking and a later touch tap remains usable", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const a = page.getByTestId("scene-A");
  const canvas = a.locator("canvas");
  await tap(page, canvas);
  await expect(a.getByTestId("selected")).toHaveText("立方体");
  const count = await a.getAttribute("data-pick-count");
  const label = a.getByTestId("object-label");
  const pose = () =>
    label.evaluate((element) => {
      const bounds = element.getBoundingClientRect(),
        viewport = element.closest(".viewport")!.getBoundingClientRect();
      return { x: bounds.left - viewport.left, y: bounds.top - viewport.top };
    });
  const before = await pose();
  const origin = await point(canvas);
  const session = await page.context().newCDPSession(page);
  const contact = (id: number, x: number, y: number) => ({
    id,
    x,
    y,
    radiusX: 2,
    radiusY: 2,
    force: 1,
  });
  let active = false;
  try {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [contact(1, origin.x - 30, origin.y)],
    });
    active = true;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [contact(1, origin.x - 30, origin.y), contact(2, origin.x + 30, origin.y)],
    });
    for (let step = 1; step <= 3; step++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          contact(1, origin.x - 30 + step * 12, origin.y + step * 5),
          contact(2, origin.x + 30 + step * 12, origin.y + step * 5),
        ],
      });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    active = false;
    // A fresh cancelled press must also clear picking and OrbitControls state.
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [contact(1, origin.x, origin.y)],
    });
    active = true;
    await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    active = false;
  } finally {
    try {
      if (active)
        await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    } finally {
      await session.detach();
    }
  }
  await a.getByRole("button", { name: "绘制一帧", exact: true }).click();
  const after = await pose();
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(2);
  await expect(a).toHaveAttribute("data-pick-count", count!);
  await expect(a.getByTestId("selected")).toHaveText("立方体");
  await tap(page, canvas, 0.05, 0.1);
  await expect(a.getByTestId("selected")).toHaveText("—");
  await expect(a).toHaveAttribute("data-pick-count", String(Number(count) + 1));
  await expect(page.getByTestId("scene-B").getByTestId("selected")).toHaveText("—");
  const events = await page.evaluate(() => window.__touchInputs);
  expect(events.some((event) => !event.primary)).toBe(true);
  expect(events.every((event) => event.type === "touch" && event.trusted)).toBe(true);
  expect(errors).toEqual([]);
});
