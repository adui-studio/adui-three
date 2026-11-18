import "./style.css";
import { ThreeApp } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import { attachShadowLight } from "@adui/three/lighting";
import type { ShadowLightHandle } from "@adui/three/lighting";
import { attachEnvironment, createRoomEnvironment } from "@adui/three/environment";
import type { RoomEnvironmentAsset } from "@adui/three/environment";
import { attachRendererSettings, createEditorRenderPreset } from "@adui/three/rendering";
import type { RendererSettingsHandle, ToneMappingMode } from "@adui/three/rendering";
import { attachPostprocessing } from "@adui/three/postprocessing";
import type { PostprocessingHandle } from "@adui/three/postprocessing";
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  LinearToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
  Box3,
  BoxGeometry,
  Color,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PMREMGenerator,
  SphereGeometry,
  Vector3,
} from "three";
import type { WebGLCubeRenderTarget } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
const modes = {
  none: NoToneMapping,
  linear: LinearToneMapping,
  reinhard: ReinhardToneMapping,
  cineon: CineonToneMapping,
  "aces-filmic": ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
};
document.querySelector<HTMLDivElement>("#app")!.innerHTML =
  `<div class="shell"><header class="topbar"><a class="brand" href="/">adui<span>/</span>three</a><span class="version">EDITOR BASELINE</span><a class="source" href="/?demo=effects">光影特效 ↗</a></header><main><section class="intro"><div class="eyebrow"><span class="dot"></span> RENDER SETTINGS</div><h1>同一个场景，<br><span>校准光与色。</span></h1><p>采用 Three.js Editor 的 Neutral / 曝光 1 / PCF 基准。<br>左侧使用封装，右侧直接设置原生色调与 Room PMREM。</p></section><section class="workspace"></section><section class="notes"><div><span class="note-index">01 / COLOR</span><h2>七种原生色调</h2><p>先比较色调与曝光，再调整材质和光照。抗锯齿与反向深度在创建 renderer 时配置。</p></div><div><span class="note-index">02 / LIGHT</span><h2>Room 环境可选</h2><p>按需生成原生环境反射，与实时阴影共同作用。两侧场景和灯光相同，可独立操作。</p></div><div><span class="note-index">03 / SCOPE</span><h2>明确比较范围</h2><p>此页对照 WebGL 色调与 Room IBL；阴影使用同一灯光封装，不代表 Editor 全部功能。</p></div></section></main><footer><span>@adui/three · 尚未发布</span><a href="https://threejs.org/editor/">Three.js Editor ↗</a></footer></div>`;
function mount(id: string, native: boolean): void {
  const card = document.createElement("article");
  card.className = "scene-card";
  card.dataset.testid = "editor-" + id;
  card.innerHTML = `<div class="card-heading"><h2>${native ? "原生对照" : "@adui/three"}</h2><span>WebGL 2</span></div><div class="instances-stage" aria-label="配置画布 ${id}"></div><div class="actions projection-actions"><button data-action="reset">恢复 Editor 默认</button><button data-action="room">生成 Room 环境</button><button data-action="remove-room">清除 Room 环境</button><button data-action="pipeline">切换输出管线</button><button data-action="during">绘制中切换 AgX</button><button data-action="start">运行场景</button><button data-action="pause">暂停场景</button><button data-action="render">绘制一帧</button><button data-action="dispose">销毁场景</button><button data-action="rebuild">重建场景</button></div><label class="animation-timeline">色调<select aria-label="色调" data-setting="tone">${Object.keys(
    modes,
  )
    .map((m) => `<option value="${m}">${m}</option>`)
    .join(
      "",
    )}</select></label><label class="animation-timeline">曝光<input aria-label="曝光" data-setting="exposure" type="range" min="0" max="10" step=".1" value="1"><span data-value="exposure"></span></label><label class="animation-timeline">阴影<select aria-label="阴影" data-setting="shadow"><option value="basic">Basic</option><option value="pcf" selected>PCF</option><option value="vsm">VSM</option><option value="off">关闭阴影</option></select></label><p class="model-feedback">色调 <span data-value="tone"></span> · Room <span data-value="room">off</span> · 管线 <span data-value="pipeline">off</span> · <span data-value="host"></span></p><p class="model-feedback" role="alert" hidden></p>`;
  document.querySelector(".workspace")!.append(card);
  const stage = card.querySelector<HTMLDivElement>(".instances-stage")!;
  const setting = <T extends HTMLInputElement | HTMLSelectElement>(name: string) =>
    card.querySelector<T>(`[data-setting="${name}"]`)!;
  const show = (name: string, value: string): void => {
    card.querySelector<HTMLElement>(`[data-value="${name}"]`)!.textContent = value;
  };
  let app: ThreeApp,
    settings: RendererSettingsHandle | undefined,
    shadow: ShadowLightHandle,
    room: RoomEnvironmentAsset | undefined,
    target: WebGLCubeRenderTarget | undefined,
    post: PostprocessingHandle | undefined,
    box: Mesh,
    floor: Mesh,
    sphere: Mesh;
  const refresh = (): void => {
    show("tone", setting("tone").value);
    show("exposure", app.renderer.toneMappingExposure.toFixed(1));
    show("room", app.scene.environment ? "on" : "off");
    show("pipeline", post && !post.disposed ? "on" : "off");
    show("host", app.state);
    card.dataset.tone = String(app.renderer.toneMapping);
    card.dataset.exposure = String(app.renderer.toneMappingExposure);
    card.dataset.textures = String(app.renderer.info.memory.textures);
    card.dataset.geometries = String(app.renderer.info.memory.geometries);
    card.dataset.shadow = String(app.renderer.shadowMap.type);
    for (const button of card.querySelectorAll<HTMLButtonElement>("button"))
      button.disabled = app.state === "disposed" && button.dataset.action !== "rebuild";
  };
  const apply = (): void => {
    const toneMapping = setting("tone").value as ToneMappingMode,
      exposure = Number(setting("exposure").value);
    if (native) {
      app.renderer.toneMapping = modes[toneMapping];
      app.renderer.toneMappingExposure = exposure;
    } else settings!.configure({ toneMapping, exposure });
  };
  const shadows = (): void => {
    shadow?.dispose();
    const kind = setting("shadow").value;
    shadow = attachShadowLight(app, {
      bounds: new Box3(new Vector3(-5, -0.1, -5), new Vector3(5, 4, 5)),
      casters: [box, sphere],
      receivers: [floor, box, sphere],
      type: kind === "off" ? "pcf" : (kind as "basic" | "pcf" | "vsm"),
      direction: new Vector3(-5, 8, 4),
      mapSize: 1024,
    });
    shadow.setEnabled(kind !== "off");
  };
  const removeRoom = (): void => {
    room?.dispose();
    room = undefined;
    if (target) {
      app.scene.environment = null;
      app.resources.untrack(target);
      target.dispose();
      target = undefined;
    }
  };
  const rebuild = (): void => {
    app?.dispose();
    room = undefined;
    target = undefined;
    post = undefined;
    settings = undefined;
    const preset = createEditorRenderPreset();
    app = new ThreeApp(stage, { renderer: preset.renderer, maxPixelRatio: 1 });
    setting("tone").value = preset.color.toneMapping;
    setting("exposure").value = String(preset.color.exposure);
    setting("shadow").value = preset.shadows.type;
    if (!native) settings = attachRendererSettings(app, preset.color);
    apply();
    app.scene.background = new Color(0xe4e8ed);
    app.camera.position.set(7, 6, 9);
    app.camera.lookAt(0, 1, 0);
    const controls = attachOrbitControls(app);
    controls.controls.target.set(0, 1, 0);
    controls.controls.update();
    app.scene.add(new HemisphereLight(0xc5ddff, 0x58626e, 0.5));
    floor = new Mesh(
      app.resources.track(new PlaneGeometry(13, 12)),
      app.resources.track(new MeshStandardMaterial({ color: 0xc5c9ce, roughness: 0.85 })),
    );
    floor.rotation.x = -Math.PI / 2;
    box = new Mesh(
      app.resources.track(new BoxGeometry(1.8, 2, 1.8)),
      app.resources.track(new MeshStandardMaterial({ color: 0xd9894d, roughness: 0.6 })),
    );
    box.position.set(-1.4, 1, 0);
    sphere = new Mesh(
      app.resources.track(new SphereGeometry(1, 32, 24)),
      app.resources.track(
        new MeshStandardMaterial({ color: 0xa8c5de, metalness: 0.9, roughness: 0.18 }),
      ),
    );
    sphere.position.set(1.5, 1, 0);
    app.scene.add(floor, box, sphere);
    shadows();
    app.onAfterRender(refresh);
    app.signal.addEventListener("abort", () => queueMicrotask(refresh), { once: true });
    app.render();
    refresh();
    card.querySelector<HTMLElement>('[role="alert"]')!.hidden = true;
  };
  card.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement))
      return;
    try {
      if (event.target.dataset.setting === "shadow") shadows();
      else apply();
      app.render();
      refresh();
    } catch (error) {
      report(error);
    }
  });
  const report = (error: unknown): void => {
    const output = card.querySelector<HTMLElement>('[role="alert"]')!;
    output.hidden = false;
    output.textContent = String(error);
  };
  card.addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLButtonElement>("button")?.dataset.action;
    if (!action) return;
    try {
      if (action === "rebuild") rebuild();
      else if (action === "dispose") app.dispose();
      else if (action === "start") app.start();
      else if (action === "pause") app.stop();
      else if (action === "reset") {
        setting("tone").value = "neutral";
        setting("exposure").value = "1";
        setting("shadow").value = "pcf";
        apply();
        shadows();
      } else if (action === "remove-room") removeRoom();
      else if (action === "room") {
        removeRoom();
        if (native) {
          const scene = new RoomEnvironment(),
            generator = new PMREMGenerator(app.renderer);
          try {
            target = app.resources.track(generator.fromScene(scene, 0.04));
            app.scene.environment = target.texture;
          } finally {
            generator.dispose();
            scene.dispose();
          }
        } else {
          room = createRoomEnvironment(app);
          attachEnvironment(app, room);
        }
      } else if (action === "pipeline") {
        if (post && !post.disposed) {
          post.dispose();
          post = undefined;
        } else post = attachPostprocessing(app, { colorAdjustment: {} });
      } else if (action === "during") {
        box.onBeforeRender = () => {
          box.onBeforeRender = () => {};
          setting("tone").value = "agx";
          setting("exposure").value = "2";
          apply();
        };
      }
      if (app.state !== "disposed") {
        app.render();
        if (action === "during") app.render();
      }
      refresh();
    } catch (error) {
      report(error);
    }
  });
  rebuild();
}
mount("a", false);
mount("b", true);
