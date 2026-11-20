import { defineConfig } from "vite-plus";
import { exampleSource } from "./plugins/source-code.ts";
export default defineConfig({
  base: "/play/",
  publicDir: "../fixtures",
  plugins: [exampleSource()],
});
