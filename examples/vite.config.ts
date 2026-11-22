import { defineConfig } from "vite-plus";
import { exampleSource } from "./plugins/source-code.ts";
export default defineConfig({
  base: "/play/",
  publicDir: "../fixtures",
  plugins: [exampleSource()],
  define: {
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
});
