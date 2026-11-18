import { addBox, addGround, createScene } from "../shared.ts";
import type { ExampleContext } from "../shared.ts";
export function mount(context: ExampleContext) {
  const app = createScene(context.container);
  addGround(app);
  const cube = addBox(app);
  app.onUpdate(({ delta }) => {
    cube.rotation.y += delta * 0.4;
  });
  context.status("一个宿主、一个更新循环；几何体与材质分别登记到资源范围。");
  app.start();
  return app;
}
