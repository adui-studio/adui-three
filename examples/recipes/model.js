// JavaScript 完整示例，与同主题 TypeScript 版本保持一致。
// 独立用法：配合同目录 index.html，安装依赖后即可运行。
import { ThreeApp } from "@adui/three";
import { Color, HemisphereLight } from "three";
import { attachOrbitControls } from "@adui/three/controls";
import { loadGLTF } from "@adui/three/loaders";
import { attachGLTFAnimations } from "@adui/three/animation";
import { fitObject } from "@adui/three/camera";
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
// 此原创 GLB 随完整工程提供；替换为自己的模型 URL 即可。
const model = await loadGLTF(app, new URL("./models/animated.glb", import.meta.url).href);
fitObject(app, model.scene, {
  controls: orbit.controls,
  padding: 1.5,
});
const animation = attachGLTFAnimations(app, model);
if (model.gltf.animations.length > 0) animation.play(0);
const pause = document.createElement("button");
pause.textContent = "暂停 / 继续动画";
let paused = false;
pause.addEventListener(
  "click",
  () => {
    paused = !paused;
    if (paused) animation.pause();
    else animation.resume();
  },
  { signal: app.signal },
);
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
