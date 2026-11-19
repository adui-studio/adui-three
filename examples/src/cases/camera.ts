import { attachOrbitControls } from "@adui/three/controls";
import {
  captureCameraView,
  fitObject,
  restoreCameraView,
  transitionToObject,
} from "@adui/three/camera";
import { addBox, addGround, button, createScene } from "../shared.ts";
import type { ExampleContext } from "../shared.ts";
import { Vector3 } from "three";
export async function mount(context: ExampleContext) {
  const app = await createScene(context, { orbit: false }),
    orbit = attachOrbitControls(app);
  addGround(app);
  const left = addBox(app, new Vector3(-2, 0.75, 0)),
    right = addBox(app, new Vector3(2, 0.75, 0), 0xd49365);
  const view = captureCameraView(app, { controls: orbit.controls });
  button(app, context.tools, "立即取景", () =>
    fitObject(app, left, { controls: orbit.controls, padding: 1.5 }),
  );
  button(app, context.tools, "平滑取景", () => {
    transitionToObject(app, right, { controls: orbit.controls, duration: 1.2 });
  });
  button(app, context.tools, "恢复视角", () => {
    restoreCameraView(app, view, { controls: orbit.controls });
    app.renderOnce();
  });
  context.status("相机过渡复用宿主时钟；拖动轨道控件会交接控制。");
  app.start();
  return app;
}
