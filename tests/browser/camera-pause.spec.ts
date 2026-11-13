import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

type ProbeWindow = Window & { __cameraDraws: Record<string, number> };
async function pixels(panel: Locator) {
  return panel.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const gl = element.querySelector("canvas")!.getContext("webgl2")!;
    const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
    let hash = 2166136261,
      red = 0;
    for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i]!, 16777619);
    for (let i = 0; i < data.length; i += 4)
      if (data[i]! > 180 && data[i + 1]! < 130 && data[i + 2]! < 130) red++;
    return { hash, red, error: gl.getError() };
  });
}

for (const kind of ["orthographic", "perspective"]) {
  for (const view of [false, true]) {
    test(`${kind} ${view ? "bookmark" : "framing"} pauses independently while native WebGL drawing continues`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        const probe = window as unknown as ProbeWindow;
        probe.__cameraDraws = {};
        // oxlint-disable-next-line typescript/unbound-method -- draw.call below restores the actual native context.
        const draw = WebGL2RenderingContext.prototype.drawElements;
        WebGL2RenderingContext.prototype.drawElements = function (mode, count, type, offset) {
          const key = (this.canvas as HTMLCanvasElement)
            .closest("[data-testid]")
            ?.getAttribute("data-testid");
          if (key) probe.__cameraDraws[key] = (probe.__cameraDraws[key] ?? 0) + 1;
          return draw.call(this, mode, count, type, offset);
        };
      });
      await page.goto("/?demo=orthographic");
      const panel = page.getByTestId(kind),
        peer = page.getByTestId(kind === "orthographic" ? "perspective" : "orthographic");
      await panel.getByRole("button", { name: "保存视角", exact: true }).click();
      const original = await pixels(panel),
        other = await pixels(peer);
      await panel.getByRole("button", { name: "放大视图", exact: true }).click();
      await peer.getByRole("button", { name: "运行场景", exact: true }).click();
      await panel.evaluate((element, view) => {
        element
          .querySelector<HTMLButtonElement>(
            view ? '[data-action="smooth-view"]' : '[data-action="smooth"]',
          )!
          .click();
        element.querySelector<HTMLButtonElement>('[data-action="pause-camera"]')!.click();
      }, view);
      const state = view ? "projection-view-motion" : "projection-motion",
        progress = view ? "projection-view-progress" : "projection-progress";
      await expect(panel.getByTestId(state)).toHaveText("paused");
      await expect(panel.getByTestId("projection-state")).toHaveText("running");
      // Transition setup may expand clipping before pause; compare against that committed starting view.
      const before = await pixels(panel);
      const count = await page.evaluate(
        (kind) => (window as unknown as ProbeWindow).__cameraDraws[kind] ?? 0,
        kind,
      );
      await expect
        .poll(() =>
          page.evaluate(
            (kind) => (window as unknown as ProbeWindow).__cameraDraws[kind] ?? 0,
            kind,
          ),
        )
        .toBeGreaterThan(count + 4);
      await expect(panel.getByTestId(progress)).toHaveText("0.000");
      expect(await pixels(panel)).toEqual(before);
      expect(await pixels(peer)).toEqual(other);
      await panel.getByRole("button", { name: "继续相机", exact: true }).click();
      await expect(panel.getByTestId(state)).toHaveText("completed");
      await panel.getByRole("button", { name: "暂停场景", exact: true }).click();
      const final = await pixels(panel);
      expect(final.error).toBe(0);
      expect(final.red).toBeGreaterThan(10);
      if (view) expect(final).toEqual(original);
      await panel.evaluate((element, view) => {
        element
          .querySelector<HTMLButtonElement>(
            view ? '[data-action="smooth-view"]' : '[data-action="smooth"]',
          )!
          .click();
        element.querySelector<HTMLButtonElement>('[data-action="pause-camera"]')!.click();
        element
          .querySelector("canvas")!
          .dispatchEvent(new WheelEvent("wheel", { deltaY: 1, bubbles: true, cancelable: true }));
        element.querySelector<HTMLButtonElement>('[data-action="pause-host"]')!.click();
      }, view);
      await expect(panel.getByTestId(state)).toHaveText("cancelled");
      await expect(panel.getByTestId("projection-error")).toBeEmpty();
      expect(errors).toEqual([]);
    });
  }
}
