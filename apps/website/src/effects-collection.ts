import "./style.css";
import { ThreeApp, OrthographicThreeApp } from "@adui/three";
import type { AnyThreeApp } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import {
  attachRipple,
  attachLightPillar,
  attachShield,
  attachFlyPoints,
  attachFlowLine,
} from "@adui/three/effects";
import type { EffectHandle, FlyPointsHandle } from "@adui/three/effects";
import { attachRendererSettings, createEditorRenderPreset } from "@adui/three/rendering";
import { attachPostprocessing } from "@adui/three/postprocessing";
import type { PostprocessingHandle } from "@adui/three/postprocessing";
import {
  BoxGeometry,
  Color,
  GridHelper,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Vector3,
} from "three";
document.querySelector<HTMLDivElement>("#app")!.innerHTML =
  `<div class="shell"><header class="topbar"><a class="brand" href="/">adui<span>/</span>three</a><span class="version">EFFECTS COLLECTION</span><a class="source" href="/?demo=effects">管道飞线 / 光墙 / 雷达 ↗</a></header><main><section class="intro"><div class="eyebrow"><span class="dot"></span> COMMON EFFECTS</div><h1>标记位置，<br><span>点亮边界。</span></h1><p>点云飞线、路径流光、扩散波纹、光柱与能量护罩。<br>透视与正交视图，独立控制时间和泛光。</p></section><section class="workspace"></section><section class="notes"><div><span class="note-index">01 / RIPPLE</span><h2>扩散波纹</h2><p>适合选中区域、告警和位置提示。XZ 平面向外扩散，圈数与波宽可配置。</p></div><div><span class="note-index">02 / PILLAR</span><h2>流动光柱</h2><p>适合场景定位和设备状态标记。原点在底部，光束沿局部 Y 轴向上延伸。</p></div><div><span class="note-index">03 / SHIELD</span><h2>能量护罩</h2><p>球形网格叠加视角边缘高光和流动脉冲，可组合原生泛光。</p></div></section></main><footer><span>@adui/three · 本地演示，尚未发布</span><a href="/?demo=editor">Editor 配置基准 ↗</a></footer></div>`;
function mount(id: string, orthographic: boolean): () => void {
  const card = document.createElement("article");
  card.className = "scene-card";
  card.dataset.testid = "collection-" + id;
  card.dataset.projection = orthographic ? "orthographic" : "perspective";
  card.innerHTML = `<div class="card-heading"><h2>${orthographic ? "正交场景" : "透视场景"}</h2><span>POINTS / FLOW / GLOW</span></div><div class="instances-stage" aria-label="特效画布 ${id}"></div><div class="actions projection-actions"><button data-action="pause-effects">暂停特效</button><button data-action="resume-effects">继续特效</button><button data-action="bloom">切换泛光</button><button data-action="release">绘制中释放特效</button><button data-action="create">重建特效</button><button data-action="start">运行场景</button><button data-action="stop">暂停场景</button><button data-action="render">绘制一帧</button><button data-action="dispose">销毁场景</button><button data-action="rebuild">重建场景</button></div><label class="animation-timeline">显示<select aria-label="显示特效" data-setting="visible"><option value="all">全部</option><option value="ripple">扩散波纹</option><option value="pillar">光柱</option><option value="shield">能量护罩</option><option value="points">点云飞线</option><option value="flow">路径流光</option><option value="none">隐藏特效</option></select></label><label class="animation-timeline">定位<input aria-label="特效定位" data-setting="phase" type="range" min="0" max="100" step="1" value="15"></label><label class="animation-timeline">倍速<input aria-label="特效倍速" data-setting="speed" type="range" min="0" max="2" step=".25" value=".25"></label><p class="model-feedback">特效 <span data-value="state"></span> · 进度 <span data-value="phase"></span> · 泛光 <span data-value="bloom">off</span> · 宿主 <span data-value="host"></span></p><p class="model-feedback" role="alert" hidden></p>`;
  document.querySelector(".workspace")!.append(card);
  const stage = card.querySelector<HTMLDivElement>(".instances-stage")!;
  const field = (name: string) =>
    card.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-setting="${name}"]`)!;
  const show = (name: string, value: string): void => {
    card.querySelector<HTMLElement>(`[data-value="${name}"]`)!.textContent = value;
  };
  let app: AnyThreeApp,
    effects: Array<EffectHandle | FlyPointsHandle> = [],
    post: PostprocessingHandle | undefined,
    frames = 0;
  const node = (handle: EffectHandle | FlyPointsHandle) =>
    "mesh" in handle ? handle.mesh : handle.points;
  const selection = (): void => {
    const mode = field("visible").value;
    for (const [index, handle] of effects.entries())
      node(handle).visible =
        mode === "all" || mode === ["ripple", "pillar", "shield", "points", "flow"][index];
  };
  const refresh = (): void => {
    show("state", effects[0]?.state ?? "disposed");
    show("phase", (effects[0]?.phase ?? 0).toFixed(3));
    show("host", app.state);
    show("bloom", post && !post.disposed ? "on" : "off");
    card.dataset.frames = String(frames);
    card.dataset.points = String(app.renderer.info.render.points);
    card.dataset.geometries = String(app.renderer.info.memory.geometries);
    card.dataset.textures = String(app.renderer.info.memory.textures);
    card.dataset.programs = String(app.renderer.info.programs?.length ?? 0);
    for (const button of card.querySelectorAll<HTMLButtonElement>("button"))
      button.disabled = app.state === "disposed" && button.dataset.action !== "rebuild";
    for (const input of card.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select"))
      input.disabled = app.state === "disposed";
  };
  const create = (): void => {
    for (const handle of effects) handle.dispose();
    effects = [
      attachRipple(app, { radius: 1.65, rings: 3, width: 0.24, color: 0x55ffad, intensity: 3 }),
      attachLightPillar(app, { radius: 0.38, height: 3.5, color: 0xffad55, intensity: 3 }),
      attachShield(app, {
        radius: 1.3,
        color: 0x559dff,
        intensity: 3,
        opacity: 0.75,
        gridSegments: 16,
      }),
      attachFlyPoints(app, {
        curve: new QuadraticBezierCurve3(
          new Vector3(-4, 0.3, -2),
          new Vector3(0, 6, -2),
          new Vector3(4, 0.3, -2),
        ),
        count: 192,
        size: 7,
        tail: 0.35,
        color: 0x9fffff,
        intensity: 4,
      }),
      attachFlowLine(app, {
        curve: new QuadraticBezierCurve3(
          new Vector3(-4, 0.05, 2.5),
          new Vector3(0, 0.05, 1.5),
          new Vector3(4, 0.05, 2.5),
        ),
        width: 0.2,
        pulses: 3,
        tail: 0.4,
        color: 0xff66d9,
        intensity: 3,
      }),
    ];
    node(effects[0]!).position.set(-2.8, 0.035, 0);
    node(effects[1]!).position.set(0, 0.02, 0);
    node(effects[2]!).position.set(2.7, 1.3, 0);
    for (const handle of effects) {
      handle.seek(Number(field("phase").value) / 100);
      handle.setSpeed(Number(field("speed").value));
    }
    selection();
  };
  const rebuild = (): void => {
    app?.dispose();
    effects = [];
    post = undefined;
    frames = 0;
    const preset = createEditorRenderPreset();
    const options = { renderer: preset.renderer, maxPixelRatio: 1 };
    app = orthographic
      ? new OrthographicThreeApp(stage, { ...options, camera: { frustumHeight: 8 } })
      : new ThreeApp(stage, options);
    attachRendererSettings(app, preset.color);
    app.scene.background = new Color(0x09151c);
    app.camera.position.set(9, 8, 12);
    app.camera.lookAt(0, 1, 0);
    const orbit = attachOrbitControls(app);
    orbit.controls.target.set(0, 1, 0);
    orbit.controls.update();
    const floor = new Mesh(
      app.resources.track(new PlaneGeometry(18, 14)),
      app.resources.track(new MeshBasicMaterial({ color: 0x10252c })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    app.scene.add(floor);
    const grid = new GridHelper(16, 16, 0x34535e, 0x1c3640);
    app.resources.track(grid.geometry);
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
    for (const material of materials) app.resources.track(material);
    app.scene.add(grid);
    const object = new Mesh(
      app.resources.track(new BoxGeometry(0.8, 0.8, 0.8)),
      app.resources.track(new MeshBasicMaterial({ color: 0x26455e })),
    );
    object.position.set(2.7, 0.4, 0);
    app.scene.add(object);
    create();
    app.onAfterRender(() => {
      frames++;
      refresh();
    });
    app.signal.addEventListener("abort", () => queueMicrotask(refresh), { once: true });
    app.start();
    refresh();
    card.querySelector<HTMLElement>('[role="alert"]')!.hidden = true;
  };
  const report = (error: unknown): void => {
    const output = card.querySelector<HTMLElement>('[role="alert"]')!;
    output.hidden = false;
    output.textContent = String(error);
  };
  card.addEventListener("input", (event) => {
    const name = (event.target as HTMLInputElement | HTMLSelectElement).dataset.setting;
    try {
      if (name === "visible") selection();
      else
        for (const handle of effects)
          if (!handle.disposed) {
            if (name === "phase") {
              handle.pause();
              handle.seek(Number(field("phase").value) / 100);
            } else if (name === "speed") handle.setSpeed(Number(field("speed").value));
          }
      app.render();
      refresh();
    } catch (error) {
      report(error);
    }
  });
  card.addEventListener("click", (event) => {
    const name = (event.target as Element).closest<HTMLButtonElement>("button")?.dataset.action;
    if (!name) return;
    try {
      if (name === "rebuild") rebuild();
      else if (name === "dispose") app.dispose();
      else if (name === "start") app.start();
      else if (name === "stop") app.stop();
      else if (name === "create") create();
      else if (name === "pause-effects") {
        for (const handle of effects) if (!handle.disposed) handle.pause();
      } else if (name === "resume-effects") {
        for (const handle of effects) if (!handle.disposed) handle.resume();
      } else if (name === "bloom") {
        if (post && !post.disposed) {
          post.dispose();
          post = undefined;
        } else
          post = attachPostprocessing(app, {
            bloom: { strength: 0.9, radius: 0.4, threshold: 0.8 },
          });
      } else if (name === "release") {
        const target = effects.find((handle) => !handle.disposed && node(handle).visible);
        if (target)
          node(target).onBeforeRender = () => {
            node(target).onBeforeRender = () => {};
            for (const handle of effects) handle.dispose();
          };
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
const cleanup = [mount("a", false), mount("b", true)];
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const dispose of cleanup) dispose();
  });
