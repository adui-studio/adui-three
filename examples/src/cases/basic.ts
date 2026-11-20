import { addBox, addGround, button, createScene } from "../shared.ts";
import { gsap } from "gsap";
import { attachGSAPTimeline } from "@adui/three/animation";
import { captureRenderStats } from "@adui/three/rendering";
import type { ExampleContext } from "../shared.ts";
export async function mount(context: ExampleContext) {
  const app = await createScene(context);
  addGround(app);
  const cube = addBox(app);
  const timeline = gsap
    .timeline({ paused: true, repeat: 1, yoyo: true })
    .to(cube.rotation, { y: Math.PI * 2, duration: 6, ease: "none" })
    .to(cube.position, { y: 2, duration: 1.5, ease: "power2.inOut" }, 0);
  const motion = attachGSAPTimeline(app, timeline);
  button(app, context.tools, "读取统计快照", () => {
    const stats = captureRenderStats(app);
    context.status(
      `原生统计：${stats.drawCalls ?? "—"} 次绘制、${stats.triangles ?? "—"} 个三角形、${stats.geometries ?? "—"} 个几何体。`,
    );
  });
  button(app, context.tools, "暂停时间线", () => motion.pause());
  button(app, context.tools, "继续时间线", () => motion.resume());
  button(app, context.tools, "重播时间线", () => motion.restart());
  button(app, context.tools, "定位中点", () => {
    motion.seek(motion.duration / 2);
    app.renderOnce();
    context.status(`时间线已暂停在 ${motion.time} 秒；宿主暂停时也可定位并单次绘制。`);
  });
  context.status("GSAP 时间线由宿主更新驱动；页面动效保持独立，销毁场景会释放时间线。");
  app.start();
  return app;
}
