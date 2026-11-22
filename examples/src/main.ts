import "../../ui/tokens.css";
import "../../ui/vue-bits/spotlight-card.css";
import "../../ui/vue-bits/motion-components.css";
import "../../ui/tech.css";
import "./style.css";
import "virtual:example-source.css";
import "./source-viewer.css";
import "../../ui/render-stats-panel.css";
import { createApp } from "vue";
import Gallery from "./Gallery.ts";
import StaggeredMenu from "../../ui/vue-bits/StaggeredMenu.ts";
import { mountPageMotion } from "../../ui/motion.ts";
import { createSourceViewer } from "./source-viewer.ts";
import { mountRenderStatsPanel } from "../../ui/render-stats-panel.ts";
import type { RenderStatsPanel } from "../../ui/render-stats-panel.ts";
import brandLogo from "../../docs/public/brand/ADui-Three-Logo.svg?url";
import brandIcon from "../../docs/public/brand/ADui-Three-Icon.svg?url";
import { examples } from "./catalog.ts";
import type { ExampleRenderer } from "./shared.ts";
import type { SceneApp } from "@adui/three";
const favicon = document.createElement("link");
favicon.rel = "icon";
favicon.href = brandIcon;
document.head.append(favicon);
const docs = import.meta.env.DEV ? "http://127.0.0.1:5174/" : "../";
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<a class="skip-link" href="#main-content">跳到主要内容</a>
<header class="site-header"><a href="./" class="brand" data-home translate="no"><img src="${brandLogo}" alt="ADui Three" width="180" height="65"><span class="brand-section">Examples</span></a><nav aria-label="主导航"><a href="${docs}" target="_blank" rel="noreferrer">文档 ↗</a><div data-example-menu></div></nav></header>
<main id="main-content" tabindex="-1"><section class="home"><div data-gallery-root></div></section>
<section class="detail" hidden><nav class="example-switcher" aria-label="切换示例">${examples.map((item, i) => `<a href="?example=${item.id}" data-example="${item.id}"><span>0${i + 1}</span>${item.title}</a>`).join("")}</nav><div class="detail-heading"><div><a href="./" class="back" data-home>← 全部示例</a><h1 data-title></h1><p data-description></p></div><span class="live-state" data-state>ready</span></div><div class="scene-layout"><div class="scene-display"><div class="stage-topline"><span>LIVE PREVIEW</span><span>拖动旋转 · 滚轮缩放</span></div><div class="viewport" aria-label="示例画布"></div></div><aside class="scene-inspector" aria-label="场景设置"><div class="inspector-heading">场景控制 <span>CONTROLS</span></div><div class="toolbar"><label class="renderer-choice">渲染器<select aria-label="渲染器"><option value="webgl">WebGL</option><option value="webgpu">WebGPU · 允许回退</option><option value="webgpu-strict">WebGPU · 严格模式</option></select></label><span class="backend-info" aria-label="实际渲染后端">尚未创建</span><button data-command="start">运行</button><button data-command="stop">暂停</button><button data-command="render">绘制一帧</button><button data-command="dispose">销毁</button><button data-command="rebuild">重建</button></div><div class="inspector-heading">主题操作 <span>INTERACTION</span></div><div class="tools" aria-label="示例操作"></div></aside></div><details class="source"><summary>查看示例源码</summary>
<div class="source-workspace" data-code-theme="dark" data-wrap="false">
<div class="source-heading"><div><span class="source-eyebrow">SOURCE EXPLORER</span><span class="source-filename" translate="no"></span></div><div class="source-reading-options"><div class="source-languages" role="group" aria-label="示例语言"><button type="button" data-source-language="ts" aria-pressed="true">TypeScript</button><button type="button" data-source-language="js" aria-pressed="false">JavaScript</button></div><span class="source-meta"></span></div></div>
<div class="source-setup"><p>独立用法示例：复制入口与 HTML 到已安装 SDK 的 Vite 项目，或下载含本地 SDK 和所需资产的完整工程。</p><div><code>pnpm install &amp;&amp; pnpm run dev</code><a class="source-download">下载完整工程</a></div></div>
<div class="source-toolbar"><div class="source-tabs" role="tablist" aria-label="源码文件"></div><div class="source-actions"><button type="button" class="wrap-source" aria-pressed="false">自动换行</button><button type="button" class="theme-source">浅色主题</button><button type="button" class="expand-source" aria-expanded="false" aria-haspopup="dialog">展开阅读</button><button type="button" class="copy-source" disabled>复制代码</button></div></div>
<div class="source-code" id="source-content" role="tabpanel" translate="no"></div>
<div class="source-footer"><span>独立用法 · 仅使用公开 API · 主包尚未发布 npm</span><span class="copy-feedback" aria-live="polite"></span></div>
</div></details></section>
<p class="status" role="status"></p></main><footer><span>@adui/three · v0.0.0 · 尚未发布 npm</span><span>Three.js r187 / WebGL 2 + 可选 WebGPU</span></footer>`;
const menuApp = createApp(StaggeredMenu, {
  label: "探索",
  items: [
    { label: "示例集", href: "./", description: "九个主题，完整 TS / JS 用法" },
    { label: "使用文档", href: docs, description: "指南、API 与模块组合" },
    {
      label: "GitHub",
      href: "https://github.com/adui-studio/adui-three",
      description: "源代码与开发记录",
    },
  ],
});
menuApp.mount(document.querySelector<HTMLElement>("[data-example-menu]")!);
const galleryApp = createApp(Gallery);
galleryApp.mount(document.querySelector<HTMLElement>("[data-gallery-root]")!);
const home = document.querySelector<HTMLElement>(".home")!,
  detail = document.querySelector<HTMLElement>(".detail")!,
  viewport = document.querySelector<HTMLElement>(".viewport")!,
  tools = document.querySelector<HTMLElement>(".tools")!,
  status = document.querySelector<HTMLElement>(".status")!;
const rendererSelect = document.querySelector<HTMLSelectElement>("[aria-label=渲染器]")!;
const sourceViewer = createSourceViewer(detail.querySelector<HTMLDetailsElement>(".source")!);
let disposeMotion: (() => void) | undefined;
const backendInfo = document.querySelector<HTMLSpanElement>(".backend-info")!;
function selectedRenderer(id: string | null): ExampleRenderer {
  const choice = new URL(location.href).searchParams.get("renderer");
  if (choice === "webgl" || choice === "webgpu" || choice === "webgpu-strict") return choice;
  return id === "webgpu" ? "webgpu" : "webgl";
}
let pending = new AbortController();
let current: SceneApp | undefined,
  activeId: string | undefined,
  generation = 0;
let statsPanel: RenderStatsPanel | undefined;
function refresh(): void {
  statsPanel?.refresh();
  const state = current?.state ?? "ready";
  detail.dataset.state = state;
  detail.setAttribute("aria-busy", String(!current && !!activeId));
  detail.querySelector(".live-state")!.textContent = state;
  for (const button of detail.querySelectorAll<HTMLButtonElement>("[data-command]"))
    button.disabled = button.dataset.command !== "rebuild" && (!current || state === "disposed");
}
async function open(id: string | null, history = false): Promise<void> {
  const choice = selectedRenderer(id);
  rendererSelect.value = choice;
  backendInfo.textContent = "尚未创建";
  const request = ++generation;
  statsPanel?.dispose();
  statsPanel = undefined;
  disposeMotion?.();
  disposeMotion = undefined;
  pending.abort();
  pending = new AbortController();
  const signal = pending.signal;
  void current?.destroy().catch((error) => console.error(error));
  current = undefined;
  tools.replaceChildren();
  viewport.replaceChildren();
  activeId = id ?? undefined;
  sourceViewer.clear();
  if (history) {
    const url = new URL(location.href);
    if (id) url.searchParams.set("example", id);
    else url.searchParams.delete("example");
    window.history.pushState(null, "", url);
  }
  const item = examples.find((value) => value.id === id);
  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    ".example-switcher [data-example]",
  ))
    if (link.dataset.example === item?.id) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  home.hidden = !!item;
  detail.hidden = !item;
  const activeLink = detail.querySelector<HTMLAnchorElement>(
    '.example-switcher [aria-current="page"]',
  );
  if (activeLink) {
    const switcher = activeLink.parentElement!;
    switcher.scrollLeft =
      activeLink.offsetLeft - (switcher.clientWidth - activeLink.offsetWidth) / 2;
  }
  status.textContent = item
    ? "正在准备场景…"
    : id
      ? "未找到该示例，请从列表选择。"
      : "选择示例后会创建一个独立场景。";
  disposeMotion = mountPageMotion(item ? detail : home, item ? "detail" : "gallery");
  if (!item) return;
  document.querySelector("[data-title]")!.textContent = item.title;
  document.querySelector("[data-description]")!.textContent = item.description;
  detail.dataset.example = item.id;
  refresh();
  void item
    .source()
    .then((source) => {
      if (request === generation && !signal.aborted) sourceViewer.set(source);
    })
    .catch(() => {
      if (request === generation && !signal.aborted) sourceViewer.fail();
    });
  try {
    const module = await item.load();
    if (request !== generation) return;
    const app = await module.mount({
      signal,
      renderer: choice,
      container: viewport,
      tools,
      status: (message) => {
        if (request === generation) status.textContent = message;
      },
    });
    if (request !== generation) {
      await app.destroy();
      return;
    }
    current = app;
    statsPanel = mountRenderStatsPanel(app, detail.querySelector<HTMLElement>(".scene-inspector")!);
    if (!tools.hasChildNodes()) {
      const hint = document.createElement("p");
      hint.className = "tools-empty";
      hint.textContent = "本主题可直接在画布中交互。";
      tools.append(hint);
    }
    detail.dataset.renderer = app.rendererType;
    detail.dataset.backend = app.backend;
    backendInfo.textContent = `${app.rendererType === "webgl" ? "WebGLRenderer" : "WebGPURenderer"} / ${app.backend === "webgpu" ? "WebGPU" : "WebGL 2"}`;
    let frames = 0;
    app.onAfterRender(() => {
      detail.dataset.frames = String(++frames);
      refresh();
    });
    app.signal.addEventListener("abort", () => queueMicrotask(refresh), { once: true });
    refresh();
  } catch (error) {
    if (request === generation) {
      status.textContent =
        choice === "webgpu-strict"
          ? `原生 WebGPU 初始化失败：${String(error)}。可切换为 WebGL 或允许回退，并检查浏览器 GPU 状态。`
          : String(error);
      detail.dataset.state = "error";
      detail.setAttribute("aria-busy", "false");
    }
  }
}
const listeners = new AbortController();
rendererSelect.addEventListener(
  "change",
  () => {
    const url = new URL(location.href);
    url.searchParams.set("renderer", rendererSelect.value);
    window.history.pushState(null, "", url);
    void open(activeId ?? null);
  },
  { signal: listeners.signal },
);
document.addEventListener(
  "click",
  (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[data-example],a[data-home]",
    );
    if (
      link &&
      event instanceof MouseEvent &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
      void open(link.dataset.example ?? null, true);
      return;
    }
    const command = (event.target as Element).closest<HTMLButtonElement>("[data-command]")?.dataset
      .command;
    if (command === "rebuild") {
      void open(activeId ?? null);
      return;
    }
    if (!current) return;
    if (command === "start") current.start();
    else if (command === "stop") current.stop();
    else if (command === "render") current.renderOnce();
    else if (command === "dispose")
      void current.destroy().catch((error) => {
        status.textContent = String(error);
      });
    refresh();
  },
  { signal: listeners.signal },
);
window.addEventListener(
  "popstate",
  () => {
    void open(new URLSearchParams(location.search).get("example"));
  },
  { signal: listeners.signal },
);
window.addEventListener(
  "pagehide",
  (event) => {
    if (!event.persisted) {
      galleryApp.unmount();
      menuApp.unmount();
    }
    generation++;
    disposeMotion?.();
    sourceViewer.destroy();
    pending.abort();
    void current?.destroy().catch((error) => console.error(error));
  },
  { signal: listeners.signal },
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    galleryApp.unmount();
    menuApp.unmount();
    generation++;
    disposeMotion?.();
    sourceViewer.destroy();
    pending.abort();
    listeners.abort();
    void current?.destroy().catch((error) => console.error(error));
  });
void open(new URLSearchParams(location.search).get("example"));
