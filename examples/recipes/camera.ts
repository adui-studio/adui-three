// 独立用法：配合同目录 index.html，安装依赖后即可运行。
import { ThreeApp } from "@adui/three";
import { Color, HemisphereLight } from "three";
import { attachOrbitControls } from "@adui/three/controls";
import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import { captureCameraView, restoreCameraView, transitionToObject } from "@adui/three/camera";

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
  app.resources.track(new MeshStandardMaterial({ color: 0xe5ac75 })),
);
cube.position.x = 2;
app.scene.add(cube);
const view = captureCameraView(app, { controls: orbit.controls });
const focus = document.createElement("button");
focus.textContent = "平滑取景";
focus.addEventListener(
  "click",
  () => {
    transitionToObject(app, cube, { controls: orbit.controls, duration: 1.2 });
  },
  { signal: app.signal },
);
const restore = document.createElement("button");
restore.textContent = "恢复视角";
restore.addEventListener(
  "click",
  () => {
    restoreCameraView(app, view, { controls: orbit.controls });
  },
  { signal: app.signal },
);
tools.append(focus, restore);

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
