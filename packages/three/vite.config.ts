import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: {
      index: "src/index.ts",
      controls: "src/controls.ts",
      loaders: "src/loaders.ts",
      interaction: "src/interaction.ts",
      labels: "src/labels.ts",
      animation: "src/animation.ts",
      camera: "src/camera.ts",
      postprocessing: "src/postprocessing.ts",
      environment: "src/environment.ts",
      textures: "src/textures.ts",
      capture: "src/capture.ts",
    },
    format: "esm",
    target: "es2022",
    dts: { generator: "tsgo" },
    exports: false,
    deps: { neverBundle: ["three", /^three\//] },
  },
});
