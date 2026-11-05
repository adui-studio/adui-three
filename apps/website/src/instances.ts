import "./style.css";
import { ThreeApp } from "@adui/three";
import { createInstancedMesh } from "@adui/three/geometry";
import type { InstancedMeshHandle } from "@adui/three/geometry";
import { attachPicking } from "@adui/three/interaction";
import { BoxGeometry, Color, Matrix4, MeshBasicMaterial } from "three";

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML = `<div class="shell">
  <header class="topbar"><a class="brand" href="/">adui<span>/</span>three</a><span class="version">INSTANCING</span><a class="source" href="/">返回主场景 ↗</a></header>
  <main><section class="intro"><div class="eyebrow"><span class="dot"></span> INSTANCE PLAYGROUND</div><h1>共享形状，<br><span>独立实例数据。</span></h1><p>25 个立方体，共用几何体和材质。<br>按需绘制，点击查看原生实例编号。</p></section>
  <article class="scene-card" data-testid="instances">
    <div class="instances-stage" aria-label="实例化网格画布"></div>
    <div class="metrics"><div><span>INSTANCES</span><strong data-testid="instance-count">0</strong></div><div><span>DRAW CALLS</span><strong data-testid="instance-calls">0</strong></div><div><span>PICKED ID</span><strong data-testid="instance-picked">—</strong></div><div><span>HOVERED ID</span><strong data-testid="instance-hovered">—</strong></div></div>
    <div class="actions"><button data-action="all">显示全部</button><button data-action="one">仅首个</button><button data-action="zero">隐藏全部</button><button data-action="move">移动首个</button><button data-action="color">首个变绿</button><button data-action="remove">释放网格</button><button data-action="create">重建网格</button><button data-action="render">绘制一帧</button></div>
    <p class="model-feedback">红色为实例 0；其余实例为蓝色。释放网格后可复用相同几何体与材质重建。</p>
    <p class="model-feedback" role="alert" data-testid="instance-error" hidden></p>
  </article></main><footer><span>@adui/three · 本地开发预览，尚未发布</span><span>TypeScript / ESM / WebGL 2</span></footer>
</div>`;
const app = new ThreeApp(root.querySelector<HTMLDivElement>(".instances-stage")!);
app.camera.position.set(0, 0, 10);
app.camera.lookAt(0, 0, 0);
app.scene.background = new Color(0x101818);
const geometry = app.resources.track(new BoxGeometry(0.55, 0.55, 0.55));
const material = app.resources.track(new MeshBasicMaterial({ color: 0xffffff }));
let handle: InstancedMeshHandle | undefined;
const display = (name: string, value: string | number): void => {
  root.querySelector<HTMLElement>(`[data-testid="instance-${name}"]`)!.textContent = String(value);
};
const render = (): void => {
  app.render();
  display("count", handle && !handle.disposed ? handle.mesh.count : 0);
  display("calls", app.renderer.info.render.calls);
};
const create = (): void => {
  handle?.dispose();
  handle = createInstancedMesh(app, { geometry, material, capacity: 25 });
  const positions: Array<[number, number]> = [[0, 0]];
  for (let y = -2; y <= 2; y++)
    for (let x = -2; x <= 2; x++) if (x || y) positions.push([x * 0.9, y * 0.9]);
  for (const [index, [x, y]] of positions.entries()) {
    handle.setMatrixAt(index, new Matrix4().makeTranslation(x, y, 0));
    handle.setColorAt(index, new Color(index === 0 ? 0xff0000 : 0x0088ff));
  }
  handle.setCount(25);
  display("picked", "—");
  display("hovered", "—");
  render();
};
const picking = attachPicking(app, {
  objects: () => (handle && !handle.disposed ? [handle.mesh] : []),
});
picking.on("click", ({ intersection }) => display("picked", intersection?.instanceId ?? "—"));
picking.on("hover", ({ intersection }) => display("hovered", intersection?.instanceId ?? "—"));
const click = (event: MouseEvent): void => {
  const action = (event.target as Element).closest<HTMLButtonElement>("button")?.dataset.action;
  if (!action) return;
  try {
    if (action === "create") create();
    else if (action === "remove") {
      handle?.dispose();
      display("picked", "—");
      display("hovered", "—");
    } else if (handle && !handle.disposed) {
      if (action === "all") handle.setCount(25);
      if (action === "one") handle.setCount(1);
      if (action === "zero") handle.setCount(0);
      if (action === "move") handle.setMatrixAt(0, new Matrix4().makeTranslation(3, 0, 0));
      if (action === "color") handle.setColorAt(0, new Color(0x00ff00));
    }
    render();
  } catch (error) {
    const alert = root.querySelector<HTMLElement>('[data-testid="instance-error"]')!;
    alert.hidden = false;
    alert.textContent = String(error);
  }
};
root.addEventListener("click", click);
create();
const cleanup = (): void => {
  root.removeEventListener("click", click);
  app.dispose();
};
window.addEventListener("pagehide", cleanup, { once: true });
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    window.removeEventListener("pagehide", cleanup);
    cleanup();
  });
