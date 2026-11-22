import "../../../ui/tokens.css";
import "../../../ui/vue-bits/motion-components.css";
import "../../../ui/tech.css";
import "./workbench.css";
import { createApp, h } from "vue";
import StaggeredMenu from "../../../ui/vue-bits/StaggeredMenu.ts";
import SplitText from "../../../ui/vue-bits/SplitText.ts";
import brandLogo from "../../../docs/public/brand/ADui-Three-Logo.svg?url";
import brandIcon from "../../../docs/public/brand/ADui-Three-Icon.svg?url";

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

export function mountWorkbench(demo: string | null): () => void {
  document.documentElement.classList.add("dark");
  const events = new AbortController();
  const favicon = document.createElement("link");
  favicon.rel = "icon";
  favicon.href = brandIcon;
  document.head.append(favicon);
  const active = scenarios.some(([id]) => id === demo) ? demo! : "core";
  const navigation = document.createElement("aside");
  navigation.className = "workbench-nav";
  navigation.setAttribute("aria-label", "回归工作台导航");
  navigation.innerHTML = `<a class="skip-link" href="#app">跳到主要内容</a><div class="workbench-row workbench-identity"><a class="workbench-brand" href="?demo=core" translate="no"><img src="${brandLogo}" alt="ADui Three" width="180" height="65"></a><span class="workspace-label">DEVELOPMENT STUDIO</span></div><div class="workbench-row workbench-settings"><label>验证场景<select aria-label="验证场景"></select></label><label class="workbench-backend" hidden>运行模式<select aria-label="运行模式"><option value="auto">WebGPU · 允许回退</option><option value="webgl">WebGL</option><option value="webgpu">WebGPU · 严格模式</option></select></label></div><nav class="scenario-nav" aria-label="场景目录"><span class="nav-caption">WORKSPACE / 12 SCENES</span>${scenarios.map(([id, title], i) => `<a href="?demo=${id}" ${id === active ? 'aria-current="page"' : ""}><span class="nav-number">${String(i + 1).padStart(2, "0")}</span>${title}<span class="nav-arrow" aria-hidden="true">↗</span></a>`).join("")}</nav><div class="workbench-links"><a href="https://github.com/adui-studio/adui-three/tree/main/examples" target="_blank" rel="noreferrer">正式示例 ↗</a><a href="https://github.com/adui-studio/adui-three/tree/main/docs" target="_blank" rel="noreferrer">使用文档 ↗</a><a href="https://github.com/adui-studio/adui-three" target="_blank" rel="noreferrer">GitHub ↗</a></div><span class="workbench-meta">v0.0.0 · THREE.JS r187<br>LOCAL INTEGRATION WORKBENCH</span>`;
  document.body.insertBefore(navigation, document.querySelector("#app"));
  const chrome = document.createElement("div");
  chrome.className = "workbench-commandbar";
  document.body.insertBefore(chrome, document.querySelector("#app"));
  const title = scenarios.find(([id]) => id === active)!;
  const chromeApp = createApp({
    render: () =>
      h("header", [
        h("div", { class: "commandbar-title" }, [
          h(
            "span",
            { class: "commandbar-index" },
            String(scenarios.indexOf(title) + 1).padStart(2, "0"),
          ),
          h("div", [
            h("small", "ADUI THREE / STUDIO"),
            h("strong", [h(SplitText, { text: title[1] })]),
          ]),
        ]),
        h("div", { class: "commandbar-actions" }, [
          h("span", { class: "studio-build" }, "DEVELOPMENT / r187"),
          h(StaggeredMenu, {
            label: "场景目录",
            items: scenarios.map(([id, label]) => ({ label, href: `?demo=${id}` })),
          }),
        ]),
      ]),
  });
  chromeApp.mount(chrome);
  document.querySelector<HTMLElement>("#app")!.tabIndex = -1;
  document.documentElement.dataset.workbench = "true";
  const select = navigation.querySelector<HTMLSelectElement>("[aria-label=验证场景]")!;
  for (const [id, title] of scenarios) select.add(new Option(title, id));
  select.value = scenarios.some(([id]) => id === demo) ? demo! : "core";
  document.title = `ADui Three · ${select.selectedOptions[0]!.text}`;
  select.addEventListener(
    "change",
    () => {
      location.href = `?demo=${select.value}`;
    },
    { signal: events.signal },
  );
  const backend = navigation.querySelector<HTMLSelectElement>("[aria-label=运行模式]")!;
  if (demo === "webgpu" || demo === "webgpu-features") {
    navigation.querySelector<HTMLElement>(".workbench-backend")!.hidden = false;
    backend.value = new URL(location.href).searchParams.get("backend") ?? "auto";
    backend.addEventListener(
      "change",
      () => {
        const url = new URL(location.href);
        url.searchParams.set("backend", backend.value);
        location.href = url.href;
      },
      { signal: events.signal },
    );
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    events.abort();
    chromeApp.unmount();
    chrome.remove();
    navigation.remove();
    favicon.remove();
  };
}
