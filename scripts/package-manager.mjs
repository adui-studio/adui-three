import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";

/** Vite+ tasks do not always inherit npm_execpath; use the installed pnpm without a shell. */
export function packageManager() {
  let manager = process.env.npm_execpath;
  if (!manager || !/pnpm/i.test(manager)) {
    const paths = execFileSync(process.platform === "win32" ? "where.exe" : "which", ["pnpm"], {
      encoding: "utf8",
      windowsHide: true,
    })
      .trim()
      .split(/\r?\n/);
    const directories = [dirname(process.execPath), ...paths.map(dirname)];
    const candidates = directories.flatMap((directory) => [
      join(directory, "node_modules/corepack/dist/pnpm.js"),
      join(directory, "node_modules/pnpm/bin/pnpm.cjs"),
    ]);
    manager =
      candidates.find(existsSync) ??
      paths.find((path) => process.platform !== "win32" || path.endsWith(".exe"));
  }
  if (!manager) throw new Error("pnpm executable not found; install the project package manager");
  const script = /\.(?:c?js|mjs)$/i.test(manager);
  return { command: script ? process.execPath : manager, prefix: script ? [manager] : [] };
}
