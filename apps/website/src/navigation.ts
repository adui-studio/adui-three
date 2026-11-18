import "./style.css";
import { ThreeApp } from "@adui/three";
import { createCollisionWorld } from "@adui/three/collision";
import { attachFirstPersonControls, attachThirdPersonControls } from "@adui/three/navigation";
import type { FirstPersonControlsHandle, ThirdPersonControlsHandle } from "@adui/three/navigation";
import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `<div class="shell"><header class="topbar"><a class="brand" href="/">adui<span>/</span>three</a><span class="version">CHARACTER CONTROLS</span><a class="source" href="/">返回主场景 ↗</a></header><main><section class="intro"><div class="eyebrow"><span class="dot"></span> NAVIGATION PLAYGROUND</div><h1>走进场景，<br><span>切换观察距离。</span></h1><p>WASD / 方向键移动，Shift 加速，空格跳跃。<br>第三人称点击画布，第一人称点击锁定；Esc 释放鼠标。</p></section><section class="workspace"></section></main><footer><span>@adui/three · 本地开发预览，尚未发布</span><span>PointerLockControls / OrbitControls / three-mesh-bvh</span></footer></div>`;
const workspace = root.querySelector<HTMLElement>(".workspace")!;
function mount(id: string, initial: "first" | "third") {
  const card = document.createElement("article");
  card.className = "scene-card";
  card.dataset.testid = `navigation-${id}`;
  card.innerHTML = `<div class="card-heading"><h2>场景 ${id.toUpperCase()}</h2><span data-value="mode"></span></div><div class="instances-stage" aria-label="角色控制画布 ${id}"></div><div class="metrics"><div><span>POSITION</span><strong data-value="position"></strong></div><div><span>SUPPORT</span><strong data-value="grounded"></strong></div><div><span>HOST</span><strong data-value="host"></strong></div></div><div class="actions"><button data-action="mode">切换视角</button><button data-action="lock">锁定鼠标</button><button data-action="forward">持续前进</button><button data-action="idle">停止移动</button><button data-action="jump">跳跃</button><button data-action="home">回到起点</button><button data-action="pause">暂停场景</button><button data-action="start">运行场景</button><button data-action="dispose">销毁场景</button><button data-action="rebuild">重建场景</button><button data-action="render">绘制一帧</button></div><p class="model-feedback">相机：<span data-value="camera"></span> · 鼠标：<span data-value="locked"></span> · 帧：<span data-value="frames"></span></p><p class="model-feedback" role="alert" hidden></p>`;
  workspace.append(card);
  let app: ThreeApp,
    handle: FirstPersonControlsHandle | ThirdPersonControlsHandle,
    actor: Group,
    mode = initial,
    frames = 0;
  const stage = card.querySelector<HTMLDivElement>(".instances-stage")!;
  const show = (name: string, value: string): void => {
    card.querySelector<HTMLElement>(`[data-value="${name}"]`)!.textContent = value;
  };
  const report = (error: unknown): void => {
    const node = card.querySelector<HTMLElement>('[role="alert"]')!;
    node.hidden = false;
    node.textContent = String(error);
  };
  const refresh = (): void => {
    const position = handle.position,
      camera = app.camera.position;
    show(
      "position",
      position
        .toArray()
        .map((v) => v.toFixed(3))
        .join(", "),
    );
    show(
      "camera",
      camera
        .toArray()
        .map((v) => v.toFixed(3))
        .join(", "),
    );
    show("mode", mode === "first" ? "第一人称" : "第三人称");
    show("grounded", handle.grounded ? "grounded" : "airborne");
    show("host", app.state);
    show("locked", "locked" in handle && handle.locked ? "locked" : "free");
    show("frames", String(frames));
    card.dataset.x = String(position.x);
    card.dataset.y = String(position.y);
    card.dataset.z = String(position.z);
    card.dataset.cameraZ = String(camera.z);
    card.dataset.forwardX = String(app.camera.getWorldDirection(new Vector3()).x);
    for (const button of card.querySelectorAll<HTMLButtonElement>("button")) {
      button.disabled = button.dataset.action !== "rebuild" && app.state === "disposed";
      if (button.dataset.action === "lock") button.disabled ||= mode !== "first";
    }
  };
  let world: ReturnType<typeof createCollisionWorld>;
  const attach = (): void => {
    handle?.dispose();
    actor.visible = mode === "third";
    app.camera.position.set(0, 1.6, 4);
    app.camera.quaternion.identity();
    const options = { world, position: new Vector3(0, 0.02, 4) };
    handle =
      mode === "first"
        ? attachFirstPersonControls(app, options)
        : attachThirdPersonControls(app, actor, options);
  };
  const rebuild = (): void => {
    app?.dispose();
    frames = 0;
    app = new ThreeApp(stage);
    app.scene.background = new Color(0x101b20);
    const obstacles: Mesh[] = [];
    const box = (
      size: [number, number, number],
      position: [number, number, number],
      color: number,
    ): void => {
      const geometry = app.resources.track(new BoxGeometry(...size)),
        material = app.resources.track(new MeshBasicMaterial({ color }));
      const mesh = new Mesh(geometry, material);
      mesh.position.set(...position);
      app.scene.add(mesh);
      obstacles.push(mesh);
    };
    box([20, 1, 20], [0, -0.5, 0], 0x29453e);
    box([12, 3, 0.5], [0, 1.5, 0], 0x638784);
    box([12, 3, 0.5], [0, 1.5, 6], 0x334d60);
    box([0.5, 3, 8], [5, 1.5, 3], 0x42615d);
    world = app.resources.track(createCollisionWorld(obstacles));
    actor = new Group();
    const shape = app.resources.track(new CapsuleGeometry(0.3, 1.2, 4, 8)),
      material = app.resources.track(new MeshBasicMaterial({ color: 0xffa04a }));
    const mesh = new Mesh(shape, material);
    mesh.position.y = 0.9;
    actor.add(mesh);
    app.scene.add(actor);
    attach();
    app.onAfterRender(() => {
      frames++;
      refresh();
    });
    app.signal.addEventListener("abort", () => queueMicrotask(refresh), { once: true });
    app.start();
    refresh();
    const alert = card.querySelector<HTMLElement>('[role="alert"]')!;
    alert.hidden = true;
  };
  card.addEventListener("click", (event) => {
    const action = (event.target as Element).closest<HTMLButtonElement>("button")?.dataset.action;
    if (!action) return;
    try {
      if (action === "rebuild") rebuild();
      else if (action === "mode") {
        mode = mode === "first" ? "third" : "first";
        attach();
      } else if (action === "lock" && "lock" in handle) void handle.lock().then(refresh, report);
      else if (action === "forward") handle.setInput({ forward: 1 });
      else if (action === "idle") handle.clearInput();
      else if (action === "jump") handle.jump();
      else if (action === "home") handle.teleport(new Vector3(0, 0.02, 4));
      else if (action === "pause") {
        if ("unlock" in handle) handle.unlock();
        app.stop();
      } else if (action === "start") app.start();
      else if (action === "dispose") app.dispose();
      if (app.state !== "disposed") app.render();
      refresh();
    } catch (error) {
      report(error);
    }
  });
  rebuild();
  return () => app.dispose();
}
const disposers = [mount("a", "third"), mount("b", "first")];
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const dispose of disposers) dispose();
  });
