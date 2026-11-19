import { createInstancedMesh } from "@adui/three/geometry";
import { BoxGeometry, Color, Matrix4, MeshStandardMaterial } from "three";
import { addGround, button, createScene } from "../shared.ts";
import type { ExampleContext } from "../shared.ts";
export async function mount(context: ExampleContext) {
  const app = await createScene(context);
  addGround(app);
  const geometry = app.resources.track(new BoxGeometry(0.55, 0.55, 0.55)),
    material = app.resources.track(new MeshStandardMaterial({ roughness: 0.5 }));
  const instances = createInstancedMesh(app, { geometry, material, capacity: 100 });
  for (let i = 0; i < 100; i++) {
    instances.setMatrixAt(
      i,
      new Matrix4().makeTranslation(((i % 10) - 4.5) * 0.7, 0.3, (Math.floor(i / 10) - 4.5) * 0.7),
    );
    instances.setColorAt(i, new Color().setHSL(i / 100, 0.45, 0.55));
  }
  instances.setCount(100);
  button(app, context.tools, "显示 25 个", () => instances.setCount(25));
  button(app, context.tools, "显示 100 个", () => instances.setCount(100));
  context.status("共享几何和材质；实例句柄拥有节点及专属属性 buffer。");
  app.start();
  return app;
}
