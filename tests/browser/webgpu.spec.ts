import { expect, test } from "@playwright/test";
import type { PerspectiveSceneApp } from "../../packages/three/src/index.ts";

// Dawn's software adapter exercises actual WebGPU commands, independently of WebGL fallback.
test.use({
  launchOptions: {
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--enable-unsafe-webgpu",
      "--use-webgpu-adapter=swiftshader",
    ],
  },
});

for (const backend of ["webgl", "auto", "webgpu"] as const) {
  test(`${backend}: pixels, independent hosts, controls, labels, animated GLB and reconstruction`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`/?demo=webgpu&backend=${backend}`);
    if (backend === "webgpu") {
      const available = await page.evaluate(async () => {
        const gpu = Reflect.get(navigator, "gpu") as
          | { requestAdapter(options: { featureLevel: string }): Promise<object | null> }
          | undefined;
        return !!(await gpu?.requestAdapter({ featureLevel: "compatibility" }));
      });
      if (process.env.ADUI_REQUIRE_WEBGPU === "1")
        expect(available, "A real WebGPU adapter is required").toBe(true);
      test.skip(
        !available,
        "Chromium/Dawn has no WebGPU adapter in this environment; fallback coverage is separate",
      );
    }
    await expect(page.getByRole("status")).toHaveText("ready");
    const first = page.getByTestId("gpu-a"),
      second = page.getByTestId("gpu-b");
    await expect(first).toHaveAttribute("data-host-class", "true");
    const actual = await first.locator("[data-backend]").textContent();
    if (backend === "auto") expect(["webgpu", "webgl2"]).toContain(actual);
    else expect(actual).toBe(backend === "webgpu" ? "webgpu" : "webgl2");
    await expect(second.locator("[data-backend]")).toHaveText(actual!);
    expect(
      await first.evaluate(
        (panel) => (Reflect.get(panel, "gpuApp") as PerspectiveSceneApp).rendererType,
      ),
    ).toBe(backend === "webgl" ? "webgl" : "webgpu");
    await expect
      .poll(async () => Number(await first.getAttribute("data-frames")))
      .toBeGreaterThan(2);
    await expect(first.locator("[data-metrics]")).toHaveText("360×260 / 2");
    await expect(first.locator(".gpu-labels")).toContainText("立方体");
    await expect(first.locator(".gpu-labels span")).toBeVisible();
    const png = await first.locator("canvas").screenshot({ scale: "css" });
    const pixel = await page.evaluate(
      async (bytes) => {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: "image/png" }),
        );
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        return [
          ...context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1)
            .data,
        ];
      },
      [...png],
    );
    expect(pixel[0]).toBeGreaterThan(200);
    expect(pixel[1]).toBeLessThan(120);
    expect(pixel[2]).toBeLessThan(50);
    await first.getByRole("button", { name: "暂停", exact: true }).click();
    const paused = await first.getAttribute("data-frames"),
      other = Number(await second.getAttribute("data-frames"));
    await expect
      .poll(async () => Number(await second.getAttribute("data-frames")))
      .toBeGreaterThan(other + 2);
    expect(await first.getAttribute("data-frames")).toBe(paused);
    const canvas = first.locator("canvas"),
      rect = (await canvas.boundingBox())!;
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await expect(first.locator("[data-picked]")).toHaveText("已选择");
    const before = await first.evaluate((panel) =>
      (Reflect.get(panel, "gpuApp") as PerspectiveSceneApp).camera.position.toArray(),
    );
    await page.mouse.move(rect.x + 100, rect.y + 100);
    await page.mouse.down();
    await page.mouse.move(rect.x + 170, rect.y + 120, { steps: 5 });
    await page.mouse.up();
    const after = await first.evaluate((panel) =>
      (Reflect.get(panel, "gpuApp") as PerspectiveSceneApp).camera.position.toArray(),
    );
    expect(after).not.toEqual(before);
    await first.getByRole("button", { name: "收窄" }).click();
    await expect
      .poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width))
      .toBe(440);
    await first.getByRole("button", { name: "运行", exact: true }).click();
    await first.getByRole("button", { name: "零高度" }).click();
    await expect
      .poll(() =>
        first.evaluate(
          (panel) => (Reflect.get(panel, "gpuApp") as PerspectiveSceneApp).size.height,
        ),
      )
      .toBe(0);
    await first.getByRole("button", { name: "零高度" }).click();
    await first.getByRole("button", { name: "模型动画" }).click();
    await expect(first.locator("[data-model]")).toHaveText("ready");
    await expect
      .poll(async () => Number(await first.getAttribute("data-motion")))
      .toBeGreaterThan(0.01);
    for (let i = 0; i < 2; i++) {
      await first.getByRole("button", { name: "销毁", exact: true }).click();
      await expect(first.locator("canvas")).toHaveCount(0);
      await expect(first.locator(".gpu-labels span")).toHaveCount(0);
      await first.getByRole("button", { name: "重建", exact: true }).click();
      await expect(first).toHaveAttribute("data-state", "running");
      await expect(first.locator("canvas")).toHaveCount(1);
    }
    // Projection uses the actual backend even before a first native render.
    expect(
      await first.evaluate(
        (panel) => (Reflect.get(panel, "gpuApp") as PerspectiveSceneApp).camera.coordinateSystem,
      ),
    ).toBe(actual === "webgpu" ? 2001 : 2000);
    const borrowed = await first.evaluate(async (panel) => {
      const app = Reflect.get(panel, "gpuApp") as PerspectiveSceneApp;
      const box: object = Reflect.get(panel, "gpuBox");
      const geometry = Reflect.get(box, "geometry") as {
        clone(): { dispose(): void; addEventListener(type: "dispose", callback: () => void): void };
      };
      const external = geometry.clone();
      let disposed = false;
      external.addEventListener("dispose", () => {
        disposed = true;
      });
      Reflect.set(box, "geometry", external);
      await app.destroy();
      const retained = !disposed;
      external.dispose();
      return retained;
    });
    expect(borrowed).toBe(true);
    await expect(second).toHaveAttribute("data-state", "running");
    expect(errors).toEqual([]);
  });
}
