import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

async function pause(page: Page): Promise<void> {
  for (const id of ["A", "B"])
    await page
      .getByTestId(`scene-${id}`)
      .getByRole("button", { name: "暂停", exact: true })
      .click();
}

async function greenAxis(panel: Locator) {
  return panel.evaluate((element) => {
    element.querySelector<HTMLButtonElement>('[data-action="render"]')!.click();
    const canvas = element.querySelector("canvas")!;
    const gl = canvas.getContext("webgl2")!;
    const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(
      0,
      0,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bytes,
    );
    let x = 0;
    let y = 0;
    let count = 0;
    for (let index = 0; index < bytes.length; index += 4) {
      if (bytes[index]! < 80 && bytes[index + 1]! > 180 && bytes[index + 2]! < 80) {
        x += (index / 4) % gl.drawingBufferWidth;
        y += Math.floor(index / 4 / gl.drawingBufferWidth);
        count++;
      }
    }
    if (!count) throw new Error("No real green Y-axis pixels were drawn");
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (x / count / gl.drawingBufferWidth) * rect.width,
      y: rect.bottom - (y / count / gl.drawingBufferHeight) * rect.height,
    };
  });
}

test("real gizmo dragging moves the object while orbit and another host remain stable, then releases input", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await a.getByRole("button", { name: "变换手柄", exact: true }).click();
  await expect(a).toHaveAttribute("data-transform-mode", "translate");
  const before = await a.getAttribute("data-transform-position");
  const camera = await a.getAttribute("data-camera-position");
  const other = await b.getAttribute("data-camera-position");
  const frames = await a.getByTestId("frames").textContent();
  const point = await greenAxis(a);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await expect(a).toHaveAttribute("data-transform-dragging", "true");
  await expect(a).toHaveAttribute("data-orbit-enabled", "false");
  await page.mouse.move(point.x, point.y - 35, { steps: 8 });
  await expect(a).not.toHaveAttribute("data-transform-position", before!);
  await expect(a).toHaveAttribute("data-camera-position", camera!);
  await page.mouse.up();
  await expect(a).toHaveAttribute("data-transform-dragging", "false");
  await expect(a).toHaveAttribute("data-orbit-enabled", "true");
  await expect(b).toHaveAttribute("data-camera-position", other!);
  await expect(a.getByTestId("frames")).toHaveText(frames!);
  await a.getByRole("button", { name: "切换变换", exact: true }).click();
  await expect(a).toHaveAttribute("data-transform-mode", "rotate");
  await a.getByRole("button", { name: "切换变换", exact: true }).click();
  await expect(a).toHaveAttribute("data-transform-mode", "scale");
  await page.screenshot({
    path: "test-results/transform-controls.png",
    fullPage: true,
    scale: "css",
  });
  await a.getByRole("button", { name: "释放手柄", exact: true }).click();
  await expect(a).toHaveAttribute("data-transform-mode", "idle");
  const box = await a.locator("canvas").boundingBox();
  await page.mouse.move(box!.x + 40, box!.y + 40);
  await page.mouse.down();
  await page.mouse.move(box!.x + 100, box!.y + 65, { steps: 5 });
  await page.mouse.up();
  await expect(a).not.toHaveAttribute("data-camera-position", camera!);
  expect(errors).toEqual([]);
});

test("model replacement/removal and repeated helper disposal keep the other instance independent", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const a = page.getByTestId("scene-A");
  const b = page.getByTestId("scene-B");
  await a.getByRole("button", { name: "变换手柄", exact: true }).click();
  await b.getByRole("button", { name: "变换手柄", exact: true }).click();
  await a.getByRole("button", { name: "加载 GLB", exact: true }).click();
  await expect(a).toHaveAttribute("data-model-state", "loaded");
  await expect(a).toHaveAttribute("data-transform-position", "0.000,0.000,0.000");
  await a.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect(a).toHaveAttribute("data-transform-position", "");
  for (let index = 0; index < 3; index++) {
    await a.getByRole("button", { name: "释放手柄", exact: true }).click();
    await a.getByRole("button", { name: "变换手柄", exact: true }).click();
    await expect(a).toHaveAttribute("data-transform-mode", "translate");
  }
  await a.getByRole("button", { name: "销毁", exact: true }).click();
  await expect(a.locator("canvas")).toHaveCount(0);
  await expect(b).toHaveAttribute("data-transform-mode", "translate");
  await a.getByRole("button", { name: "重建 ↻", exact: true }).click();
  await expect(a).toHaveAttribute("data-transform-mode", "idle");
  await expect(a.locator("canvas")).toHaveCount(1);
  await a.getByRole("button", { name: "变换手柄", exact: true }).click();
  expect(errors).toEqual([]);
});

test("native gizmo buffers and shader programs return to baseline after three complete releases", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const values = new WeakMap<
      WebGL2RenderingContext,
      { buffers: Set<WebGLBuffer>; programs: Set<WebGLProgram> }
    >();
    function stats(gl: WebGL2RenderingContext) {
      let value = values.get(gl);
      if (!value) {
        value = { buffers: new Set(), programs: new Set() };
        values.set(gl, value);
      }
      return value;
    }
    const proto = WebGL2RenderingContext.prototype;
    const createBuffer = Reflect.get(proto, "createBuffer") as typeof proto.createBuffer;
    const deleteBuffer = Reflect.get(proto, "deleteBuffer") as typeof proto.deleteBuffer;
    const createProgram = Reflect.get(proto, "createProgram") as typeof proto.createProgram;
    const deleteProgram = Reflect.get(proto, "deleteProgram") as typeof proto.deleteProgram;
    proto.createBuffer = function () {
      const result = createBuffer.call(this);
      if (result) stats(this).buffers.add(result);
      return result;
    };
    proto.deleteBuffer = function (value) {
      if (value) stats(this).buffers.delete(value);
      deleteBuffer.call(this, value);
    };
    proto.createProgram = function () {
      const result = createProgram.call(this);
      if (result) stats(this).programs.add(result);
      return result;
    };
    proto.deleteProgram = function (value) {
      if (value) stats(this).programs.delete(value);
      deleteProgram.call(this, value);
    };
    Object.assign(window, {
      __transformGPU: (canvas: HTMLCanvasElement) => {
        const value = stats(canvas.getContext("webgl2")!);
        return { buffers: value.buffers.size, programs: value.programs.size };
      },
    });
  });
  await page.goto("/");
  await pause(page);
  const a = page.getByTestId("scene-A");
  const counts = () =>
    a.locator("canvas").evaluate((canvas) => {
      const probe = window as unknown as {
        __transformGPU(canvas: HTMLCanvasElement): { buffers: number; programs: number };
      };
      return probe.__transformGPU(canvas as HTMLCanvasElement);
    });
  const baseline = await counts();
  for (let index = 0; index < 3; index++) {
    await a.getByRole("button", { name: "变换手柄", exact: true }).click();
    const active = await counts();
    expect(active.buffers).toBeGreaterThan(baseline.buffers);
    expect(active.programs).toBeGreaterThan(baseline.programs);
    await a.getByRole("button", { name: "释放手柄", exact: true }).click();
    expect(await counts()).toEqual(baseline);
  }
});
