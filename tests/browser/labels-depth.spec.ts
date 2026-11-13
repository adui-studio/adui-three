import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

interface DepthSample {
  visible: boolean;
  red: number;
  error: number;
  mode: boolean;
}

for (const { orthographic, near, reversed } of [
  { orthographic: false, near: 1, reversed: true },
  { orthographic: true, near: 1, reversed: true },
  { orthographic: true, near: 0, reversed: false },
  { orthographic: true, near: 0, reversed: true },
]) {
  test(`${orthographic ? "orthographic" : "perspective"} labels match native near ${near} clipping with reversed depth ${reversed}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [prefix, directory] of [
      ["depth-native", "packages/three/node_modules/three"],
      ["depth-library", "packages/three/dist"],
    ] as const) {
      const root = resolve(directory);
      await page.route(`**/${prefix}/**`, async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        const target = resolve(root, decodeURIComponent(pathname.slice(prefix.length + 2)));
        const child = relative(root, target);
        if (child.startsWith("..") || isAbsolute(child)) throw new Error("Fixture escaped root");
        await route.fulfill({ contentType: "text/javascript", body: await readFile(target) });
      });
    }
    await page.route("**/labels-depth.html", async (route) => {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><head><meta charset="utf-8"><style>
        body{font:16px sans-serif;background:#101525;color:white;margin:24px}
        #stage{position:relative;width:640px;height:360px}#overlay{position:absolute;inset:0}
        #label{background:#fff;color:#111;padding:4px 8px}canvas{display:block}
        pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:640px}
        </style></head><body><h1>Native reversed-depth clipping</h1>
        <div id="stage"><div id="overlay"></div></div><pre id="result"></pre>
        <script type="importmap">{"imports":{"three":"/depth-native/build/three.module.js"}}</script>
        <script type="module">
          import { ThreeApp, OrthographicThreeApp } from "/depth-library/index.mjs";
          import { attachDOMLabels } from "/depth-library/labels.mjs";
          import { BoxGeometry, PlaneGeometry, Color, Mesh, MeshBasicMaterial } from "three";
          try {
            const orthographic = ${JSON.stringify(orthographic)};
            const Host = orthographic ? OrthographicThreeApp : ThreeApp;
            const app = new Host(document.querySelector("#stage"), {
              renderer: { reversedDepthBuffer: ${JSON.stringify(reversed)} }, maxPixelRatio: 1,
              camera: { near: ${near}, far: 10, position: [0, 0, 5] }
            });
            if (${JSON.stringify(reversed)} && !app.renderer.capabilities.reversedDepthBuffer) {
              document.querySelector("#result").textContent = JSON.stringify({ supported: false });
            } else {
              app.scene.background = new Color(0x121820);
              const geometry = app.resources.track(${near === 0 ? "new PlaneGeometry(0.25, 0.25)" : "new BoxGeometry(0.25, 0.25, 0.25)"});
              const material = app.resources.track(new MeshBasicMaterial({ color: 0xff3020 }));
              const object = new Mesh(geometry, material);
              app.scene.add(object);
              const layer = attachDOMLabels(app, document.querySelector("#overlay"));
              const element = document.createElement("span");
              element.id = "label"; element.textContent = "clipped with geometry";
              layer.add({ object, element, anchor: [0.5, 0.5], offset: [0, 0.5, 0] });
              const samples = [];
              // At near=0, test the camera plane itself and a point strictly behind it.
              for (const z of ${JSON.stringify(near === 0 ? [0, 5, 5.01, -6, 0] : [0, -6, 4.5, 6, 0])}) {
                object.position.z = z;
                app.render();
                const gl = app.renderer.getContext();
                const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight,
                  gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                let red = 0;
                for (let i = 0; i < pixels.length; i += 4)
                  if (pixels[i] > 200 && pixels[i + 1] < 100 && pixels[i + 2] < 100) red++;
                samples.push({ visible: !element.parentElement.hidden, red,
                  error: gl.getError(), mode: app.camera.reversedDepth });
              }
              document.querySelector("#result").textContent = JSON.stringify({ supported: true, samples });
              window.addEventListener("pagehide", () => app.dispose(), { once: true });
            }
            document.body.dataset.state = "complete";
          } catch (error) {
            document.querySelector("#result").textContent = error.stack || String(error);
            document.body.dataset.state = "error";
          }
        </script></body></html>`,
      });
    });
    await page.goto("/labels-depth.html");
    await expect(page.locator("body")).toHaveAttribute("data-state", /complete|error/);
    const text = (await page.locator("#result").textContent())!;
    expect(await page.locator("body").getAttribute("data-state"), text).toBe("complete");
    const result = JSON.parse(text) as { supported: boolean; samples?: DepthSample[] };
    test.skip(!result.supported, "Native EXT_clip_control is unavailable; no mode is simulated.");
    const samples = result.samples!;
    expect(samples.map((sample) => sample.visible)).toEqual([true, near === 0, false, false, true]);
    expect(samples[0]!.red).toBeGreaterThan(30);
    expect(samples[4]!.red).toBe(samples[0]!.red);
    if (near === 0) expect(samples[1]!.red).toBeGreaterThan(30);
    for (const sample of samples.slice(near === 0 ? 2 : 1, 4)) expect(sample.red).toBe(0);
    expect(samples.every((sample) => sample.mode === reversed && sample.error === 0)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `test-results/labels-depth-${orthographic ? "orthographic" : "perspective"}-${near}-${reversed}.png`,
      scale: "css",
    });
  });
}
