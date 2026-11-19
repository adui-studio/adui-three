import { loadGLTF } from "@adui/three/loaders";
import { attachGLTFAnimations } from "@adui/three/animation";
import { attachOrbitControls } from "@adui/three/controls";
import { fitObject } from "@adui/three/camera";
import { addGround, button, createScene } from "../shared.ts";
import type { ExampleContext } from "../shared.ts";
export async function mount(context: ExampleContext) {
  const app = await createScene(context.container, { orbit: false });
  const orbit = attachOrbitControls(app);
  addGround(app);
  context.status("正在加载本地原创 GLB…");
  void loadGLTF(app, import.meta.env.BASE_URL + "models/animated.glb")
    .then((model) => {
      fitObject(app, model.scene, { controls: orbit.controls, padding: 1.7 });
      const animation = attachGLTFAnimations(app, model);
      animation.play(0);
      button(app, context.tools, "暂停动画", () => animation.pause());
      button(app, context.tools, "继续动画", () => animation.resume());
      button(app, context.tools, "半速动画", () => animation.setPlaybackRate(0.5));
      context.status("GLB 与动画已加载。切换示例会结束模型、Mixer 和迟到任务。");
    })
    .catch((error) => {
      if (!app.signal.aborted) context.status(String(error));
    });
  app.start();
  return app;
}
