import "./style.css";
import { ResourceScope, ThreeApp } from "@adui/three";
import { followPath } from "@adui/three/animation";
import type { PathMotionHandle } from "@adui/three/animation";
import { attachOrbitControls } from "@adui/three/controls";
import { fitObject } from "@adui/three/camera";
import { attachPicking } from "@adui/three/interaction";
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `<div class="shell">
  <header class="topbar"><a class="brand" href="/">adui<span>/</span>three</a><span class="version">PATH MOTION</span><a class="source" href="/">返回主场景 ↗</a></header>
  <main><section class="intro"><div class="eyebrow"><span class="dot"></span> PATH PLAYGROUND</div><h1>沿着路径，<br><span>保持独立节奏。</span></h1><p>橙色与绿色箭头共享曲线，各自控制。<br>暂停一条路径，另一条继续前进。</p></section>
  <article class="scene-card" data-testid="path-demo"><div class="instances-stage" aria-label="路径运动画布"></div>
    <div class="metrics"><div><span>PATH A</span><strong data-testid="path-state">—</strong></div><div><span>PROGRESS</span><strong data-testid="path-progress">0.000</strong></div><div><span>PATH B</span><strong data-testid="path-peer-progress">0.000</strong></div><div><span>SCENE</span><strong data-testid="path-host">—</strong></div></div>
    <div class="actions"><button data-action="once">播放一次</button><button data-action="repeat">循环路径</button><button data-action="pingpong">往返路径</button><button data-action="repeat-twice">循环两次</button><button data-action="pingpong-once">往返一次</button><button data-action="pause">暂停路径</button><button data-action="resume">继续路径</button><button data-action="cancel">取消路径</button><button data-action="stop-host">暂停场景</button><button data-action="start-host">运行场景</button><button data-action="move">手动移动</button><button data-action="remove">移除目标</button><button data-action="rebuild-target">重建目标</button><button data-action="dispose">销毁场景</button><button data-action="rebuild">重建场景</button><button data-action="render">绘制一帧</button></div>
    <p class="model-feedback">路径 A 每程 2 s；往返一次含两程。A 位置：<span data-testid="path-position">—</span> · 结束原因：<span data-testid="path-result">—</span> · 选中：<span data-testid="path-picked">—</span></p>
    <label class="animation-timeline">路径 A 定位<input type="range" min="0" max="100" step="1" value="0" data-action="seek" aria-label="路径 A 定位"></label>
    <p class="model-feedback" role="alert" data-testid="path-error" hidden></p>
  </article></main><footer><span>@adui/three · 本地开发预览，尚未发布</span><span>TypeScript / ESM / WebGL 2</span></footer></div>`;
let app: ThreeApp | undefined,
  motion: PathMotionHandle | undefined,
  peer: PathMotionHandle | undefined;
let marker: Mesh | undefined, lane: Group | undefined, owner: ResourceScope | undefined;
let geometry: ConeGeometry | undefined, material: MeshBasicMaterial | undefined;
let curve: CatmullRomCurve3 | undefined;
const viewport = root.querySelector<HTMLDivElement>(".instances-stage")!;
const display = (name: string, value: string): void => {
  root.querySelector<HTMLElement>(`[data-testid="path-${name}"]`)!.textContent = value;
};
const refresh = (): void => {
  display("state", motion?.state ?? "—");
  display("progress", (motion?.progress ?? 0).toFixed(3));
  display("peer-progress", (peer?.progress ?? 0).toFixed(3));
  display("host", app?.state ?? "—");
  const timeline = root.querySelector<HTMLInputElement>('[data-action="seek"]')!;
  timeline.disabled =
    !app || app.state === "disposed" || !motion || !["running", "paused"].includes(motion.state);
  timeline.value = String(Math.round((motion?.progress ?? 0) * 100));
  display(
    "position",
    marker?.position
      .toArray()
      .map((value) => value.toFixed(3))
      .join(", ") ?? "—",
  );
  for (const button of root.querySelectorAll<HTMLButtonElement>("button")) {
    const action = button.dataset.action;
    button.disabled = action !== "rebuild" && (!app || app.state === "disposed");
    if (
      ["once", "repeat", "pingpong", "repeat-twice", "pingpong-once", "move", "remove"].includes(
        action ?? "",
      )
    )
      button.disabled ||= !marker?.parent;
  }
};
const report = (error: unknown): void => {
  const element = root.querySelector<HTMLElement>('[data-testid="path-error"]')!;
  element.hidden = false;
  element.textContent = String(error);
};
const play = (loop: "once" | "repeat" | "pingpong", repetitions?: number): void => {
  if (!app || !marker || !curve || !owner) return;
  const next = followPath(app, marker, {
    curve,
    duration: 2,
    loop,
    repetitions,
    orientToPath: true,
    scope: owner,
  });
  motion = next;
  display("result", "—");
  void next.finished.then((result) => {
    if (motion !== next) return;
    display("result", result.status === "cancelled" ? result.reason : result.status);
    if (result.status === "failed") report(result.error);
    refresh();
  });
  app.render();
  refresh();
};
const rebuildTarget = (): void => {
  if (!app || app.state === "disposed" || !geometry || !material || !lane) return;
  owner?.dispose();
  if (owner) app.resources.untrack(owner);
  marker?.removeFromParent();
  marker?.dispose();
  owner = app.resources.track(new ResourceScope());
  marker = new Mesh(geometry, material);
  marker.name = "路径 A";
  lane.add(marker);
  play("repeat");
};
const rebuild = (): void => {
  app?.dispose();
  app = new ThreeApp(viewport);
  app.scene.background = new Color(0x101818);
  app.camera.position.set(0, 7, 13);
  app.camera.lookAt(0, 0, 0);
  const controls = attachOrbitControls(app);
  curve = new CatmullRomCurve3(
    [
      new Vector3(-1.5, 0, -1.5),
      new Vector3(1.5, 0.7, -1),
      new Vector3(1.5, 0, 1.5),
      new Vector3(-1.5, 0.7, 1.5),
    ],
    true,
  );
  geometry = app.resources.track(new ConeGeometry(0.22, 0.65, 10).rotateX(Math.PI / 2));
  material = app.resources.track(new MeshBasicMaterial({ color: 0xffa04a }));
  const peerMaterial = app.resources.track(new MeshBasicMaterial({ color: 0x8cdcc1 }));
  const pathGeometry = app.resources.track(
    new BufferGeometry().setFromPoints(curve.getPoints(120)),
  );
  const lineMaterial = app.resources.track(new LineBasicMaterial({ color: 0x4c8074 }));
  const group = new Group();
  lane = new Group();
  lane.position.x = -2.2;
  const other = new Group();
  other.position.x = 2.2;
  group.add(lane, other);
  app.scene.add(group);
  lane.add(new Line(pathGeometry, lineMaterial));
  other.add(new Line(pathGeometry, lineMaterial));
  const second = new Mesh(geometry, peerMaterial);
  second.name = "路径 B";
  other.add(second);
  peer = followPath(app, second, { curve, duration: 5, loop: "repeat", orientToPath: true });
  rebuildTarget();
  fitObject(app, group, { controls: controls.controls });
  const picking = attachPicking(app, {
    objects: () => (marker?.parent ? [marker, second] : [second]),
  });
  picking.on("click", ({ intersection }) => display("picked", intersection?.object.name ?? "—"));
  app.onAfterRender(refresh);
  app.signal.addEventListener("abort", () => queueMicrotask(refresh), { once: true });
  app.start();
  refresh();
};
const click = (event: MouseEvent): void => {
  const action = (event.target as Element).closest<HTMLButtonElement>("button")?.dataset.action;
  if (!action) return;
  try {
    if (action === "rebuild") rebuild();
    else if (action === "dispose") app?.dispose();
    else if (action === "once" || action === "repeat" || action === "pingpong") play(action);
    else if (action === "repeat-twice") play("repeat", 2);
    else if (action === "pingpong-once") play("pingpong", 2);
    else if (action === "pause") motion?.pause();
    else if (action === "resume") motion?.resume();
    else if (action === "cancel") motion?.cancel();
    else if (action === "stop-host") app?.stop();
    else if (action === "start-host") app?.start();
    else if (action === "move" && marker) marker.position.x += 0.4;
    else if (action === "remove") marker?.removeFromParent();
    else if (action === "rebuild-target") rebuildTarget();
    if (app?.state !== "disposed") app?.render();
    refresh();
  } catch (error) {
    report(error);
  }
};
root.addEventListener("click", click);
const seek = (event: Event): void => {
  const input = event.target;
  if (
    !(input instanceof HTMLInputElement) ||
    input.dataset.action !== "seek" ||
    !motion ||
    !app ||
    app.state === "disposed"
  )
    return;
  try {
    motion.seek(input.valueAsNumber / 100);
    app.render(); // Consumer explicitly presents the sampled pose; the library never draws or starts.
    refresh();
  } catch (error) {
    report(error);
  }
};
root.addEventListener("input", seek);
rebuild();
const cleanup = (): void => {
  root.removeEventListener("click", click);
  root.removeEventListener("input", seek);
  app?.dispose();
};
window.addEventListener("pagehide", cleanup, { once: true });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    window.removeEventListener("pagehide", cleanup);
    cleanup();
  });
