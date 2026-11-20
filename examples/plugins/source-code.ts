import { readFile } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { codeToHtml } from "shiki";
import type { Plugin } from "vite-plus";

/** Highlight repository-owned examples at build time; no Shiki runtime in the browser. */
export function exampleSource(): Plugin {
  const directory = fileURLToPath(new URL("../src/cases/", import.meta.url));
  return {
    name: "adui-example-source",
    enforce: "pre",
    async load(id) {
      const [file, query] = id.split("?");
      if (!new URLSearchParams(query).has("example-source")) return;
      const filename = resolve(file!);
      if (!filename.startsWith(resolve(directory) + sep) || !filename.endsWith(".ts"))
        throw new Error("Example source must be a repository example TypeScript file");
      this.addWatchFile(filename);
      const code = (await readFile(filename, "utf8")).replace(/\r\n/g, "\n");
      const html = await codeToHtml(code, { lang: "typescript", theme: "github-dark-default" });
      return `export default ${JSON.stringify({ code, html, filename: `src/cases/${basename(filename)}` })};`;
    },
  };
}
