// JavaScript 完整示例，与同主题 TypeScript 版本保持一致。
// 独立用法：配合同目录 index.html，安装依赖后即可运行。
import { ThreeApp } from "@adui/three";
import { Color, HemisphereLight } from "three";
import { attachOrbitControls } from "@adui/three/controls";
import { BoxGeometry, Matrix4, MeshStandardMaterial } from "three";
import { createInstancedMesh } from "@adui/three/geometry";
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
const geometry = app.resources.track(new BoxGeometry(0.5, 0.5, 0.5));
const material = app.resources.track(new MeshStandardMaterial({ roughness: 0.5 }));
const instances = createInstancedMesh(app, {
  geometry,
  material,
  capacity: 100,
});
for (let i = 0; i < 100; i++) {
  instances.setMatrixAt(
    i,
    new Matrix4().makeTranslation(((i % 10) - 4.5) * 0.7, 0, (Math.floor(i / 10) - 4.5) * 0.7),
  );
  instances.setColorAt(i, new Color().setHSL(i / 100, 0.5, 0.6));
}
instances.setCount(100);
const toggle = document.createElement("button");
toggle.textContent = "切换实例数量";
let count = 100;
toggle.addEventListener(
  "click",
  () => {
    count = count === 100 ? 25 : 100;
    instances.setCount(count);
  },
  { signal: app.signal },
);
tools.append(toggle);
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
