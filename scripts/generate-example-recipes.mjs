import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { transformWithOxc } from "vite-plus";
import { spawnSync } from "node:child_process";
import { recipeIds, repository, projectHTML } from "./example-recipes.mjs";

const check = process.argv.includes("--check");
for (const id of recipeIds) {
  const source = await readFile(join(repository, "examples/recipes", `${id}.ts`), "utf8");
  assert.ok(
    !/shared\.ts|ExampleContext|import\.meta\.env|from\s+["']\./.test(source),
    `${id}: repository dependency in public recipe`,
  );
  const result = await transformWithOxc(source, `${id}.ts`, { target: "esnext" });
  const generated = "// JavaScript 完整示例，与同主题 TypeScript 版本保持一致。\n" + result.code;
  const formatted = spawnSync(
    process.execPath,
    [join(repository, "node_modules/vite-plus/bin/vp"), "fmt", "--stdin-filepath", `${id}.js`],
    { cwd: repository, input: generated, encoding: "utf8", windowsHide: true },
  );
  assert.equal(formatted.status, 0, formatted.stderr);
  const output = formatted.stdout.replace(/\r\n/g, "\n");
  const target = join(repository, "examples/recipes", `${id}.js`);
  if (check)
    assert.equal(
      (await readFile(target, "utf8")).replace(/\r\n/g, "\n"),
      output,
      `${id}: regenerate JavaScript`,
    );
  else await writeFile(target, output);
}
console.log(`${recipeIds.length} standalone TS/JS recipes ${check ? "checked" : "generated"}.`);
for (const language of ["ts", "js"]) {
  const target = join(repository, "examples/recipes", `index-${language}.html`);
  const formatted = spawnSync(
    process.execPath,
    [
      join(repository, "node_modules/vite-plus/bin/vp"),
      "fmt",
      "--stdin-filepath",
      `index-${language}.html`,
    ],
    { cwd: repository, input: projectHTML(language), encoding: "utf8", windowsHide: true },
  );
  assert.equal(formatted.status, 0, formatted.stderr);
  const output = formatted.stdout.replace(/\r\n/g, "\n");
  if (check) assert.equal((await readFile(target, "utf8")).replace(/\r\n/g, "\n"), output);
  else await writeFile(target, output);
}
