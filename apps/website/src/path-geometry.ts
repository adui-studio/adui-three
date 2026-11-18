import "./style.css";
import { ThreeApp } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import { createPathCurve, createPathRibbon, createPathTube } from "@adui/three/geometry";
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from "three";
const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `<div class="shell"><header class="topbar"><a class="brand" href="/">adui<span>/</span>three</a><span class="version">PATH GEOMETRY</span><a class="source" href="/">返回主场景 ↗</a></header><main><section class="intro"><div class="eyebrow"><span class="dot"></span> GEOMETRY PLAYGROUND</div><h1>把路线，<br><span>变成可见形状。</span></h1><p>独立圆角路径、带箭头的路径带与原生管道。<br>进度裁切和几何替换不依赖场景时间。</p></section><section class="workspace"></section></main><footer><span>@adui/three · 本地开发预览，尚未发布</span><span>BufferGeometry / CurvePath / TubeGeometry</span></footer></div>`;
const workspace = root.querySelector<HTMLElement>(".workspace")!;
function mount(kind: "ribbon" | "tube") {
  const card = document.createElement("article");
  card.className = "scene-card";
  card.dataset.testid = `path-geometry-${kind}`;
  card.innerHTML = `<div class="card-heading"><h2>${kind === "ribbon" ? "路径带" : "路径管道"}</h2><span>OWNED GEOMETRY</span></div><div class="instances-stage" aria-label="${kind === "ribbon" ? "路径带" : "管道"}画布"></div><label class="animation-timeline">路径进度<input aria-label="路径进度" data-setting="progress" type="range" min="0" max="100" step="1" value="100"></label><label class="animation-timeline">拐角修剪<input aria-label="拐角修剪" data-setting="trim" type="range" min="0" max="100" step="5" value="50"></label><label class="animation-timeline">${kind === "ribbon" ? "路径宽度" : "管道半径"}<input aria-label="${kind === "ribbon" ? "路径宽度" : "管道半径"}" data-setting="size" type="range" min="5" max="100" step="5" value="${kind === "ribbon" ? 40 : 15}"></label><div class="actions">${kind === "ribbon" ? '<button data-action="arrow">切换箭头</button><button data-action="side">切换侧边</button>' : ""}<button data-action="closed">切换闭合</button><button data-action="pause">暂停场景</button><button data-action="start">运行场景</button><button data-action="dispose">销毁场景</button><button data-action="rebuild">重建场景</button><button data-action="render">绘制一帧</button></div><p class="model-feedback">进度：<span data-value="progress"></span> · 形态：<span data-value="shape"></span> · 侧边：<span data-value="side"></span> · 场景：<span data-value="host"></span></p><p class="model-feedback" role="alert" hidden></p>`;
  workspace.append(card);
  let app: ThreeApp,
    mesh: Mesh<BufferGeometry, MeshBasicMaterial>,
    arrow = true,
    closed = false,
    side: "both" | "left" | "right" = "both";
  const stage = card.querySelector<HTMLDivElement>(".instances-stage")!;
  const setting = (name: string) =>
    card.querySelector<HTMLInputElement>(`[data-setting="${name}"]`)!;
  const show = (name: string, value: string): void => {
    card.querySelector<HTMLElement>(`[data-value="${name}"]`)!.textContent = value;
  };
  const report = (error: unknown): void => {
    const node = card.querySelector<HTMLElement>('[role="alert"]')!;
    node.hidden = false;
    node.textContent = String(error);
  };
  const refresh = (): void => {
    show("progress", (Number(setting("progress").value) / 100).toFixed(2));
    show("shape", closed ? "closed" : arrow && kind === "ribbon" ? "arrow" : "open");
    show("side", kind === "ribbon" ? side : "—");
    show("host", app.state);
    card.dataset.geometries = String(app.renderer.info.memory.geometries);
    for (const button of card.querySelectorAll<HTMLButtonElement>("button"))
      button.disabled = button.dataset.action !== "rebuild" && app.state === "disposed";
    for (const slider of card.querySelectorAll<HTMLInputElement>("input"))
      slider.disabled = app.state === "disposed";
  };
  const buildGeometry = (): BufferGeometry => {
    const points = [
      new Vector3(-3, 0, 1),
      new Vector3(-1, 0, 1),
      new Vector3(-1, 0.7, -1.5),
      new Vector3(1.5, 0.7, -1.5),
      new Vector3(3, 0, 1),
    ];
    if (closed) points.push(new Vector3(0, 0, 3));
    const curve = createPathCurve(points, {
      cornerTrim: Number(setting("trim").value) / 100,
      closed,
    });
    const options = {
      progress: Number(setting("progress").value) / 100,
      segments: 128,
      closed,
      uvScale: 1,
    };
    return kind === "ribbon"
      ? createPathRibbon(curve, {
          ...options,
          width: Number(setting("size").value) / 100,
          arrow: arrow && !closed,
          side,
        })
      : createPathTube(curve, {
          ...options,
          radius: Number(setting("size").value) / 100,
          radialSegments: 12,
        });
  };
  const replace = (): void => {
    const geometry = app.resources.track(buildGeometry()),
      old = mesh.geometry;
    mesh.geometry = geometry;
    app.resources.untrack(old);
    old.dispose();
    app.render();
    refresh();
  };
  const rebuild = (): void => {
    app?.dispose();
    app = new ThreeApp(stage);
    app.scene.background = new Color(0x101b20);
    app.camera.position.set(5, 5, 8);
    app.camera.lookAt(0, 0, 0);
    attachOrbitControls(app);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 16;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 64, 16);
    context.fillStyle = "#52616a";
    context.fillRect(0, 0, 16, 16);
    const texture = app.resources.track(new CanvasTexture(canvas));
    texture.colorSpace = SRGBColorSpace;
    texture.wrapS = RepeatWrapping;
    const material = app.resources.track(
      new MeshBasicMaterial({
        color: kind === "ribbon" ? 0xffa04a : 0x8cdcc1,
        map: texture,
        side: DoubleSide,
      }),
    );
    mesh = new Mesh(app.resources.track(buildGeometry()), material);
    app.scene.add(mesh);
    app.onAfterRender(refresh);
    app.signal.addEventListener("abort", () => queueMicrotask(refresh), { once: true });
    app.start();
    refresh();
    card.querySelector<HTMLElement>('[role="alert"]')!.hidden = true;
  };
  card.addEventListener("input", () => {
    try {
      replace();
    } catch (error) {
      report(error);
    }
  });
  card.addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLButtonElement>("button")?.dataset.action;
    if (!action) return;
    try {
      if (action === "rebuild") rebuild();
      else if (action === "dispose") app.dispose();
      else if (action === "pause") app.stop();
      else if (action === "start") app.start();
      else if (action === "arrow") {
        arrow = !arrow;
        replace();
      } else if (action === "closed") {
        closed = !closed;
        replace();
      } else if (action === "side") {
        side = side === "both" ? "left" : side === "left" ? "right" : "both";
        replace();
      }
      if (app.state !== "disposed") app.render();
      refresh();
    } catch (error) {
      report(error);
    }
  });
  rebuild();
  return () => app.dispose();
}
const disposers = [mount("ribbon"), mount("tube")];
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const dispose of disposers) dispose();
  });
