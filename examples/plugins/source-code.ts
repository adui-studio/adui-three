import { readFile, readdir, realpath } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ExpressiveCode } from "expressive-code";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import { toHtml } from "expressive-code/hast";
import type { Plugin } from "vite-plus";
import {
  recipeTextFiles,
  recipeIds,
  repository,
  createRecipeArchive,
  sdkArchive,
} from "../../scripts/example-recipes.mjs";

/** Repository-only build rendering. The browser receives HTML/CSS, never the engine. */
export function exampleSource(): Plugin {
  const directory = fileURLToPath(new URL("../recipes/", import.meta.url));
  const allowed = resolve(directory) + sep;
  const downloads = resolve(repository, "examples/.generated/downloads");
  const cssId = "virtual:example-source.css";
  const engine = new ExpressiveCode({
    themeCssSelector: (theme) => `[data-code-theme="${theme.type}"]`,
    useDarkModeMediaQuery: false,
    frames: { showCopyToClipboardButton: false },
    plugins: [pluginLineNumbers()],
    defaultProps: { showLineNumbers: true, wrap: true },
    styleOverrides: {
      codeFontFamily: "var(--ui-mono)",
      codeFontSize: "14px",
      codeLineHeight: "1.8",
      borderRadius: "0px",
      codePaddingBlock: "24px",
      codeBackground: ({ theme }) => (theme.type === "dark" ? "#101319" : "#ffffff"),
    },
  });
  return {
    name: "adui-example-source",
    enforce: "pre",
    resolveId(id) {
      if (id === cssId) return `\0${cssId}`;
    },
    async load(moduleId) {
      if (moduleId === `\0${cssId}`)
        return `${await engine.getBaseStyles()}\n${await engine.getThemeStyles()}`;
      const [file, query] = moduleId.split("?");
      if (!new URLSearchParams(query).has("example-source")) return;
      const filename = await realpath(resolve(file!));
      if (!filename.startsWith(allowed) || !filename.endsWith(".ts"))
        throw new Error("Example source must be an authored standalone TypeScript recipe");
      const id = basename(filename, ".ts");
      if (!recipeIds.includes(id)) throw new Error("Unknown standalone recipe");
      this.addWatchFile(filename);
      this.addWatchFile(resolve(directory, id + ".js"));
      const variants: Record<
        string,
        {
          files: Array<{
            code: string;
            html: string;
            styles: string;
            filename: string;
            language: string;
          }>;
          download: string;
        }
      > = {};
      for (const language of ["ts", "js"]) {
        this.addWatchFile(resolve(directory, `index-${language}.html`));
        const text = await recipeTextFiles(id, language);
        const files = [];
        for (const [label, code] of Object.entries(text)) {
          const syntax = label.endsWith(".html")
            ? "html"
            : label.endsWith(".json")
              ? "json"
              : label.endsWith(".md")
                ? "md"
                : language;
          const focus = label.startsWith("main.")
            ? code.split("\n").findIndex((line) => /ThreeApp\.create\(/.test(line))
            : -1;
          const result = await engine.render({
            code,
            language: syntax,
            meta: focus < 0 ? "" : "{" + (focus + 1) + "}",
            props: { title: label, frame: "none" },
          });
          files.push({
            code,
            html: toHtml(result.renderedGroupAst),
            styles: [...result.styles].join("\n"),
            filename: label,
            language: syntax,
          });
        }
        variants[language] = { files, download: "downloads/" + id + "-" + language + ".zip" };
      }
      return "export default " + JSON.stringify({ variants }) + ";";
    },
    async generateBundle() {
      for (const file of await readdir(downloads)) {
        if (/^[a-z]+-(ts|js)\.zip$/.test(file))
          this.emitFile({
            type: "asset",
            fileName: "downloads/" + file,
            source: await readFile(resolve(downloads, file)),
          });
      }
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = new URL(request.url ?? "/", "http://localhost").pathname;
        const file = path.match(/\/downloads\/([a-z]+-(?:ts|js)\.zip)$/)?.[1];
        if (!file) return next();
        try {
          const [id, language] = file.slice(0, -4).split("-");
          const sdk = await readFile(resolve(downloads, "../vendor", sdkArchive));
          const bytes = await createRecipeArchive(id!, language!, sdk);
          response.setHeader("Content-Type", "application/zip");
          response.end(bytes);
        } catch {
          next();
        }
      });
    },
  };
}
