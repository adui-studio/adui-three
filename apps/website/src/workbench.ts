import "./workbench.css";

const scenarios = [
  ["core", "场景、模型与资源"],
  ["orthographic", "透视与正交相机"],
  ["path", "路径运动与动画"],
  ["instances", "实例化网格"],
  ["path-geometry", "路径几何"],
  ["navigation", "第一与第三人称"],
  ["effects", "动态特效与阴影"],
  ["effects-collection", "点云与空间特效"],
  ["editor", "渲染、色彩与环境"],
  ["webgpu", "双后端生命周期"],
  ["webgpu-features", "双后端扩展"],
  ["capabilities", "渲染能力诊断"],
] as const;

export function mountWorkbench(demo: string | null): void {
  const navigation = document.createElement("aside");
  navigation.className = "workbench-nav";
  navigation.setAttribute("aria-label", "回归工作台导航");
  navigation.innerHTML = `<div class="workbench-row"><a class="workbench-brand" href="?demo=core">adui/three <span>验证工作台</span></a><div class="workbench-links"><a href="https://github.com/adui-studio/adui-three/tree/main/examples" target="_blank" rel="noreferrer">示例源码 ↗</a><a href="https://github.com/adui-studio/adui-three/tree/main/docs" target="_blank" rel="noreferrer">使用文档 ↗</a></div></div><div class="workbench-row"><label>验证场景<select aria-label="验证场景"></select></label><label class="workbench-backend" hidden>运行模式<select aria-label="运行模式"><option value="auto">WebGPU · 允许回退</option><option value="webgl">WebGL</option><option value="webgpu">WebGPU · 严格模式</option></select></label><span class="workbench-meta">SDK v0.0.0 · Three.js r187</span></div>`;
  document.body.insertBefore(navigation, document.querySelector("#app"));
  const select = navigation.querySelector<HTMLSelectElement>("[aria-label=验证场景]")!;
  for (const [id, title] of scenarios) select.add(new Option(title, id));
  select.value = scenarios.some(([id]) => id === demo) ? demo! : "core";
  document.title = `@adui/three · ${select.selectedOptions[0]!.text}`;
  select.addEventListener("change", () => {
    location.href = `?demo=${select.value}`;
  });
  const backend = navigation.querySelector<HTMLSelectElement>("[aria-label=运行模式]")!;
  if (demo === "webgpu" || demo === "webgpu-features") {
    navigation.querySelector<HTMLElement>(".workbench-backend")!.hidden = false;
    backend.value = new URL(location.href).searchParams.get("backend") ?? "auto";
    backend.addEventListener("change", () => {
      const url = new URL(location.href);
      url.searchParams.set("backend", backend.value);
      location.href = url.href;
    });
  }
}
