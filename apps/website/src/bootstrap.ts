import { mountWorkbench } from "./workbench.ts";
const demo = new URLSearchParams(location.search).get("demo");
mountWorkbench(demo);
try {
  if (demo === "capabilities") await import("./capabilities.ts");
  else if (demo === "webgpu-features") await import("./webgpu-features.ts");
  else if (demo === "webgpu") await import("./webgpu.ts");
  else if (demo === "effects-collection") await import("./effects-collection.ts");
  else if (demo === "editor") await import("./editor.ts");
  else if (demo === "effects") await import("./effects.ts");
  else if (demo === "path-geometry") await import("./path-geometry.ts");
  else if (demo === "navigation") await import("./navigation.ts");
  else if (demo === "orthographic") await import("./orthographic.ts");
  else if (demo === "path") await import("./path.ts");
  else if (demo === "instances") await import("./instances.ts");
  else await import("./main.ts");
} catch (error) {
  const status =
    document.querySelector<HTMLElement>("[role=status]") ?? document.querySelector("#app")!;
  status.textContent = `场景初始化失败：${String(error)}。请切换运行模式，或打开渲染能力诊断检查当前浏览器。`;
  status.setAttribute("data-error", "true");
}
