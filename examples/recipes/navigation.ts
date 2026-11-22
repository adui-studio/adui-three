// 独立用法：配合同目录 index.html，安装依赖后即可运行。
import { ThreeApp } from "@adui/three";
import { Color, HemisphereLight } from "three";
import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { createCollisionWorld } from "@adui/three/collision";
import { attachThirdPersonControls } from "@adui/three/navigation";

const container = document.querySelector<HTMLDivElement>("#app")!;
const tools = document.querySelector<HTMLDivElement>("#tools")!;
const status = document.querySelector<HTMLOutputElement>("#status")!;
export const app = await ThreeApp.create(container, {
  renderer: { type: "webgl" },
  camera: { position: [6, 4, 7] },
});
app.scene.background = new Color(0x101319);
app.scene.add(new HemisphereLight(0xd9efff, 0x45515b, 3));

const floor = new Mesh(
  app.resources.track(new BoxGeometry(20, 0.2, 20)),
  app.resources.track(new MeshStandardMaterial({ color: 0x526773 })),
);
floor.position.y = -0.1;
app.scene.add(floor);
const actor = new Group();
const body = new Mesh(
  app.resources.track(new CapsuleGeometry(0.3, 1, 4, 12)),
  app.resources.track(new MeshStandardMaterial({ color: 0x75c9af })),
);
body.position.y = 0.8;
actor.add(body);
app.scene.add(actor);
const world = app.resources.track(createCollisionWorld([floor]));
const controls = attachThirdPersonControls(app, actor, {
  world,
  position: new Vector3(0, 0, 2),
  distance: 5,
});
const jump = document.createElement("button");
jump.textContent = "跳跃";
jump.addEventListener("click", () => controls.jump(), { signal: app.signal });
const hint = document.createElement("span");
hint.textContent = "点击画布后使用 WASD 移动，空格跳跃。";
tools.append(jump, hint);

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
