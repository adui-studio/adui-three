import { createCollisionWorld } from "@adui/three/collision";
import { attachFirstPersonControls, attachThirdPersonControls } from "@adui/three/navigation";
import type { FirstPersonControlsHandle, ThirdPersonControlsHandle } from "@adui/three/navigation";
import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { addGround, button, createScene } from "../shared.ts";
import type { ExampleContext } from "../shared.ts";
export async function mount(context: ExampleContext) {
  const app = await createScene(context.container, { orbit: false }),
    floor = addGround(app);
  const wall = new Mesh(
    app.resources.track(new BoxGeometry(5, 2, 0.4)),
    app.resources.track(new MeshStandardMaterial({ color: 0x607d8b })),
  );
  wall.position.set(0, 1, -3);
  app.scene.add(wall);
  const world = app.resources.track(createCollisionWorld([floor, wall])),
    actor = new Group();
  const body = new Mesh(
    app.resources.track(new CapsuleGeometry(0.3, 1, 4, 12)),
    app.resources.track(new MeshStandardMaterial({ color: 0x79d9ad })),
  );
  body.position.y = 0.8;
  actor.add(body);
  app.scene.add(actor);
  let handle: FirstPersonControlsHandle | ThirdPersonControlsHandle = attachThirdPersonControls(
    app,
    actor,
    { world, position: new Vector3(0, 0, 2), distance: 5 },
  );
  button(app, context.tools, "第三人称", () => {
    handle.dispose();
    actor.visible = true;
    handle = attachThirdPersonControls(app, actor, {
      world,
      position: new Vector3(0, 0, 2),
      distance: 5,
    });
  });
  button(app, context.tools, "第一人称", () => {
    handle.dispose();
    actor.visible = false;
    const first = attachFirstPersonControls(app, { world, position: new Vector3(0, 0, 2) });
    handle = first;
    void first.lock().catch((error) => context.status(String(error)));
  });
  button(app, context.tools, "跳跃", () => handle.jump());
  context.status(
    "点击画布后用 WASD 移动，空格跳跃；第一人称需指针锁，Esc 退出。静态碰撞复用 BVH。",
  );
  app.start();
  return app;
}
