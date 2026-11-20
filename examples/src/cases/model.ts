import { loadAssets, loadGLTF } from "@adui/three/loaders";
import { loadHDR, attachEnvironment } from "@adui/three/environment";
import { attachGLTFAnimations } from "@adui/three/animation";
import { attachOrbitControls } from "@adui/three/controls";
import { fitObject } from "@adui/three/camera";
import { addGround, button, createScene } from "../shared.ts";
import type { ExampleContext } from "../shared.ts";
export async function mount(context: ExampleContext) {
  const app = await createScene(context, { orbit: false });
  const orbit = attachOrbitControls(app);
  addGround(app);
  context.status("正在加载本地原创 GLB…");
  const controller = new AbortController();
  button(app, context.tools, "取消加载", () => controller.abort());
  void loadAssets(
    app,
    {
      model: ({ signal, onProgress }) =>
        loadGLTF(app, import.meta.env.BASE_URL + "models/animated.glb", {
          signal,
          onProgress,
          addToScene: false,
        }),
      environment: ({ signal, onProgress }) =>
        loadHDR(app, import.meta.env.BASE_URL + "environments/studio.hdr", { signal, onProgress }),
    },
    {
      concurrency: 2,
      retries: 1,
      signal: controller.signal,
      onProgress: ({ completed, total }) => context.status(`资产准备 ${completed}/${total}…`),
    },
  )
    .then((batch) => {
      const { model, environment } = batch.assets;
      app.scene.add(model.scene);
      fitObject(app, model.scene, { controls: orbit.controls, padding: 1.7 });
      const animation = attachGLTFAnimations(app, model);
      animation.play(0);
      button(app, context.tools, "暂停动画", () => animation.pause());
      button(app, context.tools, "继续动画", () => animation.resume());
      button(app, context.tools, "半速动画", () => animation.setPlaybackRate(0.5));
      button(app, context.tools, "启用预加载环境", () => attachEnvironment(app, environment));
      context.status(
        "资产准备 2/2，模型已挂载；HDR 已预加载，可按需启用。切换示例会清理整批资产。",
      );
    })
    .catch((error) => {
      if (!app.signal.aborted) context.status(String(error));
    });
  app.start();
  return app;
}
