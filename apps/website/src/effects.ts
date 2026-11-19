import "./style.css";
import { ThreeApp } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import { attachFlyLine, attachLightWall, attachRadar } from "@adui/three/effects";
import type { EffectHandle } from "@adui/three/effects";
import { attachShadowLight } from "@adui/three/lighting";
import type { ShadowLightHandle } from "@adui/three/lighting";
import { attachPostprocessing } from "@adui/three/postprocessing";
import {
  ACESFilmicToneMapping,
  Box3,
  BoxGeometry,
  Color,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  QuadraticBezierCurve3,
  SphereGeometry,
  Vector3,
} from "three";
const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `<div class="shell"><header class="topbar"><a class="brand" href="/">adui<span>/</span>three</a><span class="version">LIGHT & MOTION</span><a class="source" href="/">返回主场景 ↗</a></header><main><section class="intro"><div class="eyebrow"><span class="dot"></span> EFFECTS PLAYGROUND</div><h1>让光影，<br><span>回应空间。</span></h1><p>飞线、光墙与雷达，搭配原生实时阴影。<br>逐项开关，对比滤镜与柔和边缘。</p></section><section class="workspace"></section></main><footer><span>@adui/three · 本地开发预览，尚未发布</span><span>WebGL 2 / PCF · VSM / ShaderPass</span></footer></div>`;
const workspace = root.querySelector<HTMLElement>(".workspace")!;
function mount(id: string, neon: boolean) {
  const card = document.createElement("article");
  card.className = "scene-card";
  card.dataset.testid = "effects-" + id;
  card.innerHTML = `<div class="card-heading"><h2>${neon ? "流动的光" : "柔和的阴影"}</h2><span data-value="shadow-kind"></span></div><div class="instances-stage" aria-label="光影画布 ${id}"></div><div class="actions projection-actions"><button data-action="effects">切换特效</button><button data-action="pause-effects">暂停特效</button><button data-action="resume-effects">继续特效</button><button data-action="shadow">切换阴影</button><button data-action="shadow-kind">切换 PCF/VSM</button><button data-action="gray">灰度滤镜</button><button data-action="grade">电影色调</button><button data-action="reset-grade">原始色调</button><button data-action="move">移动模型</button><button data-action="release-effects">绘制中释放特效</button><button data-action="release-shadow">绘制中释放阴影</button><button data-action="rebuild-shadow">重建阴影</button><button data-action="pause">暂停场景</button><button data-action="start">运行场景</button><button data-action="dispose">销毁场景</button><button data-action="rebuild">重建场景</button><button data-action="render">绘制一帧</button></div><label class="animation-timeline">特效定位<input aria-label="特效定位" data-setting="phase" type="range" min="0" max="100" step="1" value="0"></label><label class="animation-timeline">特效倍速<input aria-label="特效倍速" data-setting="speed" type="range" min="0" max="2" step=".25" value=".25"></label><label class="animation-timeline">阴影法线偏移<input aria-label="阴影法线偏移" data-setting="bias" type="range" min="0" max="100" step="1" value="20"></label><label class="animation-timeline">阴影柔和度<input aria-label="阴影柔和度" data-setting="radius" type="range" min="0" max="8" step=".5" value="2"></label><p class="model-feedback">特效：<span data-value="effect-state"></span> · 进度：<span data-value="phase"></span> · 阴影：<span data-value="shadow"></span> · 场景：<span data-value="host"></span></p><p class="model-feedback" role="alert" hidden></p>`;
  workspace.append(card);
  let app: ThreeApp,
    effects: EffectHandle[] = [],
    shadow: ShadowLightHandle,
    kind: "pcf" | "vsm" = "pcf",
    group: Group,
    floor: Mesh,
    box: Mesh,
    visible = neon,
    post: ReturnType<typeof attachPostprocessing>;
  const stage = card.querySelector<HTMLDivElement>(".instances-stage")!;
  const show = (name: string, value: string): void => {
    card.querySelector<HTMLElement>(`[data-value="${name}"]`)!.textContent = value;
  };
  const slider = (name: string) =>
    card.querySelector<HTMLInputElement>(`[data-setting="${name}"]`)!;
  const report = (error: unknown): void => {
    const node = card.querySelector<HTMLElement>('[role="alert"]')!;
    node.hidden = false;
    node.textContent = String(error);
  };
  const refresh = (): void => {
    show("effect-state", effects[0]?.state ?? "disposed");
    show("phase", (effects[0]?.phase ?? 0).toFixed(3));
    show("shadow-kind", kind.toUpperCase());
    show("shadow", shadow?.disposed ? "disposed" : shadow?.enabled ? "on" : "off");
    show("host", app.state);
    card.dataset.geometries = String(app.renderer.info.memory.geometries);
    card.dataset.textures = String(app.renderer.info.memory.textures);
    for (const button of card.querySelectorAll<HTMLButtonElement>("button"))
      button.disabled = button.dataset.action !== "rebuild" && app.state === "disposed";
  };
  const makeShadow = (): void => {
    shadow?.dispose();
    shadow = attachShadowLight(app, {
      bounds: new Box3(new Vector3(-6, -0.1, -5), new Vector3(6, 4, 5)),
      casters: [group],
      receivers: [floor, group],
      direction: new Vector3(-5, 8, 4),
      type: kind,
      mapSize: 2048,
      radius: Number(slider("radius").value),
      normalBias: Number(slider("bias").value) / 1000,
    });
  };
  const grade = (brightness: number, contrast: number, hue: number, saturation: number): void => {
    post.configure({ colorAdjustment: { brightness, contrast, hue, saturation } });
  };
  const rebuild = (): void => {
    app?.dispose();
    kind = "pcf";
    visible = neon;
    app = new ThreeApp(stage);
    app.renderer.toneMapping = ACESFilmicToneMapping;
    app.scene.background = new Color(neon ? 0x0b141b : 0xe6e9ef);
    app.camera.position.set(9, 8, 11);
    app.camera.lookAt(0, 1, 0);
    const orbit = attachOrbitControls(app);
    orbit.controls.target.set(0, 1, 0);
    orbit.controls.update();
    app.scene.add(app.resources.track(new HemisphereLight(0xc5ddff, 0x58626e, neon ? 0.7 : 1.2)));
    floor = new Mesh(
      app.resources.track(new PlaneGeometry(16, 14)),
      app.resources.track(
        new MeshStandardMaterial({ color: neon ? 0x24363d : 0xdbdfe4, roughness: 0.9 }),
      ),
    );
    floor.rotation.x = -Math.PI / 2;
    app.scene.add(floor);
    group = new Group();
    app.scene.add(group);
    box = new Mesh(
      app.resources.track(new BoxGeometry(1.8, 2, 1.8)),
      app.resources.track(new MeshStandardMaterial({ color: 0xd9894d, roughness: 0.6 })),
    );
    box.position.set(-1, 1, -0.5);
    group.add(box);
    const sphere = new Mesh(
      app.resources.track(new SphereGeometry(0.9, 32, 20)),
      app.resources.track(
        new MeshStandardMaterial({ color: 0x8bafce, roughness: 0.35, metalness: 0.15 }),
      ),
    );
    sphere.position.set(1.7, 1, 0);
    group.add(sphere);
    effects = [
      attachFlyLine(app, {
        curve: new QuadraticBezierCurve3(
          new Vector3(-4, 0.2, 2),
          new Vector3(0, 6, -2),
          new Vector3(4, 0.2, 2),
        ),
        color: 0x6adfff,
        radius: 0.065,
        intensity: 3,
      }),
      attachLightWall(app, {
        points: [
          new Vector3(-3, 0.03, -2),
          new Vector3(-3, 0.03, 2),
          new Vector3(3, 0.03, 2),
          new Vector3(3, 0.03, -2),
        ],
        closed: true,
        cornerTrim: 0.3,
        height: 1.3,
        color: 0x368cf1,
        opacity: 0.55,
      }),
      attachRadar(app, { radius: 1.8, color: 0x60f3ab, opacity: 0.8 }),
    ];
    effects[2]!.mesh.position.set(2.5, 0.035, -2.5);
    for (const h of effects) h.mesh.visible = visible;
    makeShadow();
    post = attachPostprocessing(app, {
      bloom: { strength: 0.65, radius: 0.35, threshold: 1, enabled: neon },
      colorAdjustment: {},
    });
    app.onAfterRender(refresh);
    app.signal.addEventListener("abort", () => queueMicrotask(refresh), { once: true });
    app.start();
    refresh();
    card.querySelector<HTMLElement>('[role="alert"]')!.hidden = true;
  };
  card.addEventListener("input", (event) => {
    const name = (event.target as HTMLInputElement).dataset.setting;
    try {
      if (name === "phase") {
        for (const h of effects)
          if (!h.disposed) {
            h.pause();
            h.seek(Number(slider("phase").value) / 100);
          }
      } else if (name === "speed") {
        for (const h of effects) if (!h.disposed) h.setSpeed(Number(slider("speed").value));
      } else if (!shadow.disposed) {
        shadow.light.shadow.normalBias = Number(slider("bias").value) / 1000;
        shadow.light.shadow.radius = Number(slider("radius").value);
        shadow.requestUpdate();
      }
      if (app.state !== "disposed") app.render();
      refresh();
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
      else if (action === "effects") {
        visible = !visible;
        for (const h of effects) h.mesh.visible = visible;
      } else if (action === "pause-effects") {
        for (const h of effects) if (!h.disposed) h.pause();
      } else if (action === "resume-effects") {
        for (const h of effects) if (!h.disposed) h.resume();
      } else if (action === "shadow" && !shadow.disposed) shadow.setEnabled(!shadow.enabled);
      else if (action === "shadow-kind") {
        kind = kind === "pcf" ? "vsm" : "pcf";
        makeShadow();
      } else if (action === "rebuild-shadow") makeShadow();
      else if (action === "gray") grade(0, 0, 0, -1);
      else if (action === "grade") grade(0.025, 0.15, 0.08, 0.2);
      else if (action === "reset-grade") grade(0, 0, 0, 0);
      else if (action === "move") {
        box.position.x = box.position.x < 0 ? 1 : -1;
        if (!shadow.disposed) shadow.requestUpdate();
      } else if (action === "release-effects") {
        const target = effects.find((h) => !h.disposed);
        if (target) {
          target.mesh.visible = true;
          target.mesh.onBeforeRender = () => {
            for (const h of effects) h.dispose();
          };
        }
      } else if (action === "release-shadow" && !shadow.disposed) {
        box.onBeforeShadow = () => {
          box.onBeforeShadow = () => {};
          shadow.dispose();
        };
        shadow.requestUpdate();
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
const cleanup = [mount("a", true), mount("b", false)];
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const dispose of cleanup) dispose();
  });
