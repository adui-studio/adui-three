import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { unzipSync } from "fflate";
import { chromium } from "@playwright/test";
import { recipeIds, repository, sdkArchive } from "./example-recipes.mjs";

const parent = await realpath(tmpdir());
const temporary = await mkdtemp(join(parent, "adui-three-recipes-"));
const manager = process.env.npm_execpath;
assert.ok(manager && /pnpm/i.test(manager), "Run with pnpm run test:recipes");
const command = /\.(?:c?js|mjs)$/i.test(manager) ? process.execPath : manager;
const prefix = command === process.execPath ? [manager] : [];
const environment = { ...process.env };
delete environment.NODE_PATH;
const run = (args, cwd = temporary) =>
  new Promise((resolveRun, reject) => {
    const child = spawn(command, [...prefix, ...args], {
      cwd,
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolveRun(output)
        : reject(new Error(`pnpm ${args.join(" ")} failed\n${output}`)),
    );
  });
let server, browser, dev;
const stopDev = async () => {
  if (dev && dev.exitCode === null && dev.signalCode === null) {
    const ended = new Promise((resolveClose) => dev.once("close", resolveClose));
    dev.kill();
    await ended;
  }
  dev = undefined;
};
try {
  const projects = [];
  for (const id of recipeIds)
    for (const language of ["ts", "js"]) {
      const project = join(temporary, id, language);
      const archive = unzipSync(
        await readFile(join(repository, "examples/.generated/downloads", `${id}-${language}.zip`)),
      );
      for (const name of [
        "index.html",
        `main.${language}`,
        "package.json",
        "README.md",
        "LICENSE",
        `vendor/${sdkArchive}`,
      ])
        assert.ok(archive[name], `${id}/${language}: missing ${name}`);
      if (id === "model") assert.ok(archive["models/animated.glb"]);
      for (const [name, bytes] of Object.entries(archive)) {
        const target = resolve(project, name);
        assert.ok(target.startsWith(project + sep), "Archive entry escapes project");
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes);
      }
      projects.push({ id, language, project });
    }
  // A fresh external installation supplies exactly the same pinned dependencies to all 18 consumers.
  const manifest = JSON.parse(await readFile(join(temporary, "basic/ts/package.json"), "utf8"));
  await mkdir(join(temporary, "vendor"));
  await writeFile(
    join(temporary, "vendor", sdkArchive),
    await readFile(join(temporary, "basic/ts/vendor", sdkArchive)),
  );
  await writeFile(join(temporary, "package.json"), JSON.stringify(manifest, null, 2));
  console.log(`Installing standalone dependencies outside the workspace: ${temporary}`);
  console.log(await run(["install", "--ignore-scripts", "--no-frozen-lockfile"]));
  for (const { id, language, project } of projects) {
    if (language === "ts") await run(["exec", "tsc", "--project", join(project, "tsconfig.json")]);
    assert.ok(resolve(project, "dist").startsWith(project + sep));
    // Keep native compiler bindings in child processes so Windows can release the installation.
    console.log(await run(["exec", "vite", "build", project, "--base", `/${id}/${language}/`]));
    console.log(`Built external ${id}/${language}`);
  }
  server = createServer(async (request, response) => {
    try {
      const [id, language, ...rest] = new URL(request.url ?? "/", "http://localhost").pathname
        .slice(1)
        .split("/");
      assert.ok(recipeIds.includes(id) && ["ts", "js"].includes(language));
      const root = join(temporary, id, language, "dist");
      const file = resolve(root, decodeURIComponent(rest.join("/")) || "index.html");
      assert.ok(file.startsWith(root + sep));
      response.setHeader(
        "Content-Type",
        file.endsWith(".html")
          ? "text/html"
          : file.endsWith(".js")
            ? "text/javascript"
            : "application/octet-stream",
      );
      response.end(await readFile(file));
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const port = server.address().port;
  const probe = createServer();
  await new Promise((resolveListen) => probe.listen(0, "127.0.0.1", resolveListen));
  const devPort = probe.address().port;
  await new Promise((resolveClose) => probe.close(resolveClose));
  dev = spawn(
    process.execPath,
    [
      join(temporary, "node_modules/vite/bin/vite.js"),
      temporary,
      "--host",
      "127.0.0.1",
      "--port",
      String(devPort),
      "--strictPort",
    ],
    { cwd: temporary, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let devLog = "";
  dev.stdout.on("data", (chunk) => {
    devLog += chunk;
  });
  dev.stderr.on("data", (chunk) => {
    devLog += chunk;
  });
  const deadline = Date.now() + 20000;
  while (true) {
    if (dev.exitCode !== null) throw new Error(`External Vite dev exited: ${devLog}`);
    try {
      if ((await fetch(`http://127.0.0.1:${devPort}/basic/ts/index.html`)).ok) break;
    } catch {
      /* Waiting for the child server. */
    }
    assert.ok(Date.now() < deadline, `External Vite dev startup timed out: ${devLog}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  browser = await chromium.launch({
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  for (const mode of ["build", "dev"])
    for (const { id, language } of projects) {
      const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
      const errors = [],
        requests = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 400) requests.push(response.url());
      });
      await page.goto(
        mode === "build"
          ? `http://127.0.0.1:${port}/${id}/${language}/`
          : `http://127.0.0.1:${devPort}/${id}/${language}/index.html`,
      );
      await page.waitForFunction(() =>
        document.querySelector("#status")?.textContent?.includes("示例已运行"),
      );
      const pixels = await page.locator("canvas").evaluate(
        (canvas) =>
          new Promise((resolvePixels) => {
            requestAnimationFrame(() => {
              const gl = canvas.getContext("webgl2");
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
              const colors = new Set();
              for (let i = 0; i < bytes.length; i += 4)
                colors.add((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]);
              resolvePixels({ colors: colors.size, error: gl.getError() });
            });
          }),
      );
      assert.ok(pixels.colors > 8, `${id}/${language}: empty GPU image`);
      assert.equal(pixels.error, 0, `${id}/${language}: GPU error`);
      assert.deepEqual(errors, [], `${id}/${language}: page errors`);
      assert.deepEqual(requests, [], `${id}/${language}: missing files`);
      await page.screenshot({
        path: join(
          repository,
          "playwright-report/redesign",
          `recipe-${id}-${language}-${mode}.png`,
        ),
      });
      await page.close();
      console.log(
        `Passed copied ${id}/${language}/${mode}: ${pixels.colors} GPU colors, no page errors or missing files`,
      );
    }
  await browser.close();
  browser = undefined;
  await new Promise((resolveClose) => server.close(resolveClose));
  server = undefined;
  await stopDev();
  const cleanup = await realpath(temporary);
  assert.ok(
    cleanup.startsWith(parent + sep) &&
      basename(cleanup).startsWith("adui-three-recipes-") &&
      cleanup !== parent,
  );
  await rm(cleanup, { recursive: true, force: true });
  console.log(
    "18 copied TS/JS projects passed external strict build and 36 production/dev browser runs.",
  );
} catch (error) {
  console.error(`Retained standalone diagnostics: ${temporary}`);
  throw error;
} finally {
  await browser?.close();
  await stopDev();
  if (server) await new Promise((resolveClose) => server.close(resolveClose));
}
