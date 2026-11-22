// 独立用法：配合同目录 index.html，安装依赖后即可运行。
import { ThreeApp } from "@adui/three";
import { Color, HemisphereLight } from "three";
import { attachOrbitControls } from "@adui/three/controls";
import { QuadraticBezierCurve3, Vector3 } from "three";
import { attachFlyPoints, attachFlowLine } from "@adui/three/effects";
import { attachPostprocessing } from "@adui/three/postprocessing";

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

const curve = new QuadraticBezierCurve3(
  new Vector3(-3, 0, 0),
  new Vector3(0, 5, 0),
  new Vector3(3, 0, 0),
);
const points = attachFlyPoints(app, { curve, count: 120, size: 6, color: 0x80ffff });
const flow = attachFlowLine(app, { curve, width: 0.12, pulses: 3, color: 0xe2a5ff });
attachPostprocessing(app, { bloom: { strength: 0.6, threshold: 0.8 } });
const pause = document.createElement("button");
pause.textContent = "暂停 / 继续特效";
let paused = false;
pause.addEventListener(
  "click",
  () => {
    paused = !paused;
    if (paused) {
      points.pause();
      flow.pause();
    } else {
      points.resume();
      flow.resume();
    }
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
