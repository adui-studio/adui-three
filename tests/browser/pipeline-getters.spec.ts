import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

test("pipeline getter disposal prevents stale calls in both native hosts and keeps a peer canvas intact", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [prefix, directory] of [
    ["pipeline-native", "packages/three/node_modules/three"],
    ["pipeline-library", "packages/three/dist"],
  ] as const) {
    const root = resolve(directory);
    await page.route(`**/${prefix}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const path = resolve(root, decodeURIComponent(pathname.slice(prefix.length + 2)));
      const child = relative(root, path);
      if (child.startsWith("..") || isAbsolute(child)) throw new Error("Fixture path escaped root");
      await route.fulfill({ contentType: "text/javascript", body: await readFile(path) });
    });
  }
  await page.route("**/pipeline-getters.html", async (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body><pre id="result"></pre>
      <script type="importmap">{"imports":{"three":"/pipeline-native/build/three.module.js"}}</script>
      <script type="module">
        import { ThreeApp, OrthographicThreeApp } from "/pipeline-library/index.mjs";
        import { BoxGeometry, Mesh, MeshBasicMaterial } from "three";
        function create(Host) {
          const stage = document.createElement("div");
          stage.style.cssText = "width:320px;height:200px";
          document.body.appendChild(stage);
          const app = new Host(stage, { maxPixelRatio: 1 });
          const geometry = app.resources.track(new BoxGeometry());
          const material = app.resources.track(new MeshBasicMaterial({ color: 0x20ff30 }));
          app.scene.add(new Mesh(geometry, material));
          return { stage, app };
        }
        const peer = create(ThreeApp);
        function sample() {
          peer.app.render();
          const gl = peer.app.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
          const bytes = new Uint8Array(w * h * 4);
          gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
          let green = 0, hash = 2166136261;
          for (let i = 0; i < bytes.length; i += 4) {
            for (let c = 0; c < 3; c++) hash = Math.imul(hash ^ bytes[i + c], 16777619);
            if (bytes[i + 1] > 200 && bytes[i] < 130 && bytes[i + 2] < 150) green++;
          }
          return { green, hash, error: gl.getError(), lost: gl.isContextLost() };
        }
        try {
          const baseline = sample(), results = [];
          for (const Host of [ThreeApp, OrthographicThreeApp]) {
            for (const mode of ["initial-render", "initial-resize", "render", "resize"]) {
              const { app, stage } = create(Host);
              let renderCalls = 0, resizeCalls = 0, completions = 0, released = 0, receiver = true;
              let armed = mode.startsWith("initial-"), failure = "";
              app.resources.track({ dispose() { released++; } });
              app.render();
              app.onAfterRender(() => { completions++; });
              const pipeline = {
                get render() {
                  if (armed && (mode === "initial-render" || mode === "render")) app.dispose();
                  return function () { renderCalls++; receiver &&= this === pipeline; };
                },
                get resize() {
                  if (armed && (mode === "initial-resize" || mode === "resize")) app.dispose();
                  return function () { resizeCalls++; receiver &&= this === pipeline; };
                }
              };
              try {
                try { app.setRenderPipeline(pipeline); } catch (error) { failure = error.message; }
                if (!mode.startsWith("initial-")) {
                  armed = true;
                  if (mode === "render") app.render();
                  else { stage.style.width = "280px"; app.resize(); }
                }
                results.push({ mode, state: app.state, renderCalls, resizeCalls, completions, released, receiver,
                  failure, canvases: stage.querySelectorAll("canvas").length, peer: sample() });
              } finally { app.dispose(); stage.remove(); }
            }
          }
          document.querySelector("#result").textContent = JSON.stringify({ baseline, results });
        } finally { peer.app.dispose(); peer.stage.remove(); }
      </script></body></html>`,
    }),
  );
  await page.goto("/pipeline-getters.html");
  await expect(page.locator("#result")).not.toBeEmpty();
  const data = JSON.parse((await page.locator("#result").textContent())!) as {
    baseline: { green: number; hash: number; error: number; lost: boolean };
    results: Array<{
      mode: string;
      state: string;
      renderCalls: number;
      resizeCalls: number;
      completions: number;
      released: number;
      receiver: boolean;
      failure: string;
      canvases: number;
      peer: unknown;
    }>;
  };
  expect(data.baseline.green).toBeGreaterThan(100);
  expect(data.baseline.error).toBe(0);
  expect(data.baseline.lost).toBe(false);
  expect(data.results).toHaveLength(8);
  for (const result of data.results) {
    expect(result.state).toBe("disposed");
    expect(result.renderCalls).toBe(0);
    expect(result.resizeCalls).toBe(result.mode.startsWith("initial-") ? 0 : 1);
    expect(result.completions).toBe(0);
    expect(result.released).toBe(1);
    expect(result.receiver).toBe(true);
    expect(result.canvases).toBe(0);
    if (result.mode.startsWith("initial-")) expect(result.failure).toContain("disposed");
    else expect(result.failure).toBe("");
    expect(result.peer).toEqual(data.baseline);
  }
  expect(errors).toEqual([]);
});
