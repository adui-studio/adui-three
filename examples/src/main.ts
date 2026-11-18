import "./style.css";
import { examples } from "./catalog.ts";
import type { ThreeApp } from "@adui/three";
const docs = import.meta.env.DEV ? "http://127.0.0.1:5174/" : "../";
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header><a href="./" class="brand" data-home>adui<span>/</span>three</a><nav><a href="${docs}" target="_blank" rel="noreferrer">文档 ↗</a><a href="https://github.com/adui-studio/adui-three" target="_blank" rel="noreferrer">GitHub ↗</a></nav></header>
<main><section class="home"><div class="eyebrow">EXAMPLES · 0.0.0</div><h1>从一个场景开始。</h1><p class="lead">小而完整的示例，清楚的资源归属。<br>选择一个主题，在真实画面与源码之间理解 @adui/three。</p><div class="catalog">${examples.map((item, i) => `<a class="example-card" href="?example=${item.id}" data-example="${item.id}"><span class="card-index">0${i + 1} / ${item.tag}</span><h2>${item.title}<span>↗</span></h2><p>${item.description}</p></a>`).join("")}</div></section>
<section class="detail" hidden><div class="detail-heading"><div><a href="./" class="back" data-home>← 全部示例</a><h1 data-title></h1><p data-description></p></div><span class="live-state" data-state>ready</span></div><div class="viewport" aria-label="示例画布"></div><div class="toolbar"><button data-command="start">运行</button><button data-command="stop">暂停</button><button data-command="render">绘制一帧</button><button data-command="dispose">销毁</button><button data-command="rebuild">重建</button></div><div class="tools" aria-label="示例操作"></div><details class="source"><summary>查看示例源码</summary><p>只使用公开包入口。场景辅助位于 examples/src/shared.ts。</p><pre><code></code></pre></details></section>
<p class="status" role="status"></p></main><footer><span>@adui/three · 早期开发版本，尚未发布 npm</span><span>Three.js r187 / WebGL 2</span></footer>`;
const home = document.querySelector<HTMLElement>(".home")!,
  detail = document.querySelector<HTMLElement>(".detail")!,
  viewport = document.querySelector<HTMLElement>(".viewport")!,
  tools = document.querySelector<HTMLElement>(".tools")!,
  status = document.querySelector<HTMLElement>(".status")!;
let current: ThreeApp | undefined,
  activeId: string | undefined,
  generation = 0;
function refresh(): void {
  const state = current?.state ?? "ready";
  detail.dataset.state = state;
  detail.querySelector(".live-state")!.textContent = state;
  for (const button of detail.querySelectorAll<HTMLButtonElement>("[data-command]"))
    button.disabled = button.dataset.command !== "rebuild" && (!current || state === "disposed");
}
async function open(id: string | null, history = false): Promise<void> {
  const request = ++generation;
  current?.dispose();
  current = undefined;
  tools.replaceChildren();
  viewport.replaceChildren();
  activeId = id ?? undefined;
  detail.querySelector("code")!.textContent = "";
  detail.querySelector<HTMLDetailsElement>(".source")!.open = false;
  if (history) {
    const url = new URL(location.href);
    if (id) url.searchParams.set("example", id);
    else url.searchParams.delete("example");
    window.history.pushState(null, "", url);
  }
  const item = examples.find((value) => value.id === id);
  home.hidden = !!item;
  detail.hidden = !item;
  status.textContent = item
    ? "正在准备场景…"
    : id
      ? "未找到该示例，请从列表选择。"
      : "选择示例后会创建一个独立场景。";
  if (!item) return;
  document.querySelector("[data-title]")!.textContent = item.title;
  document.querySelector("[data-description]")!.textContent = item.description;
  detail.dataset.example = item.id;
  refresh();
  try {
    const [module, source] = await Promise.all([item.load(), item.source()]);
    if (request !== generation) return;
    const app = module.mount({
      container: viewport,
      tools,
      status: (message) => {
        if (request === generation) status.textContent = message;
      },
    });
    if (request !== generation) {
      app.dispose();
      return;
    }
    current = app;
    let frames = 0;
    app.onAfterRender(() => {
      detail.dataset.frames = String(++frames);
      refresh();
    });
    app.signal.addEventListener("abort", () => queueMicrotask(refresh), { once: true });
    detail.querySelector("code")!.textContent = source;
    refresh();
  } catch (error) {
    if (request === generation) {
      status.textContent = String(error);
      detail.dataset.state = "error";
    }
  }
}
const listeners = new AbortController();
document.addEventListener(
  "click",
  (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[data-example],a[data-home]",
    );
    if (link) {
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
    else if (command === "render") current.render();
    else if (command === "dispose") current.dispose();
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
  () => {
    generation++;
    current?.dispose();
  },
  { signal: listeners.signal },
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    generation++;
    listeners.abort();
    current?.dispose();
  });
void open(new URLSearchParams(location.search).get("example"));
