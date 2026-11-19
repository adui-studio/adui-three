import { attachShadowLight } from "@adui/three/lighting";
import { attachEnvironment, createRoomEnvironment } from "@adui/three/environment";
import type { RoomEnvironmentAsset } from "@adui/three/environment";
import { Box3, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from "three";
import { addBox, addGround, button, createScene, select } from "../shared.ts";
import type { ExampleContext } from "../shared.ts";
export async function mount(context: ExampleContext) {
  const app = await createScene(context, { lights: false }),
    floor = addGround(app),
    box = addBox(app, new Vector3(-1, 0.75, 0), 0xd9894d);
  const sphere = new Mesh(
    app.resources.track(new SphereGeometry(1, 32, 24)),
    app.resources.track(
      new MeshStandardMaterial({ color: 0xa8c5de, metalness: 0.8, roughness: 0.2 }),
    ),
  );
  sphere.position.set(1.6, 1, 0);
  app.scene.add(sphere);
  const options = {
    bounds: new Box3(new Vector3(-5, -0.1, -5), new Vector3(5, 4, 5)),
    casters: [box, sphere],
    receivers: [floor, box, sphere],
    mapSize: 1024,
  };
  let sun = attachShadowLight(app, options),
    room: RoomEnvironmentAsset | undefined;
  select(
    app,
    context.tools,
    "阴影类型",
    [
      ["pcf", "PCF"],
      ["basic", "Basic"],
      ["vsm", "VSM"],
    ],
    (value) => {
      sun.dispose();
      sun = attachShadowLight(app, { ...options, type: value as "pcf" | "basic" | "vsm" });
    },
  );
  button(app, context.tools, "切换 Room 环境", () => {
    if (room) {
      room.dispose();
      room = undefined;
    } else {
      room = createRoomEnvironment(app);
      attachEnvironment(app, room);
    }
  });
  context.status("Neutral / 曝光 1；方向光阴影视锥覆盖投射与接收区域。");
  app.start();
  return app;
}
