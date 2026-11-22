// JavaScript 完整示例，与同主题 TypeScript 版本保持一致。
// 独立用法：配合同目录 index.html，安装依赖后即可运行。
import { ThreeApp } from "@adui/three";
import { Color, HemisphereLight } from "three";
import { attachOrbitControls } from "@adui/three/controls";
import { Box3, BoxGeometry, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from "three";
import { attachShadowLight } from "@adui/three/lighting";
import { createRoomEnvironment, attachEnvironment } from "@adui/three/environment";
const container = document.querySelector("#app");
const tools = document.querySelector("#tools");
const status = document.querySelector("#status");
export const app = await ThreeApp.create(container, {
  renderer: { type: "webgl" },
  camera: { position: [6, 4, 7] },
});
app.scene.background = new Color(1053465);
app.scene.add(new HemisphereLight(14282751, 4542811, 3));
const orbit = attachOrbitControls(app);
orbit.controls.target.set(0, 0, 0);
orbit.controls.update();
const cube = new Mesh(
  app.resources.track(new BoxGeometry(2, 2, 2)),
  app.resources.track(new MeshStandardMaterial({ color: 15051893 })),
);
cube.position.y = 1;
const floor = new Mesh(
  app.resources.track(new PlaneGeometry(12, 12)),
  app.resources.track(new MeshStandardMaterial({ color: 6649982 })),
);
floor.rotation.x = -Math.PI / 2;
app.scene.add(cube, floor);
attachShadowLight(app, {
  bounds: new Box3(new Vector3(-5, 0, -5), new Vector3(5, 4, 5)),
  casters: [cube],
  receivers: [floor],
  mapSize: 1024,
  type: "pcf",
});
const environment = createRoomEnvironment(app);
attachEnvironment(app, environment);
const rotate = document.createElement("button");
rotate.textContent = "旋转投影物体";
rotate.addEventListener(
  "click",
  () => {
    cube.rotation.y += Math.PI / 4;
  },
  { signal: app.signal },
);
tools.append(rotate);
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
