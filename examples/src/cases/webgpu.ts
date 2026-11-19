import { ThreeApp } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import { loadGLTF } from "@adui/three/loaders";
import { attachGLTFAnimations } from "@adui/three/animation";
import { fitObject } from "@adui/three/camera";
import { attachPicking } from "@adui/three/interaction";
import { attachPostprocessing } from "@adui/three/postprocessing";
import type { NodePostprocessingHandle } from "@adui/three/postprocessing";
import { attachRendererSettings } from "@adui/three/rendering";
import { attachShadowLight } from "@adui/three/lighting";
import { attachRipple } from "@adui/three/effects";
import { createRoomEnvironment, attachEnvironment } from "@adui/three/environment";
import { captureFrame } from "@adui/three/capture";
import { Box3, Color, HemisphereLight, Mesh, MeshStandardMaterial, PlaneGeometry } from "three";
import { button } from "../shared.ts";
import type { ExampleContext } from "../shared.ts";

export async function mount(context: ExampleContext) {
  const app = await ThreeApp.create(context.container, {
    renderer: { type: "webgpu" },
    signal: context.signal,
  });
  try {
    app.scene.background = new Color(0x0d1920);
    attachRendererSettings(app, { toneMapping: "neutral", exposure: 1 });
    app.scene.add(new HemisphereLight(0xc7dfff, 0x364438, 1.4));
    const floor = new Mesh(
      app.resources.track(new PlaneGeometry(12, 12)),
      app.resources.track(new MeshStandardMaterial({ color: 0x263c45 })),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
    app.scene.add(floor);
    const ripple = attachRipple(app, { radius: 2, opacity: 0.4 });
    ripple.mesh.position.set(-2, -1.48, 0);
    let post: NodePostprocessingHandle | undefined;
    button(app, context.tools, "切换泛光", () => {
      if (post) {
        post.dispose();
        post = undefined;
      } else
        post = attachPostprocessing(app, { bloom: { strength: 0.6, threshold: 0.8 }, outline: {} });
    });
    let environment: ReturnType<typeof createRoomEnvironment> | undefined;
    button(app, context.tools, "切换环境", () => {
      if (environment) {
        environment.dispose();
        environment = undefined;
      } else {
        environment = createRoomEnvironment(app);
        attachEnvironment(app, environment);
      }
    });
    const preview = document.createElement("img");
    preview.alt = "当前渲染截图";
    preview.style.maxWidth = "160px";
    preview.hidden = true;
    context.tools.append(preview);
    let imageURL: string | undefined;
    app.resources.track({
      dispose() {
        if (imageURL) URL.revokeObjectURL(imageURL);
        preview.remove();
      },
    });
    button(app, context.tools, "截图", () => {
      void captureFrame(app)
        .then((blob) => {
          if (app.signal.aborted) return;
          if (imageURL) URL.revokeObjectURL(imageURL);
          imageURL = URL.createObjectURL(blob);
          preview.src = imageURL;
          preview.hidden = false;
        })
        .catch((error) => {
          if (!app.signal.aborted) context.status(String(error));
        });
    });
    const orbit = attachOrbitControls(app);
    context.status(`实际后端：${app.backend}；正在加载本地 GLB…`);
    void loadGLTF(app, import.meta.env.BASE_URL + "models/animated.glb")
      .then((model) => {
        fitObject(app, model.scene, { controls: orbit.controls, padding: 1.7 });
        const animation = attachGLTFAnimations(app, model);
        animation.play(0);
        attachShadowLight(app, {
          bounds: new Box3().setFromObject(app.scene),
          casters: [model.scene],
          receivers: [floor],
          mapSize: 512,
        });
        button(app, context.tools, "暂停动画", () => animation.pause());
        button(app, context.tools, "继续动画", () => animation.resume());
        const picking = attachPicking(app, { objects: () => [model.scene] });
        picking.on("click", ({ intersection }) => {
          post?.configure({
            outline: {
              selectedObjects: intersection ? [intersection.object] : [],
              visibleEdgeColor: 0xffdd44,
            },
          });
          context.status(`实际后端：${app.backend}；${intersection ? "已选中模型" : "未选中模型"}`);
        });
        context.status(`实际后端：${app.backend}；拖动旋转、滚轮缩放，点击拾取模型。`);
      })
      .catch((error) => {
        if (!app.signal.aborted) context.status(String(error));
      });
    app.start();
    return app;
  } catch (error) {
    await app.destroy();
    throw error;
  }
}
