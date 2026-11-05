import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __compression: { created: number; terminated: number; closedImages: number };
  }
}

async function observeDecoders(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__compression = { created: 0, terminated: 0, closedImages: 0 };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        window.__compression.created++;
      }
      terminate(): void {
        window.__compression.terminated++;
        super.terminate();
      }
    };
    const close = Object.getOwnPropertyDescriptor(ImageBitmap.prototype, "close")!.value as (
      this: ImageBitmap,
    ) => void;
    ImageBitmap.prototype.close = function (): void {
      window.__compression.closedImages++;
      close.call(this);
    };
  });
}

test("ordinary models fetch no Draco binaries; real Draco and Meshopt decode and recover from missing/broken decoders", async ({
  page,
}) => {
  await observeDecoders(page);
  const errors: string[] = [];
  const decoderURLs: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (/draco_(wasm_wrapper|decoder).*\.(js|wasm)/.test(request.url()))
      decoderURLs.push(request.url());
  });
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  await panel.getByRole("button", { name: "加载 GLB", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  expect(decoderURLs).toEqual([]);
  expect(await page.evaluate(() => window.__compression.created)).toBe(0);
  await panel.getByRole("button", { name: "缺少解码器", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "error");
  await expect(panel.locator(".model-feedback")).toContainText("DRACOLoader");
  await page.route("**/*draco_wasm_wrapper*.js*", (route) =>
    route.fulfill({ status: 404, body: "decoder unavailable" }),
  );
  await panel.getByRole("button", { name: "加载 Draco", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "error");
  expect(await page.evaluate(() => window.__compression.created)).toBe(0);
  await page.unroute("**/*draco_wasm_wrapper*.js*");
  await panel.getByRole("button", { name: "加载 Draco", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await expect
    .poll(() => page.evaluate(() => window.__compression))
    .toMatchObject({ created: 1, terminated: 1 });
  expect(decoderURLs.some((url) => url.includes(".wasm"))).toBe(true);
  expect(decoderURLs.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  await panel.getByRole("button", { name: "加载 Meshopt", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await expect(panel.getByTestId("object-label").last()).toBeVisible();
  await expect(panel.getByTestId("draw-calls")).not.toHaveText("0");
  expect(await page.evaluate(() => window.__compression)).toMatchObject({
    created: 1,
    terminated: 1,
  });
  await page.screenshot({
    path: "test-results/compressed-playground.png",
    fullPage: true,
    scale: "css",
  });
  expect(errors).toEqual([]);
});

test("same-URL Draco tasks cancel independently and each native worker closes after completion", async ({
  page,
}) => {
  await observeDecoders(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/models/draco.glb", async (route) => {
    requests++;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/");
    const a = page.getByTestId("scene-A");
    const b = page.getByTestId("scene-B");
    await a.getByRole("button", { name: "加载 Draco", exact: true }).click();
    await b.getByRole("button", { name: "加载 Draco", exact: true }).click();
    await expect(a).toHaveAttribute("data-model-state", "loading");
    await expect(b).toHaveAttribute("data-model-state", "loading");
    await a.getByRole("button", { name: "取消加载", exact: true }).click();
    await expect(a).toHaveAttribute("data-model-state", "cancelled");
    expect(await page.evaluate(() => window.__compression.terminated)).toBe(0);
    release();
    await expect(b).toHaveAttribute("data-model-state", "loaded");
    await expect
      .poll(() => page.evaluate(() => window.__compression))
      .toEqual({ created: 2, terminated: 2, closedImages: 1 });
    expect(requests).toBe(1);
    await expect(a).toHaveAttribute("data-model-state", "cancelled");
    await b.getByRole("button", { name: "移除模型", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__compression.closedImages)).toBe(2);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});

test("host disposal during decoder initialization consumes late results and terminates the late worker", async ({
  page,
}) => {
  await observeDecoders(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    reached = resolve;
  });
  await page.route("**/*draco_wasm_wrapper*.js*", async (route) => {
    const response = await route.fetch();
    reached();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/");
    // This case only exercises A's late decoder; avoid an unrelated rendering loop while it finishes.
    await page.getByTestId("scene-B").getByRole("button", { name: "暂停", exact: true }).click();
    const panel = page.getByTestId("scene-A");
    await panel.getByRole("button", { name: "加载 Draco", exact: true }).click();
    await requested;
    await panel.getByRole("button", { name: "销毁", exact: true }).click();
    expect(await page.evaluate(() => window.__compression.terminated)).toBe(0);
    release();
    await expect
      .poll(() => page.evaluate(() => window.__compression))
      .toEqual({ created: 1, terminated: 1, closedImages: 1 });
    await expect(panel.locator("canvas")).toHaveCount(0);
    await expect(panel).toHaveAttribute("data-state", "disposed");
    await expect(panel.locator(".label-overlay > *")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});
