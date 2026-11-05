import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const library = join(repository, "packages/three");
const require = createRequire(join(library, "package.json"));
const manifest = JSON.parse(await readFile(join(library, "package.json"), "utf8"));
const compiler = require("typescript/package.json");
const manager = process.env.npm_execpath;
assert.ok(manager && /pnpm/i.test(manager), "Run this check with pnpm run test:package");
const managerCommand = /\.(?:c?js|mjs)$/i.test(manager) ? process.execPath : manager;
const managerPrefix = managerCommand === process.execPath ? [manager] : [];
const temporaryParent = await realpath(tmpdir());
const consumer = await mkdtemp(join(temporaryParent, "adui-three-package-"));
const environment = { ...process.env };
delete environment.NODE_PATH;

function run(command, args, cwd = consumer) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolveRun(stdout.trim());
      else
        reject(
          new Error(
            `${basename(command)} ${args.join(" ")} failed (${code})\n${stdout}\n${stderr}`,
          ),
        );
    });
  });
}

const pnpm = (args, cwd) => run(managerCommand, [...managerPrefix, ...args], cwd);
let passed = false;
try {
  console.log("Packing @adui/three into an isolated temporary consumer…");
  const archive = join(consumer, "adui-three.tgz");
  await pnpm(["pack", "--out", archive], library);
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "adui-three-package-consumer",
        private: true,
        type: "module",
        dependencies: {
          [manifest.name]: "file:./adui-three.tgz",
          three: manifest.devDependencies.three,
        },
        devDependencies: { typescript: compiler.version },
      },
      null,
      2,
    ),
  );
  console.log(
    `Installing the archive, Three.js ${manifest.devDependencies.three} and TypeScript ${compiler.version}…`,
  );
  await pnpm([
    "install",
    "--ignore-workspace",
    "--no-frozen-lockfile",
    "--ignore-scripts",
    "--reporter=append-only",
  ]);
  const installed = join(consumer, "node_modules/@adui/three");
  const actual = await realpath(installed);
  const location = relative(consumer, actual);
  assert.ok(
    location && !location.startsWith("..") && !isAbsolute(location),
    "Package must be installed inside the temporary consumer",
  );
  const installedManifest = JSON.parse(await readFile(join(installed, "package.json"), "utf8"));
  assert.equal(installedManifest.name, manifest.name);
  assert.equal(
    installedManifest.dependencies["@types/three"],
    manifest.dependencies["@types/three"],
  );
  for (const field of ["dependencies", "peerDependencies", "devDependencies"])
    for (const value of Object.values(installedManifest[field] ?? {}))
      assert.ok(
        !/^(?:workspace|catalog|link):/.test(value),
        `Unresolved ${field} protocol: ${value}`,
      );
  await copyFile(join(repository, "tests/package/runtime.mjs"), join(consumer, "runtime.mjs"));
  await copyFile(join(repository, "tests/package/consumer.ts.txt"), join(consumer, "consumer.ts"));
  await copyFile(
    join(repository, "tests/package/declarations.ts.txt"),
    join(consumer, "declarations.ts"),
  );
  console.log(await run(process.execPath, ["runtime.mjs"]));
  console.log(
    await run(process.execPath, ["--conditions=development", "runtime.mjs", "--resolve-only"]),
  );

  const compilerEntry = join(consumer, "node_modules/typescript", compiler.bin.tsc);
  async function checkTypes(file, mode) {
    await writeFile(
      join(consumer, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            module: mode === "NodeNext" ? "NodeNext" : "ESNext",
            moduleResolution: mode === "NodeNext" ? "NodeNext" : "Bundler",
            customConditions: mode.endsWith("-development") ? ["development"] : [],
            strict: true,
            skipLibCheck: false,
            noEmit: true,
            verbatimModuleSyntax: true,
            types: [],
          },
          files: [file],
        },
        null,
        2,
      ),
    );
    await run(process.execPath, [compilerEntry, "--project", "tsconfig.json"]);
    console.log(
      `${file} / ${mode}: public API and dependency declarations passed (skipLibCheck=false)`,
    );
  }
  await checkTypes("declarations.ts", "NodeNext");
  // Direct imports of Three.js need application-owned type declarations under strict pnpm isolation.
  const application = JSON.parse(await readFile(join(consumer, "package.json"), "utf8"));
  application.devDependencies["@types/three"] = manifest.dependencies["@types/three"];
  await writeFile(join(consumer, "package.json"), JSON.stringify(application, null, 2));
  await pnpm([
    "install",
    "--ignore-workspace",
    "--no-frozen-lockfile",
    "--ignore-scripts",
    "--reporter=append-only",
  ]);
  for (const mode of ["NodeNext", "Bundler", "Bundler-development"])
    await checkTypes("consumer.ts", mode);
  passed = true;
} finally {
  if (passed) {
    // Only remove the directory created above, after checking its resolved parent and prefix.
    const actual = await realpath(consumer);
    assert.equal(dirname(actual), temporaryParent);
    assert.ok(basename(actual).startsWith("adui-three-package-"));
    await rm(actual, { recursive: true, force: true, maxRetries: 3 });
    console.log("Package consumer checks passed; temporary project removed.");
  } else
    console.error(`Package check failed; temporary project retained for diagnosis: ${consumer}`);
}
