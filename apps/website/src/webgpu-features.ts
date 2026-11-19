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
  `<main class="capabilities"><h1>双后端渲染扩展</h1><p class="capability-lead">使用同一组公开 API，检查后处理、动态特效、阴影、环境与画布输出。</p><p role="status">准备中</p><span data-actual-backend></span><div data-stage style="width:min(100%,400px);height:300px;margin-top:20px"></div><div class="feature-controls"></div><ol data-check-results></ol><img data-capture-preview alt="扩展场景截图" style="max-width:100%" hidden></main>`;
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
const status = document.querySelector<HTMLElement>("[role=status]")!;
document.querySelector("[data-actual-backend]")!.textContent =
  app.rendererType + " / " + app.backend;
const controls = document.querySelector<HTMLElement>(".feature-controls")!;
const report = document.querySelector<HTMLOListElement>("[data-check-results]")!;
let captureURL: string | undefined;
function action(title: string, run: () => void | Promise<void>): void {
  const button = document.createElement("button");
  button.textContent = title;
  controls.append(button);
  button.addEventListener(
    "click",
    () => {
      button.disabled = true;
      void Promise.resolve()
        .then(run)
        .then(() => {
          app.renderOnce();
        })
        .catch((error) => {
          status.textContent = String(error);
        })
        .finally(() => {
          button.disabled = false;
        });
    },
    { signal: app.signal },
  );
}
action("恢复场景", () => probe.reset());
action("泛光与描边", () => {
  probe.reset();
  probe.post({ bloom: { threshold: 0.05 }, outline: { visibleEdgeColor: 0xffff00 } });
});
action("PCF 阴影", () => {
  probe.reset();
  probe.shadow("pcf");
});
action("VSM 阴影", () => {
  probe.reset();
  probe.shadow("vsm");
});
action("Room 环境", () => {
  probe.reset();
  probe.room();
});
action("HDR 环境", async () => {
  probe.reset();
  await probe.environment("hdr");
});
action("EXR 环境", async () => {
  probe.reset();
  await probe.environment("exr");
});
const effectSelect = document.createElement("select");
effectSelect.setAttribute("aria-label", "动态特效");
for (const [value, title] of [
  ["none", "选择动态特效"],
  ["fly", "飞线"],
  ["flow", "路径流光"],
  ["points", "飞点"],
  ["wall", "光墙"],
  ["radar", "雷达"],
  ["ripple", "波纹"],
  ["pillar", "光柱"],
  ["shield", "护罩"],
])
  effectSelect.add(new Option(title, value));
effectSelect.addEventListener(
  "change",
  () => {
    try {
      if (effectSelect.value === "none") probe.reset();
      else probe.effect(effectSelect.value);
      app.renderOnce();
    } catch (error) {
      status.textContent = String(error);
    }
  },
  { signal: app.signal },
);
controls.append(effectSelect);
action("截图", async () => {
  const blob = await captureFrame(app);
  if (app.signal.aborted) return;
  if (captureURL) URL.revokeObjectURL(captureURL);
  captureURL = URL.createObjectURL(blob);
  const image = document.querySelector<HTMLImageElement>("[data-capture-preview]")!;
  image.src = captureURL;
  image.hidden = false;
});
action("运行扩展自检", async () => {
  report.replaceChildren();
  status.textContent = "自检中…";
  probe.reset();
  const record = (name: string, passed: boolean): void => {
    const item = document.createElement("li");
    item.textContent = name + "：" + (passed ? "通过" : "失败");
    item.dataset.result = passed ? "passed" : "failed";
    report.append(item);
  };
  const base = await probe.image();
  probe.post({
    bloom: { threshold: 0, strength: 2 },
    outline: {},
    colorAdjustment: { brightness: 0.1 },
  });
  record("后处理与截图", (await probe.image()).sum !== base.sum);
  probe.reset();
  for (const kind of ["fly", "flow", "points", "wall", "radar", "ripple", "pillar", "shield"]) {
    probe.effect(kind);
    const first = await probe.image();
    probe.seek(0.65);
    const moved = await probe.image();
    record(
      (
        {
          fly: "飞线",
          flow: "路径流光",
          points: "飞点",
          wall: "光墙",
          radar: "雷达",
          ripple: "波纹",
          pillar: "光柱",
          shield: "护罩",
        } as Record<string, string>
      )[kind]!,
      first.lit > 15 && first.sum !== moved.sum,
    );
  }
  probe.reset();
  for (const type of ["basic", "pcf", "vsm"] as const) {
    probe.shadow(type);
    const on = await probe.image();
    probe.clear();
    probe.shadow(type, false);
    const off = await probe.image();
    record(type + " 阴影", Math.abs(on.sum - off.sum) > 1000);
    probe.clear();
  }
  probe.room();
  record("Room 环境", (await probe.image()).sum > base.sum);
  probe.clear();
  for (const format of ["hdr", "exr"] as const) {
    await probe.environment(format);
    record(format.toUpperCase() + " 环境", (await probe.image()).sum > base.sum);
    probe.clear();
  }
  probe.reset();
  const full = await probe.image(),
    region = await probe.image({ x: 80, y: 60, width: 100, height: 90 });
  let crop = true;
  for (let y = 0; y < 90; y++)
    for (let x = 0; x < 100; x++)
      for (let c = 0; c < 4; c++)
        if (
          region.pixels[(y * 100 + x) * 4 + c] !==
          full.pixels[((y + 60) * full.width + x + 80) * 4 + c]
        )
          crop = false;
  record("区域截图", crop);
  const counts: Array<ReturnType<typeof probe.memory>> = [];
  for (let i = 0; i < 4; i++) {
    probe.post({ bloom: { threshold: 0 }, outline: {} });
    probe.draw();
    probe.clear();
    probe.effect("points");
    probe.draw();
    probe.reset();
    probe.shadow("vsm");
    probe.draw();
    probe.clear();
    probe.room();
    probe.draw();
    probe.clear();
    probe.draw();
    counts.push(probe.memory());
  }
  record("重复资源释放", JSON.stringify(counts[1]) === JSON.stringify(counts[3]));
  probe.reset();
  status.textContent = report.querySelector('[data-result="failed"]')
    ? "自检存在失败项"
    : "自检通过";
});
window.addEventListener(
  "pagehide",
  () => {
    if (captureURL) URL.revokeObjectURL(captureURL);
    void probe.destroy().catch((error) => console.error(error));
  },
  { once: true, signal: app.signal },
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    if (captureURL) URL.revokeObjectURL(captureURL);
    void probe.destroy().catch((error) => console.error(error));
  });

document.querySelector("[role=status]")!.textContent = "ready";
app.renderOnce();
export type WebGPUFeatureProbe = typeof probe;
