import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

async function axis(panel: Locator) {
  await panel.locator("canvas").scrollIntoViewIfNeeded();
  return panel.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!,
      gl = canvas.getContext("webgl2")!;
    const width = gl.drawingBufferWidth,
      height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let x = 0,
      y = 0,
      count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i]! < 80 && pixels[i + 1]! > 180 && pixels[i + 2]! < 80) {
        x += (i / 4) % width;
        y += Math.floor(i / 4 / width);
        count++;
      }
    }
    if (!count) throw new Error("Missing native green transform axis pixels");
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (x / count / width) * rect.width,
      y: rect.bottom - (y / count / height) * rect.height,
    };
  });
}

test("touch gizmo drag and cancellation release the orbit lease while a stopped peer stays independent", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A"),
    b = page.getByTestId("scene-B");
  for (const panel of [b, a])
    await panel.getByRole("button", { name: "暂停", exact: true }).click();
  await a.getByRole("button", { name: "变换手柄", exact: true }).click();
  const frames = await a.getByTestId("frames").textContent();
  const camera = await a.getAttribute("data-camera-position");
  const peer = await b.getAttribute("data-camera-position");
  const session = await page.context().newCDPSession(page);
  let active = false;
  const contact = (x: number, y: number) => [{ id: 1, x, y, radiusX: 2, radiusY: 2, force: 1 }];
  try {
    for (const ending of ["touchEnd", "touchCancel"] as const) {
      const position = await a.getAttribute("data-transform-position");
      const point = await axis(a);
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: contact(point.x, point.y),
      });
      active = true;
      await expect(a).toHaveAttribute("data-transform-dragging", "true");
      await expect(a).toHaveAttribute("data-orbit-enabled", "false");
      for (let step = 1; step <= 4; step++)
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: contact(point.x, point.y - step * 7),
        });
      await expect(a).not.toHaveAttribute("data-transform-position", position!);
      await expect(a).toHaveAttribute("data-camera-position", camera!);
      await session.send("Input.dispatchTouchEvent", { type: ending, touchPoints: [] });
      active = false;
      await expect(a).toHaveAttribute("data-transform-dragging", "false");
      await expect(a).toHaveAttribute("data-orbit-enabled", "true");
      await expect(b).toHaveAttribute("data-camera-position", peer!);
    }
    await a.getByRole("button", { name: "释放手柄", exact: true }).click();
    await a.locator("canvas").scrollIntoViewIfNeeded();
    const bounds = (await a.locator("canvas").boundingBox())!;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: contact(bounds.x + 35, bounds.y + 35),
    });
    active = true;
    for (let step = 1; step <= 4; step++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: contact(bounds.x + 35 + step * 12, bounds.y + 35 + step * 5),
      });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    active = false;
    await expect(a).not.toHaveAttribute("data-camera-position", camera!);
    await expect(b).toHaveAttribute("data-camera-position", peer!);
    await expect(a.getByTestId("frames")).toHaveText(frames!);
    expect(
      await a
        .locator("canvas")
        .evaluate((canvas) => (canvas as HTMLCanvasElement).getContext("webgl2")!.getError()),
    ).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    try {
      if (active)
        await session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    } finally {
      await session.detach();
    }
  }
});
