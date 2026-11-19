import "./style.css";
import { ThreeApp } from "@adui/three";
import type { ThreeAppInstance } from "@adui/three";
import { attachPostprocessing } from "@adui/three/postprocessing";
import type { PostprocessingOptions } from "@adui/three/postprocessing";
import { attachRendererSettings } from "@adui/three/rendering";
import { attachShadowLight } from "@adui/three/lighting";
import {
  createRoomEnvironment,
  attachEnvironment,
  loadHDR,
  loadEXR,
} from "@adui/three/environment";
import { captureFrame } from "@adui/three/capture";
import {
  attachFlyLine,
  attachFlowLine,
  attachFlyPoints,
  attachLightWall,
  attachRadar,
  attachRipple,
  attachLightPillar,
  attachShield,
} from "@adui/three/effects";
import type { EffectPlayback } from "@adui/three/effects";
import {
  NeutralToneMapping,
  AmbientLight,
  Box3,
  BoxGeometry,
  Color,
  LineCurve3,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from "three";

document.querySelector<HTMLDivElement>("#app")!.innerHTML =
  `<main><h1>统一渲染扩展回归</h1><p role="status">准备中</p><div data-stage style="width:400px;height:300px"></div></main>`;
const container = document.querySelector<HTMLElement>("[data-stage]")!;
const backend = new URLSearchParams(location.search).get("backend") ?? "auto";
const app: ThreeAppInstance = await ThreeApp.create(
  container,
  backend === "webgl"
    ? { renderer: { type: "webgl", antialias: true }, maxPixelRatio: 1 }
    : {
        renderer: { type: "webgpu", allowFallback: backend !== "webgpu", antialias: true },
        maxPixelRatio: 1,
      },
);
app.renderer.toneMapping = NeutralToneMapping;
app.scene.background = new Color(0x101010);
app.camera.position.set(0, 3, 6);
app.camera.lookAt(0, 0.5, 0);
const box = new Mesh(
  app.resources.track(new BoxGeometry()),
  app.resources.track(
    new MeshStandardMaterial({ color: 0xe87a35, roughness: 0.35, metalness: 0.25 }),
  ),
);
box.position.y = 0.5;
const floor = new Mesh(
  app.resources.track(new PlaneGeometry(8, 8)),
  app.resources.track(new MeshStandardMaterial({ color: 0x808080 })),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
app.scene.add(box, floor, new AmbientLight(0xffffff, 0.6));
const owned: Array<{ dispose(): void }> = [];
let post: ReturnType<typeof attachPostprocessing> | undefined;
let effect: EffectPlayback | undefined;
const clear = (): void => {
  for (const value of owned.splice(0).reverse()) value.dispose();
  post = undefined;
  effect = undefined;
};
const curve = new LineCurve3(new Vector3(-2, 0.2, 0), new Vector3(2, 0.2, 0));
const probe = {
  app,
  clear,
  post(options: PostprocessingOptions) {
    post?.dispose();
    post = attachPostprocessing(app, {
      ...options,
      ...(options.outline ? { outline: { ...options.outline, selectedObjects: [box] } } : {}),
    });
    owned.push(post);
  },
  configure(options: PostprocessingOptions) {
    post!.configure(options);
  },
  color(exposure: number) {
    owned.push(attachRendererSettings(app, { toneMapping: "neutral", exposure }));
  },
  room() {
    const asset = createRoomEnvironment(app);
    owned.push(asset, attachEnvironment(app, asset));
  },
  async environment(format: "hdr" | "exr") {
    const asset = await (format === "hdr" ? loadHDR : loadEXR)(
      app,
      `/environments/studio.${format}`,
    );
    owned.push(asset, attachEnvironment(app, asset));
  },
  shadow(type: "basic" | "pcf" | "vsm", enabled = true) {
    const handle = attachShadowLight(app, {
      bounds: new Box3(new Vector3(-4, -0.1, -4), new Vector3(4, 2, 4)),
      casters: [box],
      receivers: [floor],
      mapSize: 256,
      type,
      intensity: 4,
      normalBias: 0.01,
    });
    handle.setEnabled(enabled);
    owned.push(handle);
  },
  effect(kind: string) {
    clear();
    box.visible = floor.visible = false;
    const options = { color: 0x44bbff, intensity: 4 };
    switch (kind) {
      case "fly":
        effect = attachFlyLine(app, { ...options, curve, radius: 0.15 });
        break;
      case "flow":
        effect = attachFlowLine(app, { ...options, curve, width: 0.4 });
        break;
      case "points":
        effect = attachFlyPoints(app, { ...options, curve, count: 64, size: 12 });
        break;
      case "wall":
        effect = attachLightWall(app, {
          ...options,
          points: [new Vector3(-2, 0, 0), new Vector3(2, 0, 0)],
          height: 2,
        });
        break;
      case "radar":
        effect = attachRadar(app, { ...options, radius: 2 });
        break;
      case "ripple":
        effect = attachRipple(app, { ...options, radius: 2 });
        break;
      case "pillar":
        effect = attachLightPillar(app, { ...options, radius: 0.5, height: 3 });
        break;
      case "shield":
        effect = attachShield(app, { ...options, radius: 1.5 });
        break;
      default:
        throw new Error("Unknown effect");
    }
    effect.pause();
    effect.seek(0.2);
    owned.push(effect);
  },
  seek(value: number) {
    effect!.seek(value);
  },
  reset() {
    clear();
    box.visible = floor.visible = true;
  },
  draw() {
    return app.renderOnce();
  },
  memory() {
    return { ...app.renderer.info.memory };
  },
  async image(region?: { x: number; y: number; width: number; height: number }) {
    const blob = await captureFrame(app, { region });
    const bitmap = await createImageBitmap(blob),
      canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0,
      lit = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      sum += pixels[i]! + pixels[i + 1]! + pixels[i + 2]!;
      if (pixels[i]! + pixels[i + 1]! + pixels[i + 2]! > 100) lit++;
    }
    return { width: canvas.width, height: canvas.height, sum, lit, pixels: Array.from(pixels) };
  },
  async destroy() {
    clear();
    await app.destroy();
  },
};
Reflect.set(window, "gpuFeatureProbe", probe);
document.querySelector("[role=status]")!.textContent = "ready";
app.renderOnce();
export type WebGPUFeatureProbe = typeof probe;
