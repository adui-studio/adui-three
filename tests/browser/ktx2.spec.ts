import { expect, test } from "@playwright/test";
import { observeKTX2 } from "./ktx2-probe.ts";

test("KTX2 GLTF and GLB transcode, upload and recover from missing/failed transcoders without implicit requests", async ({
  page,
}) => {
  await observeKTX2(page);
  const errors: string[] = [];
  const urls: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("basis_transcoder")) urls.push(request.url());
  });
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  await panel.getByRole("button", { name: "加载 GLB", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  expect(urls).toEqual([]);
  await panel.getByRole("button", { name: "缺少转码器", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "error");
  await expect(panel.locator(".model-feedback")).toContainText("setKTX2Loader");
  await page.route("**/*basis_transcoder*.js*", (route) =>
    route.fulfill({ status: 404, body: "transcoder unavailable" }),
  );
  await panel.getByRole("button", { name: "加载 KTX2", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "error");
  expect(await page.evaluate(() => window.__ktx.created)).toBe(0);
  await page.unroute("**/*basis_transcoder*.js*");
  await panel.getByRole("button", { name: "加载 KTX2", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await expect
    .poll(() => page.evaluate(() => window.__ktx))
    .toMatchObject({ created: 1, terminated: 1, revoked: 1 });
  await expect.poll(() => page.evaluate(() => window.__ktx.compressed)).toBeGreaterThan(0);
  await panel.getByRole("button", { name: "KTX2 GLB", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await expect
    .poll(() => page.evaluate(() => window.__ktx))
    .toMatchObject({ created: 2, terminated: 2, revoked: 2 });
  expect(urls.some((url) => url.includes(".wasm"))).toBe(true);
  expect(urls.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  await expect(panel.getByTestId("object-label").last()).toBeVisible();
  await page.screenshot({ path: "test-results/ktx2-playground.png", fullPage: true, scale: "css" });
  const deleted = await page.evaluate(() => window.__ktx.deleted);
  await panel.getByRole("button", { name: "移除模型", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__ktx.deleted)).toBeGreaterThan(deleted);
  expect(errors).toEqual([]);
});

test("equal external KTX2 URLs coalesce transport while cancellation and textures remain task-owned", async ({
  page,
}) => {
  await observeKTX2(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/models/checker.ktx2", async (route) => {
    requests++;
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/");
    const a = page.getByTestId("scene-A");
    const b = page.getByTestId("scene-B");
    await a.getByRole("button", { name: "加载 KTX2", exact: true }).click();
    await b.getByRole("button", { name: "加载 KTX2", exact: true }).click();
    await expect(b).toHaveAttribute("data-model-state", "loading");
    await a.getByRole("button", { name: "取消加载", exact: true }).click();
    await expect(a).toHaveAttribute("data-model-state", "cancelled");
    expect(await page.evaluate(() => window.__ktx.terminated)).toBe(0);
    release();
    await expect(b).toHaveAttribute("data-model-state", "loaded");
    // Two real transcodes prove that the global ArrayBuffer task cache did not share a Texture.
    await expect
      .poll(() => page.evaluate(() => window.__ktx))
      .toMatchObject({ created: 2, terminated: 2, revoked: 2 });
    await expect.poll(() => page.evaluate(() => window.__ktx.compressed)).toBeGreaterThan(0);
    expect(requests).toBe(1);
    await expect(a).toHaveAttribute("data-model-state", "cancelled");
    const deleted = await page.evaluate(() => window.__ktx.deleted);
    await b.getByRole("button", { name: "移除模型", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__ktx.deleted)).toBeGreaterThan(deleted);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});

test("host disposal during Basis initialization consumes late textures, workers and Blob URLs", async ({
  page,
}) => {
  await observeKTX2(page);
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
  await page.route("**/*basis_transcoder*.js*", async (route) => {
    const response = await route.fetch();
    reached();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/");
    await page.getByTestId("scene-B").getByRole("button", { name: "暂停", exact: true }).click();
    const panel = page.getByTestId("scene-A");
    await panel.getByRole("button", { name: "KTX2 GLB", exact: true }).click();
    await requested;
    await panel.getByRole("button", { name: "销毁", exact: true }).click();
    expect(await page.evaluate(() => window.__ktx.terminated)).toBe(0);
    release();
    await expect
      .poll(() => page.evaluate(() => window.__ktx))
      .toMatchObject({ created: 1, terminated: 1, revoked: 1 });
    await expect(panel).toHaveAttribute("data-state", "disposed");
    await expect(panel).toHaveAttribute("data-model-state", "idle");
    await expect(panel.locator("canvas, .label-overlay > *")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    release();
  }
});

test("Basis uses a real RGBA upload when the renderer advertises no compressed texture extensions", async ({
  page,
}) => {
  await observeKTX2(page, true);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const panel = page.getByTestId("scene-A");
  await panel.getByRole("button", { name: "KTX2 GLB", exact: true }).click();
  await expect(panel).toHaveAttribute("data-model-state", "loaded");
  await expect.poll(() => page.evaluate(() => window.__ktx.rgba)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__ktx)).toMatchObject({
    compressed: 0,
    created: 1,
    terminated: 1,
    revoked: 1,
  });
  expect(errors).toEqual([]);
});
