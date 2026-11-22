import { readFile, realpath } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ExpressiveCode } from "expressive-code";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import { toHtml } from "expressive-code/hast";
import type { Plugin } from "vite-plus";

/** Repository-only build rendering. The browser receives HTML/CSS, never the engine. */
export function exampleSource(): Plugin {
  const directory = fileURLToPath(new URL("../src/", import.meta.url));
  const cases = resolve(directory, "cases") + sep;
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
    async load(id) {
      if (id === `\0${cssId}`)
        return `${await engine.getBaseStyles()}\n${await engine.getThemeStyles()}`;
      const [file, query] = id.split("?");
      if (!new URLSearchParams(query).has("example-source")) return;
      const filename = await realpath(resolve(file!));
      if (!filename.startsWith(cases) || !filename.endsWith(".ts"))
        throw new Error("Example source must be a repository example TypeScript file");
      const render = async (path: string, label: string, primary: boolean) => {
        this.addWatchFile(path);
        const code = (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
        const focus = primary
          ? code
              .split("\n")
              .findIndex((line) =>
                /\b(attachGSAPTimeline|loadAssets|fitObject|createInstancedMesh|attachDOMLabels|attachPostprocessing|attachShadowLight|attachFirstPersonControls|attachPicking)\(/.test(
                  line,
                ),
              )
          : -1;
        const result = await engine.render({
          code,
          language: "ts",
          meta: focus < 0 ? "" : `{${focus + 1}}`,
          props: { title: label, frame: "none" },
        });
        return {
          code,
          html: toHtml(result.renderedGroupAst),
          styles: [...result.styles].join("\n"),
          filename: label,
        };
      };
      const primary = await render(filename, `src/cases/${basename(filename)}`, true);
      // Expose only the explicit helper; never traverse arbitrary imports or package sources.
      const files = [primary];
      if (/from\s+["']\.\.\/shared\.ts["']/.test(primary.code)) {
        const shared = await realpath(resolve(directory, "shared.ts"));
        if (!shared.startsWith(resolve(directory) + sep))
          throw new Error("Example helper is outside src");
        files.push(await render(shared, "src/shared.ts", false));
      }
      return `export default ${JSON.stringify({ files })};`;
    },
  };
}
