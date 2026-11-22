// JavaScript 完整示例，与同主题 TypeScript 版本保持一致。
// 独立用法：配合同目录 index.html，安装依赖后即可运行。
import { ThreeApp } from "@adui/three";
import { Color, HemisphereLight } from "three";
import { attachOrbitControls } from "@adui/three/controls";
import { BoxGeometry, Mesh, MeshStandardMaterial } from "three";
import { attachPostprocessing } from "@adui/three/postprocessing";
import { captureFrame } from "@adui/three/capture";
const container = document.querySelector("#app");
const tools = document.querySelector("#tools");
const status = document.querySelector("#status");
export const app = await ThreeApp.create(container, {
  renderer: {
    type: "webgpu",
    allowFallback: true,
  },
  camera: { position: [6, 4, 7] },
});
app.scene.background = new Color(1053465);
app.scene.add(new HemisphereLight(14282751, 4542811, 3));
const orbit = attachOrbitControls(app);
orbit.controls.target.set(0, 0, 0);
orbit.controls.update();
const cube = new Mesh(
  app.resources.track(new BoxGeometry(2, 2, 2)),
  app.resources.track(new MeshStandardMaterial({ color: 7719343 })),
);
app.scene.add(cube);
attachPostprocessing(app, {
  bloom: {
    strength: 0.5,
    threshold: 0.8,
  },
});
app.onUpdate(({ delta }) => {
  cube.rotation.y += delta * 0.5;
});
const capture = document.createElement("button");
capture.textContent = "下载截图";
capture.addEventListener(
  "click",
  () => {
    void captureFrame(app)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "scene.png";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1e3);
      })
      .catch((error) => {
        status.textContent = String(error);
      });
  },
  { signal: app.signal },
);
tools.append(capture);
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
