import { expect, test } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";

test("native dispose listener ordering bounds WebGL cleanup while extension failures remain isolated", async ({
  page,
}, testInfo) => {
  const nativeModules = new Set<string>();
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/test-native/")) nativeModules.add(pathname);
  });
  for (const [prefix, directory] of [
    ["test-native", "packages/three/node_modules/three"],
    ["test-library", "packages/three/dist"],
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
  await page.route("**/native-disposal.html", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body>
      <div id="stage" style="width:640px;height:360px"></div><pre id="result"></pre>
      <script type="importmap">{"imports":{"three":"/test-native/build/three.module.js"}}</script>
      <script type="module">
        import { ThreeApp } from "/test-library/index.mjs";
        import { createInstancedMesh } from "/test-library/geometry.mjs";
        import { BoxGeometry, MeshBasicMaterial, Color, Matrix4 } from "three";
        const app = new ThreeApp(document.querySelector("#stage"));
        const geometry = app.resources.track(new BoxGeometry());
        const material = app.resources.track(new MeshBasicMaterial());
        const gl = app.renderer.getContext();
        const buffers = new Set();
        const create = gl.createBuffer.bind(gl), remove = gl.deleteBuffer.bind(gl);
        gl.createBuffer = () => { const value = create(); if (value) buffers.add(value); return value; };
        gl.deleteBuffer = value => { buffers.delete(value); remove(value); };
        const fail = () => { throw new Error("consumer dispose listener"); };
        const results = [];
        for (const mode of ["extension", "late-native", "early-native"]) {
          const handle = createInstancedMesh(app, { geometry, material, capacity: 1 });
          handle.setMatrixAt(0, new Matrix4());
          handle.setColorAt(0, new Color(0xff0000));
          handle.setCount(1);
          if (mode === "early-native") handle.mesh.addEventListener("dispose", fail);
          app.render();
          if (mode === "late-native") handle.mesh.addEventListener("dispose", fail);
          if (mode === "extension") handle.resources.track({ dispose: fail });
          const before = buffers.size;
          let aggregate = false;
          try { handle.dispose(); } catch (error) { aggregate = error instanceof AggregateError; }
          results.push({ mode, released: before - buffers.size, aggregate, disposed: handle.disposed,
            detached: handle.mesh.parent === null, glError: gl.getError() });
          // Native event dispatch stops on an exception; removing the consumer listener allows native cleanup.
          handle.mesh.removeEventListener("dispose", fail);
          handle.mesh.dispose();
        }
        app.dispose();
        document.querySelector("#result").textContent = JSON.stringify(results);
      </script></body></html>`,
    });
  });
  await page.goto("/native-disposal.html");
  await expect(page.locator("#result")).not.toBeEmpty();
  const results = JSON.parse((await page.locator("#result").textContent())!);
  const importsPath = testInfo.outputPath("native-esm-imports.json");
  await mkdir(testInfo.outputDir, { recursive: true });
  await writeFile(importsPath, JSON.stringify([...nativeModules].sort(), null, 2));
  await testInfo.attach("native-esm-imports", {
    path: importsPath,
    contentType: "application/json",
  });
  expect(results).toEqual([
    { mode: "extension", released: 2, aggregate: true, disposed: true, detached: true, glError: 0 },
    {
      mode: "late-native",
      released: 2,
      aggregate: true,
      disposed: true,
      detached: true,
      glError: 0,
    },
    {
      mode: "early-native",
      released: 0,
      aggregate: true,
      disposed: true,
      detached: true,
      glError: 0,
    },
  ]);
});
