import {
  attachFlyPoints,
  attachFlowLine,
  attachLightPillar,
  attachRipple,
  attachShield,
} from "@adui/three/effects";
import { attachPostprocessing } from "@adui/three/postprocessing";
import type { PostprocessingHandle } from "@adui/three/postprocessing";
import { QuadraticBezierCurve3, Vector3 } from "three";
import { addGround, button, createScene, select } from "../shared.ts";
import type { ExampleContext } from "../shared.ts";
export async function mount(context: ExampleContext) {
  const app = await createScene(context.container);
  addGround(app);
  const curve = new QuadraticBezierCurve3(
    new Vector3(-3, 0.2, -1),
    new Vector3(0, 5, -1),
    new Vector3(3, 0.2, -1),
  );
  const particles = attachFlyPoints(app, { curve, count: 160, size: 6, color: 0x80ffff });
  const stream = attachFlowLine(app, { curve, width: 0.15, pulses: 3, color: 0xf3a2ec });
  const ripple = attachRipple(app, { radius: 1.6, color: 0x77ffc1 });
  ripple.mesh.position.set(-2, 0.03, 1.5);
  const pillar = attachLightPillar(app, { height: 3 });
  pillar.mesh.position.set(0, 0, 1);
  const shield = attachShield(app, { radius: 1.3 });
  shield.mesh.position.set(2, 1.3, 0);
  const handles = [particles, stream, ripple, pillar, shield];
  const nodes = [particles.points, stream.mesh, ripple.mesh, pillar.mesh, shield.mesh];
  select(
    app,
    context.tools,
    "效果",
    [
      ["all", "全部"],
      ["0", "点云飞线"],
      ["1", "路径流光"],
      ["2", "扩散波纹"],
      ["3", "光柱"],
      ["4", "能量护罩"],
    ],
    (value) => {
      nodes.forEach((node, i) => {
        node.visible = value === "all" || i === Number(value);
      });
    },
  );
  button(app, context.tools, "暂停特效", () => {
    for (const h of handles) h.pause();
  });
  button(app, context.tools, "继续特效", () => {
    for (const h of handles) h.resume();
  });
  let post: PostprocessingHandle | undefined;
  button(app, context.tools, "切换泛光", () => {
    if (post) {
      post.dispose();
      post = undefined;
    } else post = attachPostprocessing(app, { bloom: { strength: 0.8, threshold: 1 } });
  });
  context.status("点云、路径带和空间形状共用时钟；泛光按需接入同一绘制出口。");
  app.start();
  return app;
}
