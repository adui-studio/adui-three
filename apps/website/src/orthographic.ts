import "./style.css";
import { OrthographicThreeApp, ThreeApp } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import { attachPicking } from "@adui/three/interaction";
import { attachDOMLabels } from "@adui/three/labels";
import {
  fitObject,
  fitOrthographicObject,
  transitionToObject,
  transitionOrthographicToObject,
  captureCameraView,
  restoreCameraView,
  transitionToCameraView,
} from "@adui/three/camera";
import type {
  CameraTransitionHandle,
  CameraView,
  CameraViewTransitionHandle,
  TransitionEasing,
} from "@adui/three/camera";
import { attachPostprocessing } from "@adui/three/postprocessing";
import type { PostprocessingHandle } from "@adui/three/postprocessing";
import { ACESFilmicToneMapping, BoxGeometry, Color, Group, Mesh, MeshBasicMaterial } from "three";
import type { Object3D } from "three";

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `<div class="shell">
  <header class="topbar"><a class="brand" href="/">adui<span>/</span>three</a><span class="version">CAMERA PROJECTION</span><a class="source" href="/">返回主场景 ↗</a></header>
  <main><section class="intro"><div class="eyebrow"><span class="dot"></span> ORTHOGRAPHIC PLAYGROUND</div><h1>改变距离，<br><span>看见投影差异。</span></h1><p>两个相同的方块，放在不同深度。<br>正交视图保持尺寸，透视视图呈现远近。</p></section>
  <section class="workspace" aria-label="相机投影比较"></section></main>
  <footer><span>@adui/three · 本地开发预览，尚未发布</span><span>滚轮缩放 · 右键平移 · 点击方块</span></footer></div>`;
const teardown: Array<() => void> = [];

for (const orthographic of [true, false]) {
  const kind = orthographic ? "orthographic" : "perspective";
  const card = document.createElement("article");
  card.className = "scene-card";
  card.dataset.testid = kind;
  card.innerHTML = `<div class="card-heading"><h2>${orthographic ? "正交相机" : "透视相机"}</h2><span data-testid="projection-state">—</span></div>
    <div class="stage"><div class="viewport" aria-label="${orthographic ? "正交" : "透视"}画布"><div class="label-overlay"></div></div></div>
    <div class="metrics"><div><span>ZOOM</span><strong data-testid="projection-zoom">1.000</strong></div><div><span>BLUE Z</span><strong data-testid="projection-depth">-5</strong></div><div><span>WIDTH</span><strong data-testid="projection-width">0</strong></div><div><span>HEIGHT</span><strong data-testid="projection-height">0</strong></div></div>
    <div class="actions projection-actions"><button data-action="save-view">保存视角</button><button data-action="restore-view">恢复视角</button><button data-action="smooth-view">平滑恢复视角</button><button data-action="cancel-view">取消视角恢复</button><button data-action="effects">组合效果</button><button data-action="bloom">泛光开关</button><button data-action="outline">描边开关</button><button data-action="fit">适配视角</button><button data-action="smooth">平滑取景</button><button data-action="easing" aria-pressed="false">下次匀速过渡</button><button data-action="cancel">取消过渡</button><button data-action="pause-camera">暂停相机</button><button data-action="resume-camera">继续相机</button><button data-action="pause-host">暂停场景</button><button data-action="start-host">运行场景</button><button data-action="large">放大模型</button><button data-action="depth">改变蓝色深度</button><button data-action="zoom">放大视图</button><button data-action="width">收窄容器</button><button data-action="zero">零高度</button><button data-action="render">绘制一帧</button><button data-action="dispose">销毁</button><button data-action="rebuild">重建</button></div>
    <p class="model-feedback">视图：<span data-testid="projection-view">未保存</span></p><p class="model-feedback">视角恢复：<span data-testid="projection-view-motion">idle</span> · <span data-testid="projection-view-progress">0.000</span></p><p class="model-feedback">效果：<span data-testid="projection-effects">idle</span> · 泛光 <span data-testid="projection-bloom">off</span> · 描边 <span data-testid="projection-outline">off</span></p><p class="model-feedback">过渡：<span data-testid="projection-motion">idle</span> · <span data-testid="projection-progress">0.000</span></p><p class="model-feedback">选中：<span data-testid="projection-picked">—</span> · <span data-testid="projection-error" role="alert"></span></p>`;
  root.querySelector(".workspace")!.appendChild(card);
  const viewport = card.querySelector<HTMLDivElement>(".viewport")!;
  const overlay = viewport.querySelector<HTMLDivElement>(".label-overlay")!;
  let app: ThreeApp | OrthographicThreeApp | undefined;
  let blue: Mesh | undefined;
  let content: Group | undefined, fit: (() => void) | undefined;
  let transition: (() => void) | undefined, motion: CameraTransitionHandle | undefined;
  let viewMotion: CameraViewTransitionHandle | undefined, smoothView: (() => void) | undefined;
  let effects: PostprocessingHandle | undefined, selected: Object3D | undefined;
  let savedView: string | undefined,
    saveView: (() => void) | undefined,
    restoreView: (() => void) | undefined;
  let fitting = false,
    large = false;
  let narrow = false,
    zero = false;
  let easing: TransitionEasing = "smoothstep";
  const show = (key: string, text: string): void => {
    card.querySelector<HTMLElement>(`[data-testid="projection-${key}"]`)!.textContent = text;
  };
  const refresh = (): void => {
    show("state", app?.state ?? "—");
    show("zoom", (app?.camera.zoom ?? 1).toFixed(3));
    show("depth", String(blue?.position.z ?? -5));
    show("width", String(app?.size.width ?? 0));
    show("height", String(app?.size.height ?? 0));
    show("motion", motion?.state ?? "idle");
    show("progress", (motion?.progress ?? 0).toFixed(3));
    show("view-motion", viewMotion?.state ?? "idle");
    show("view-progress", (viewMotion?.progress ?? 0).toFixed(3));
    show("effects", effects && !effects.disposed ? "active" : "idle");
    show("bloom", effects && !effects.disposed && effects.bloom?.enabled ? "on" : "off");
    show("outline", effects && !effects.disposed && effects.outline?.enabled ? "on" : "off");
    show("view", savedView ? "已保存" : "未保存");
    card
      .querySelector('[data-action="easing"]')!
      .setAttribute("aria-pressed", String(easing === "linear"));
    for (const button of card.querySelectorAll<HTMLButtonElement>("button")) {
      button.disabled = button.dataset.action !== "rebuild" && (!app || app.state === "disposed");
      if (["bloom", "outline"].includes(button.dataset.action ?? ""))
        button.disabled ||= !effects || effects.disposed;
      if (["restore-view", "smooth-view"].includes(button.dataset.action ?? ""))
        button.disabled ||= !savedView;
    }
  };
  const rebuild = (): void => {
    app?.dispose();
    motion = undefined;
    viewMotion = undefined;
    effects = undefined;
    selected = undefined;
    app = orthographic
      ? new OrthographicThreeApp(viewport, { camera: { frustumHeight: 6, far: 100 } })
      : new ThreeApp(viewport, {
          camera: { fov: 33.4, near: 0.1, far: 100, position: [0, 0, 10] },
        });
    app.scene.background = new Color(0x101a20);
    app.renderer.toneMapping = ACESFilmicToneMapping;
    const geometry = app.resources.track(new BoxGeometry(1.4, 1.4, 1.4));
    const redMaterial = app.resources.track(new MeshBasicMaterial({ color: 0xff3838 }));
    const blueMaterial = app.resources.track(new MeshBasicMaterial({ color: 0x3878ff }));
    const red = new Mesh(geometry, redMaterial);
    blue = new Mesh(geometry, blueMaterial);
    red.name = "红色方块";
    blue.name = "蓝色方块";
    red.position.set(-1.5, 0, 0);
    blue.position.set(1.5, 0, -5);
    content = new Group();
    content.add(red, blue);
    app.scene.add(content);
    large = false;
    const controls = attachOrbitControls(app).controls;
    controls.enableRotate = false;
    controls.minZoom = 0.001;
    controls.maxZoom = 3;
    const labels = attachDOMLabels(app, overlay);
    for (const object of [red, blue]) {
      const element = document.createElement("span");
      element.className = "object-label";
      element.dataset.testid = object === red ? "projection-red-label" : "projection-blue-label";
      element.textContent = object.name;
      labels.add({ object, element, offset: [0, 0.95, 0], anchor: [0.5, 1] });
    }
    attachPicking(app, { objects: () => [red, blue!] }).on("click", ({ intersection }) => {
      selected = intersection?.object;
      show("picked", selected?.name ?? "—");
      if (effects?.outline && !effects.disposed)
        effects.outline.selectedObjects = selected ? [selected] : [];
      if (app?.state !== "running") app?.render();
    });
    const host = app;
    saveView = () => {
      savedView = JSON.stringify(captureCameraView(host, { controls }));
    };
    restoreView = () => {
      if (!savedView) return;
      fitting = true;
      try {
        restoreCameraView(host, JSON.parse(savedView) as CameraView, { controls });
      } finally {
        fitting = false;
      }
    };
    smoothView = () => {
      if (!savedView) return;
      fitting = true;
      try {
        const current = transitionToCameraView(host, JSON.parse(savedView) as CameraView, {
          controls,
          duration: 1.2,
          easing,
        });
        viewMotion = current;
        void current.finished.then((result) => {
          if (viewMotion !== current) return;
          if (result.status === "failed") show("error", String(result.error));
          refresh();
        });
      } finally {
        fitting = false;
      }
    };
    const draw = (): void => {
      host.render();
      refresh();
    };
    fit = () => {
      fitting = true;
      try {
        if (host instanceof OrthographicThreeApp)
          fitOrthographicObject(host, content!, { controls });
        else fitObject(host, content!, { controls });
      } finally {
        fitting = false;
      }
    };
    transition = () => {
      fitting = true;
      try {
        const current =
          host instanceof OrthographicThreeApp
            ? transitionOrthographicToObject(host, content!, { controls, duration: 1.2, easing })
            : transitionToObject(host, content!, { controls, duration: 1.2, easing });
        motion = current;
        void current.finished.then((result) => {
          if (motion !== current) return;
          if (result.status === "failed") show("error", String(result.error));
          refresh();
        });
      } finally {
        fitting = false;
      }
    };
    const changed = (): void => {
      if (!fitting && host.state !== "running") draw();
    };
    host.onAfterRender(refresh);
    controls.addEventListener("change", changed);
    host.resources.track({ dispose: () => controls.removeEventListener("change", changed) });
    const observer = new ResizeObserver(() => {
      if (host.state !== "disposed") draw();
    });
    observer.observe(viewport);
    host.resources.track({ dispose: () => observer.disconnect() });
    host.signal.addEventListener(
      "abort",
      () => {
        if (app === host) refresh();
      },
      { once: true },
    );
    show("picked", "—");
    show("error", "");
    draw();
  };
  card.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
    if (!button) return;
    try {
      if (button.dataset.action === "rebuild") {
        rebuild();
        return;
      }
      if (!app || app.state === "disposed") return;
      if (button.dataset.action === "easing")
        easing = easing === "linear" ? "smoothstep" : "linear";
      if (button.dataset.action === "save-view") saveView?.();
      if (button.dataset.action === "restore-view") restoreView?.();
      if (button.dataset.action === "smooth-view") {
        smoothView?.();
        app.start();
      }
      if (button.dataset.action === "cancel-view") viewMotion?.cancel();
      if (button.dataset.action === "pause-camera") {
        motion?.pause();
        viewMotion?.pause();
      }
      if (button.dataset.action === "resume-camera") {
        motion?.resume();
        viewMotion?.resume();
      }
      if (button.dataset.action === "effects") {
        if (effects && !effects.disposed) {
          effects.dispose();
          effects = undefined;
        } else
          effects = attachPostprocessing(app, {
            bloom: { threshold: 0.1, strength: 0.8, radius: 0.25 },
            outline: {
              selectedObjects: selected ? [selected] : [],
              edgeStrength: 5,
              visibleEdgeColor: 0xffff00,
              hiddenEdgeColor: 0xffff00,
            },
          });
      }
      if (button.dataset.action === "bloom" && effects?.bloom)
        effects.bloom.enabled = !effects.bloom.enabled;
      if (button.dataset.action === "outline" && effects?.outline)
        effects.outline.enabled = !effects.outline.enabled;
      if (button.dataset.action === "smooth") {
        transition?.();
        app.start();
      }
      if (button.dataset.action === "cancel") motion?.cancel();
      if (button.dataset.action === "pause-host") app.stop();
      if (button.dataset.action === "start-host") app.start();
      if (button.dataset.action === "fit") fit?.();
      if (button.dataset.action === "large" && content) {
        motion?.cancel();
        viewMotion?.cancel();
        large = !large;
        content.scale.setScalar(large ? 20 : 1);
      }
      if (button.dataset.action === "depth" && blue) {
        motion?.cancel();
        viewMotion?.cancel();
        blue.position.z = blue.position.z === -5 ? -10 : -5;
      }
      if (button.dataset.action === "zoom") {
        app.camera.zoom = app.camera.zoom === 1 ? 1.5 : 1;
        app.camera.updateProjectionMatrix();
      }
      if (button.dataset.action === "width") {
        narrow = !narrow;
        viewport.style.width = narrow ? "65%" : "100%";
        app.resize();
      }
      if (button.dataset.action === "zero") {
        zero = !zero;
        viewport.style.height = zero ? "0px" : "";
        app.resize();
      }
      if (button.dataset.action === "dispose") app.dispose();
      else app.render();
      refresh();
    } catch (error) {
      show("error", String(error));
    }
  });
  rebuild();
  teardown.push(() => app?.dispose());
}
window.addEventListener(
  "pagehide",
  () => {
    for (const dispose of teardown) dispose();
  },
  { once: true },
);
