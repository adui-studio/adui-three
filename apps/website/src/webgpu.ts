import "./style.css";
import { ThreeApp } from "@adui/three";
import type { PerspectiveSceneApp } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import { attachPicking } from "@adui/three/interaction";
import { attachDOMLabels } from "@adui/three/labels";
import { loadGLTF } from "@adui/three/loaders";
import { attachGLTFAnimations } from "@adui/three/animation";
import { fitObject } from "@adui/three/camera";
import { BoxGeometry, Color, Mesh, MeshBasicMaterial, Vector3 } from "three";

document.querySelector<HTMLDivElement>("#app")!.innerHTML =
  `<main><h1>双后端生命周期验证</h1><p role="status">准备中</p><div class="gpu-panels" style="display:flex;gap:16px"></div></main>`;
const root = document.querySelector<HTMLElement>(".gpu-panels")!;
const status = document.querySelector<HTMLElement>("[role=status]")!;
const backend = new URLSearchParams(location.search).get("backend") ?? "auto";
const lifetime = new AbortController();
async function mount(id: string): Promise<void> {
  const panel = document.createElement("section");
  panel.dataset.testid = id;
  panel.innerHTML = `<h2>${id}</h2><p data-backend></p><div class="gpu-stage" style="position:relative;width:360px;height:260px"><div class="gpu-canvas" style="width:100%;height:100%"></div><div class="gpu-labels" style="position:absolute;inset:0;pointer-events:none"></div></div><p data-metrics></p><button data-action="stop">暂停</button><button data-action="start">运行</button><button data-action="dispose">销毁</button><button data-action="rebuild">重建</button><button data-action="resize">收窄</button><button data-action="zero">零高度</button><button data-action="model">模型动画</button><p data-model>idle</p><p data-picked>未选择</p>`;
  root.append(panel);
  const container = panel.querySelector<HTMLElement>(".gpu-canvas")!;
  let app: PerspectiveSceneApp | undefined;
  let frames = 0;
  const create = async (): Promise<void> => {
    await app?.destroy();
    app =
      backend === "webgl"
        ? await ThreeApp.create(container, { renderer: { type: "webgl" }, signal: lifetime.signal })
        : await ThreeApp.create(container, {
            renderer: { type: "webgpu", allowFallback: backend !== "webgpu" },
            signal: lifetime.signal,
          });
    const host = app;
    panel.dataset.hostClass = String(host instanceof ThreeApp);
    frames = 0;
    host.scene.background = new Color(0x102030);
    const box = new Mesh(
      host.resources.track(new BoxGeometry()),
      host.resources.track(new MeshBasicMaterial({ color: 0xff4400 })),
    );
    host.scene.add(box);
    host.camera.position.set(0, 0, 5);
    host.camera.lookAt(0, 0, 0);
    const orbit = attachOrbitControls(host);
    const picking = attachPicking(host, { objects: () => [box] });
    picking.on("click", ({ intersection }) => {
      panel.querySelector("[data-picked]")!.textContent = intersection ? "已选择" : "未选择";
    });
    const labels = attachDOMLabels(host, panel.querySelector<HTMLElement>(".gpu-labels")!);
    const text = document.createElement("span");
    text.textContent = "立方体";
    labels.add({ object: box, element: text, offset: [0, 0.6, 0] });
    host.onAfterRender(() => {
      panel.dataset.frames = String(++frames);
      panel.querySelector("[data-metrics]")!.textContent =
        `${host.size.width}×${host.size.height} / ${host.size.pixelRatio}`;
      panel.dataset.state = host.state;
    });
    host.signal.addEventListener(
      "abort",
      () => {
        panel.dataset.state = host.state;
      },
      { once: true },
    );
    panel.querySelector("[data-backend]")!.textContent = host.backend;
    panel.querySelector("[data-model]")!.textContent = "idle";
    panel.querySelector<HTMLButtonElement>("[data-action=model]")!.onclick = () => {
      panel.querySelector("[data-model]")!.textContent = "loading";
      void loadGLTF(host, "/models/animated.glb")
        .then((model) => {
          box.visible = false;
          // Fixture uses an unlit material; no extra environment is needed.
          fitObject(host, model.scene, { controls: orbit.controls });
          const animation = attachGLTFAnimations(host, model);
          animation.play(0);
          const target = model.scene.children[0]!;
          const initial = target.position.clone();
          host.onUpdate(() => {
            panel.dataset.motion = String(target.position.distanceTo(initial));
          });
          panel.querySelector("[data-model]")!.textContent = "ready";
        })
        .catch((error) => {
          if (!host.signal.aborted) status.textContent = String(error);
        });
    };
    // Keep raw native objects available only in this regression app for pixel/loss probes.
    Object.assign(panel, {
      gpuApp: host,
      gpuBox: box,
      gpuOrbit: orbit.controls,
      gpuLabels: labels,
      gpuVector: new Vector3(),
    });
    host.start();
  };
  await create();
  panel.addEventListener(
    "click",
    (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset
        .action;
      if (!app) return;
      if (action === "stop") {
        app.stop();
        panel.dataset.state = app.state;
      }
      if (action === "start") app.start();
      if (action === "dispose") {
        void app.destroy().catch((error) => {
          status.textContent = String(error);
        });
      }
      if (action === "rebuild")
        void create().catch((error) => {
          status.textContent = String(error);
        });
      if (action === "resize") {
        container.style.width = container.style.width === "220px" ? "100%" : "220px";
      }
      if (action === "zero") {
        container.style.height = container.style.height === "0px" ? "100%" : "0px";
      }
    },
    { signal: lifetime.signal },
  );
}
try {
  await mount("gpu-a");
  await mount("gpu-b");
  status.textContent = "ready";
} catch (error) {
  status.textContent = String(error);
}
window.addEventListener(
  "pagehide",
  () => {
    lifetime.abort();
    for (const panel of root.children) {
      const host = Reflect.get(panel, "gpuApp") as PerspectiveSceneApp | undefined;
      void host?.destroy();
    }
  },
  { once: true },
);
