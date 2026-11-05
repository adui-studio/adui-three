import { expect, test } from "@playwright/test";

test("a native canvas buffer failure stops one host and a single draw retries both its buffer and bloom size", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "width")!;
    let fail = false;
    Object.defineProperty(HTMLCanvasElement.prototype, "width", {
      ...descriptor,
      set(value: number) {
        if (fail && this.closest('[data-testid="scene-A"]')) {
          fail = false;
          throw new Error("Injected drawing-buffer resize failure");
        }
        descriptor.set!.call(this, value);
      },
    });
    Object.assign(window, {
      __failNextBufferResize(): void {
        fail = true;
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await a.getByRole("button", { name: "泛光", exact: true }).click();
  await b.getByRole("button", { name: "暂停", exact: true }).click();
  const other = await b.getByTestId("size").textContent();
  await page.evaluate(() =>
    (window as unknown as { __failNextBufferResize(): void }).__failNextBufferResize(),
  );
  await a.getByRole("button", { name: "收窄容器", exact: true }).click();
  await expect(a).toHaveAttribute("data-state", "stopped");
  expect(errors).toEqual(["Injected drawing-buffer resize failure"]);
  const frames = await a.getByTestId("frames").textContent();
  const recovered = await a.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;
    return { width: gl.drawingBufferWidth, expected: canvas.clientWidth * 2, error: gl.getError() };
  });
  expect(recovered.width).toBe(recovered.expected);
  expect(recovered.error).toBe(0);
  await expect(a).toHaveAttribute("data-state", "stopped");
  await expect(a.getByTestId("frames")).toHaveText(frames!);
  await expect(a).toHaveAttribute("data-bloom-state", "enabled");
  await expect(b.getByTestId("size")).toHaveText(other!);
  await expect(a.getByTestId("object-label").first()).toBeVisible();
  await a.getByRole("button", { name: "运行", exact: true }).click();
  await expect(a.getByTestId("frames")).not.toHaveText(frames!);
  expect(errors).toHaveLength(1);
});

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
