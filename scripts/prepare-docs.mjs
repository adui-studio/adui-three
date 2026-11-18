import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(repository, "examples/dist");
const target = join(repository, "docs/public/play");
const expected = resolve(repository, "docs", "public", "play");
if (target !== expected || !target.startsWith(repository + sep))
  throw new Error("Unexpected documentation asset target");
if (!existsSync(join(source, "index.html")))
  throw new Error("Build examples first: pnpm run examples:build");
const marker = join(target, ".adui-generated");
if (existsSync(target)) {
  if (!existsSync(marker) || readFileSync(marker, "utf8") !== "adui-three-examples\n")
    throw new Error("Refusing to replace an unmarked example directory");
  rmSync(target, { recursive: true, force: true });
}
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true });
writeFileSync(marker, "adui-three-examples\n");
console.log("Prepared generated /play/ examples for VitePress.");
