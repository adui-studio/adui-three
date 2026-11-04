import "./style.css";
import { ThreeApp } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import { loadGLTF } from "@adui/three/loaders";
import type { GLTFModel } from "@adui/three/loaders";
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
} from "three";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="shell">
    <header class="topbar"><a class="brand" href="#">adui<span>/</span>three</a><span class="version">CORE · 0.0.0</span><a class="source" href="https://github.com/adui-studio/adui-three">GitHub ↗</a></header>
    <main>
      <section class="intro"><div class="eyebrow"><span class="dot"></span> CORE PLAYGROUND</div><h1>一个场景，<br><span>清晰的生命周期。</span></h1><p>从创建到释放，让 Three.js 场景的每一步都可控。<br>两个独立实例，一起验证最小核心。</p></section>
      <section class="workspace" aria-label="双实例演示"></section>
      <section class="notes"><div><span class="note-index">01 / COMPOSE</span><h2>保留原生能力</h2><p>直接使用 scene、camera 与 renderer。OrbitControls 从可选入口接入。</p></div><div><span class="note-index">02 / OWN</span><h2>明确资源归属</h2><p>只有显式登记的资源交由宿主释放。场景中的外部共享资源由所有者管理。</p></div><div><span class="note-index">03 / OBSERVE</span><h2>验证每个边界</h2><p>暂停、改变容器尺寸、销毁再重建，观察两个实例的独立状态。</p></div></section>
    </main><footer><span>@adui/three · 本地开发预览，尚未发布</span><span>TypeScript / ESM / WebGL 2</span></footer>
  </div>`;

const teardown: Array<() => void> = [];

function mountPanel(id: string, color: number): void {
  const card = document.createElement("article");
  card.className = "scene-card";
  card.dataset.testid = `scene-${id}`;
  card.innerHTML = `
    <div class="card-heading"><div><span class="scene-id">SCENE ${id}</span><h2>${id === "A" ? "主场景" : "独立实例"}</h2></div><span class="state" data-testid="state">ready</span></div>
    <div class="stage"><div class="viewport" aria-label="场景 ${id}，拖动旋转，滚轮缩放"></div><span class="stage-hint">拖动旋转 · 滚轮缩放</span><p class="error" role="alert" hidden></p></div>
    <div class="metrics"><div><span>UPDATES</span><strong data-testid="frames">0</strong></div><div><span>VIEWPORT</span><strong data-testid="size">—</strong></div><div><span>DPR</span><strong data-testid="dpr">—</strong></div><div><span>DRAW CALLS</span><strong data-testid="draw-calls">0</strong></div></div>
    <div class="actions"><button data-action="start" class="primary">运行</button><button data-action="stop">暂停</button><button data-action="dispose">销毁</button><button data-action="rebuild">重建 ↻</button></div>
    <div class="resize-actions"><button data-action="width" aria-pressed="false">收窄容器</button><button data-action="zero" aria-pressed="false">零高度</button></div>
    <div class="model-actions"><button data-action="glb">加载 GLB</button><button data-action="gltf">加载 GLTF</button><button data-action="cancel-model">取消加载</button><button data-action="remove-model">移除模型</button><button data-action="invalid-model">失败示例</button></div>
    <p class="model-feedback" role="status">模型未加载 · 使用项目原创的内嵌纹理样例</p>`;
  document.querySelector(".workspace")!.appendChild(card);
  const viewport = card.querySelector<HTMLDivElement>(".viewport")!;
  const errorOutput = card.querySelector<HTMLParagraphElement>(".error")!;
  const button = (action: string): HTMLButtonElement =>
    card.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  let app: ThreeApp | undefined;
  let frames = 0;
  let narrow = false;
  let zero = false;
  let placeholder: Mesh | undefined;
  let model: GLTFModel | undefined;
  let request: AbortController | undefined;
  let modelVersion = 0;
  let modelState: "idle" | "loading" | "loaded" | "cancelled" | "error" = "idle";
  let modelMessage = "模型未加载 · 使用项目原创的内嵌纹理样例";

  function refresh(): void {
    const state = app?.state ?? "unavailable";
    card.dataset.state = state;
    card.querySelector(".state")!.textContent = state;
    card.querySelector('[data-testid="frames"]')!.textContent = String(frames);
    const size = app?.size;
    card.querySelector('[data-testid="size"]')!.textContent = size
      ? `${size.width} × ${size.height}`
      : "—";
    card.querySelector('[data-testid="dpr"]')!.textContent = size
      ? size.pixelRatio.toFixed(2)
      : "—";
    card.querySelector('[data-testid="draw-calls"]')!.textContent = String(
      app?.renderer.info.render.calls ?? 0,
    );
    button("start").disabled = !app || state === "running" || state === "disposed";
    button("stop").disabled = !app || state !== "running";
    button("dispose").disabled = !app || state === "disposed";
    card.dataset.modelState = modelState;
    card.querySelector(".model-feedback")!.textContent = modelMessage;
    for (const action of ["glb", "gltf", "invalid-model"])
      button(action).disabled = !app || state === "disposed";
    button("cancel-model").disabled = modelState !== "loading";
    button("remove-model").disabled = !model;
  }

  function clearModel(): void {
    modelVersion++;
    request?.abort();
    request = undefined;
    const previous = model;
    model = undefined;
    modelState = "idle";
    modelMessage = "模型未加载 · 使用项目原创的内嵌纹理样例";
    if (placeholder) placeholder.visible = true;
    previous?.dispose();
  }

  async function requestModel(url: string): Promise<void> {
    if (!app || app.state === "disposed") return;
    clearModel();
    const owner = app;
    const version = modelVersion;
    request = new AbortController();
    modelState = "loading";
    modelMessage = "正在加载与解析模型…";
    refresh();
    try {
      const loaded = await loadGLTF(owner, url, {
        signal: request.signal,
        onProgress: ({ ratio }) => {
          if (version !== modelVersion) return;
          modelMessage =
            ratio === null
              ? "下载中，文件总量未知…"
              : `文件下载 ${(ratio * 100).toFixed(0)}% · 等待解析完成`;
          refresh();
        },
      });
      if (version !== modelVersion || owner !== app || loaded.disposed) {
        loaded.dispose();
        return;
      }
      model = loaded;
      modelState = "loaded";
      modelMessage = `${url.endsWith(".glb") ? "GLB" : "GLTF"} 已加载 · 保留原始材质与尺寸`;
      if (placeholder) placeholder.visible = false;
    } catch (error) {
      if (version !== modelVersion || owner !== app) return;
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      modelState = cancelled ? "cancelled" : "error";
      modelMessage = cancelled
        ? "加载已取消"
        : `加载失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (version === modelVersion) {
        request = undefined;
        refresh();
      }
    }
  }

  function report(error: unknown): void {
    errorOutput.textContent = error instanceof Error ? error.message : String(error);
    errorOutput.hidden = false;
  }

  function rebuild(): void {
    try {
      app?.dispose();
      clearModel();
      errorOutput.hidden = true;
      app = new ThreeApp(viewport, { camera: { position: [4, 3, 5] }, maxPixelRatio: 2 });
      frames = 0;
      app.scene.background = new Color(0x11191b);
      const geometry = app.resources.track(
        id === "A" ? new BoxGeometry(1.6, 1.6, 1.6) : new IcosahedronGeometry(1.15, 0),
      );
      const material = app.resources.track(
        new MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.15, flatShading: true }),
      );
      const mesh = new Mesh(geometry, material);
      placeholder = mesh;
      mesh.position.y = 1.1;
      app.scene.add(mesh, new AmbientLight(0xffffff, 1.7));
      const light = new DirectionalLight(0xffffff, 3.2);
      light.position.set(3, 6, 4);
      app.scene.add(light);
      const grid = new GridHelper(12, 24, 0x36504a, 0x223332);
      app.resources.track(grid.geometry);
      for (const gridMaterial of Array.isArray(grid.material) ? grid.material : [grid.material])
        app.resources.track(gridMaterial);
      app.scene.add(grid);
      const { controls } = attachOrbitControls(app);
      controls.target.set(0, 0.8, 0);
      controls.enableDamping = true;
      controls.minDistance = 3;
      controls.maxDistance = 15;
      controls.update();
      app.onUpdate(({ delta }) => {
        mesh.rotation.y += delta * 0.35;
        mesh.rotation.x += delta * 0.12;
        if (model && !model.disposed) model.scene.rotation.y += delta * 0.35;
        frames++;
      });
      app.start();
    } catch (error) {
      try {
        app?.dispose();
      } catch {
        /* Keep the original initialization diagnostic. */
      }
      report(error);
    }
    refresh();
  }

  const click = (event: MouseEvent): void => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]")
      ?.dataset.action;
    try {
      if (action === "start") app?.start();
      if (action === "stop") app?.stop();
      if (action === "dispose") {
        app?.dispose();
        clearModel();
      }
      if (action === "rebuild") rebuild();
      if (action === "glb") void requestModel("/models/sample.glb");
      if (action === "gltf") void requestModel("/models/sample.gltf");
      if (action === "invalid-model") void requestModel("/models/invalid.gltf");
      if (action === "cancel-model") request?.abort();
      if (action === "remove-model") clearModel();
      if (action === "width") {
        narrow = !narrow;
        viewport.style.width = narrow ? "66%" : "100%";
        button("width").setAttribute("aria-pressed", String(narrow));
      }
      if (action === "zero") {
        zero = !zero;
        viewport.style.height = zero ? "0px" : "340px";
        button("zero").setAttribute("aria-pressed", String(zero));
      }
      refresh();
    } catch (error) {
      report(error);
    }
  };
  card.addEventListener("click", click);
  const interval = window.setInterval(refresh, 150);
  rebuild();
  teardown.push(() => {
    window.clearInterval(interval);
    card.removeEventListener("click", click);
    app?.dispose();
    clearModel();
  });
}

mountPanel("A", 0x8cdcc1);
mountPanel("B", 0xe8b178);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const cleanup of teardown) cleanup();
  });
