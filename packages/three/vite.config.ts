import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      controls: "src/controls.ts",
      loaders: "src/loaders.ts",
      interaction: "src/interaction.ts",
    },
    format: "esm",
    target: "es2022",
    dts: { generator: "tsgo" },
    exports: false,
    deps: { neverBundle: ["three", /^three\//] },
  },
});
