import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

test("runtime renderer options cannot borrow another host's canvas or WebGL context", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [prefix, directory] of [
    ["owner-native", "packages/three/node_modules/three"],
    ["owner-library", "packages/three/dist"],
  ] as const) {
    const root = resolve(directory);
    await page.route(`**/${prefix}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const target = resolve(root, decodeURIComponent(pathname.slice(prefix.length + 2)));
      const child = relative(root, target);
      if (child.startsWith("..") || isAbsolute(child)) throw new Error("Fixture path escaped root");
      await route.fulfill({ contentType: "text/javascript", body: await readFile(target) });
    });
  }
  await page.route("**/renderer-owner.html", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
      <div id="owner" style="width:400px;height:240px"></div><pre id="result"></pre>
      <script type="importmap">{"imports":{"three":"/owner-native/build/three.module.js"}}</script>
      <script type="module">
        import { ThreeApp, OrthographicThreeApp } from "/owner-library/index.mjs";
        import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";
        const owner = new ThreeApp(document.querySelector("#owner"), { maxPixelRatio: 1 });
        try {
          const geometry = owner.resources.track(new BoxGeometry());
          const material = owner.resources.track(new MeshBasicMaterial({ color: 0xff3020 }));
          owner.scene.add(new Mesh(geometry, material));
          const context = owner.renderer.getContext(), canvas = owner.renderer.domElement;
          function sample() {
            owner.render();
            const w = context.drawingBufferWidth, h = context.drawingBufferHeight;
            const pixels = new Uint8Array(w * h * 4);
            context.readPixels(0, 0, w, h, context.RGBA, context.UNSIGNED_BYTE, pixels);
            let hash = 2166136261, red = 0;
            for (let i = 0; i < pixels.length; i += 4) {
              for (let c = 0; c < 3; c++) hash = Math.imul(hash ^ pixels[i + c], 16777619);
              if (pixels[i] > 200 && pixels[i + 1] < 100 && pixels[i + 2] < 100) red++;
            }
            return { hash, red, error: context.getError(), lost: context.isContextLost() };
          }
          const baseline = sample(), rejected = [], independent = [];
          for (const Host of [ThreeApp, OrthographicThreeApp]) {
            for (const key of ["canvas", "context"]) {
              const stage = document.createElement("div");
              stage.style.cssText = "width:400px;height:240px";
              document.body.appendChild(stage);
              let failure, invalid;
              try { invalid = new Host(stage, { renderer: { antialias: false, [key]: key === "canvas" ? canvas : context } }); }
              catch (error) { failure = error; }
              // A regression must not leave the fixture's accepted host owned by nobody.
              if (invalid) invalid.dispose();
              rejected.push({ rejected: failure instanceof TypeError && /external canvas or context/.test(failure.message),
                canvases: stage.querySelectorAll("canvas").length, owner: sample() });
              stage.remove();
            }
            const stage = document.createElement("div");
            stage.style.cssText = "width:400px;height:240px";
            document.body.appendChild(stage);
            const app = new Host(stage, { renderer: { alpha: true, antialias: false, context: null, canvas: undefined }, maxPixelRatio: 1 });
            independent.push(app.renderer.getContext() !== context && app.renderer.domElement !== canvas && app.renderer.getContextAttributes().alpha);
            app.dispose();
            independent.push(sample().hash === baseline.hash && !context.isContextLost());
            stage.remove();
          }
          document.querySelector("#result").textContent = JSON.stringify({ baseline, rejected, independent, final: sample() });
          document.body.dataset.state = "complete";
        } catch (error) {
          document.querySelector("#result").textContent = error.stack || String(error);
          document.body.dataset.state = "error";
        } finally { owner.dispose(); }
      </script></body></html>`,
    });
  });
  await page.goto("/renderer-owner.html");
  await expect(page.locator("body")).toHaveAttribute("data-state", /complete|error/);
  const text = (await page.locator("#result").textContent())!;
  expect(await page.locator("body").getAttribute("data-state"), text).toBe("complete");
  const result = JSON.parse(text) as {
    baseline: { hash: number; red: number; error: number; lost: boolean };
    rejected: Array<{ rejected: boolean; canvases: number; owner: unknown }>;
    independent: boolean[];
    final: unknown;
  };
  expect(result.baseline.red).toBeGreaterThan(500);
  expect(result.baseline.error).toBe(0);
  expect(result.baseline.lost).toBe(false);
  expect(result.rejected).toHaveLength(4);
  for (const attempt of result.rejected) {
    expect(attempt.rejected).toBe(true);
    expect(attempt.canvases).toBe(0);
    expect(attempt.owner).toEqual(result.baseline);
  }
  expect(result.independent).toEqual([true, true, true, true]);
  expect(result.final).toEqual(result.baseline);
  expect(errors).toEqual([]);
});
