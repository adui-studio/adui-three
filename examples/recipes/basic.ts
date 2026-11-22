// 独立用法：配合同目录 index.html，安装依赖后即可运行。
import { ThreeApp } from "@adui/three";
import { Color, HemisphereLight } from "three";
import { attachOrbitControls } from "@adui/three/controls";
import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";

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

// 几何体与材质交给宿主回收，更新只使用宿主时钟。
const cube = new Mesh(
  app.resources.track(new BoxGeometry(2, 2, 2)),
  app.resources.track(new MeshStandardMaterial({ color: 0x75c9af })),
);
app.scene.add(cube);
app.onUpdate(({ delta }) => {
  cube.rotation.y += delta * 0.6;
});
const pause = document.createElement("button");
pause.textContent = "暂停 / 继续";
pause.addEventListener("click", () => (app.state === "running" ? app.stop() : app.start()), {
  signal: app.signal,
});
tools.append(pause);

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
