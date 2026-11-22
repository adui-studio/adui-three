import { defineConfig } from "vite-plus";
export default defineConfig({
  publicDir: "../../fixtures",
  define: {
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
});
