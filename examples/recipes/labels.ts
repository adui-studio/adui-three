// 独立用法：配合同目录 index.html，安装依赖后即可运行。
import { ThreeApp } from "@adui/three";
import { Color, HemisphereLight } from "three";
import { attachOrbitControls } from "@adui/three/controls";
import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import { attachDOMLabels } from "@adui/three/labels";

const container = document.querySelector<HTMLDivElement>("#app")!;
const tools = document.querySelector<HTMLDivElement>("#tools")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
export const app = await ThreeApp.create(container, {
  renderer: { type: "webgl" },
  camera: { position: [6, 4, 7] },
});
app.scene.background = new Color(0x101319);
app.scene.add(new HemisphereLight(0xd9efff, 0x45515b, 3));
const orbit = attachOrbitControls(app);
orbit.controls.target.set(0, 0, 0);
orbit.controls.update();

const cube = new Mesh(
  app.resources.track(new BoxGeometry(2, 2, 2)),
  app.resources.track(new MeshStandardMaterial({ color: 0x75c9af })),
);
app.scene.add(cube);
// 标签内容与样式由应用拥有，覆盖层独立于 canvas。
const overlay = document.createElement("div");
overlay.style.cssText = "position:absolute;inset:0;pointer-events:none";
container.append(overlay);
app.resources.track({ dispose: () => overlay.remove() });
const labels = attachDOMLabels(app, overlay);
const label = document.createElement("button");
label.textContent = "设备 A-01 · 查看详情";
label.addEventListener(
  "click",
  () => {
    status.textContent = "已选中设备 A-01";
  },
  { signal: app.signal },
);
labels.add({ object: cube, element: label, offset: [0, 1.2, 0], interactive: true });
const hint = document.createElement("span");
hint.textContent = "拖动旋转，点击三维标签查看状态。";
tools.append(hint);

app.start();
status.textContent = `示例已运行 · 实际后端：${app.backend}`;
// 页面结束时释放订阅、控件和自己拥有的 GPU 资源。
window.addEventListener(
  "pagehide",
  () => {
    void app.destroy();
  },
  { once: true },
);
