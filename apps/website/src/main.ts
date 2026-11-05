import "./style.css";
import { ThreeApp } from "@adui/three";
import { captureFrame } from "@adui/three/capture";
import { attachOrbitControls, attachTransformControls } from "@adui/three/controls";
import type { OrbitControlsHandle, TransformControlsHandle } from "@adui/three/controls";
import { fitObject, transitionToObject } from "@adui/three/camera";
import type { CameraTransitionHandle } from "@adui/three/camera";
import { attachPostprocessing } from "@adui/three/postprocessing";
import type { PostprocessingHandle } from "@adui/three/postprocessing";
import { attachEnvironment, loadHDR } from "@adui/three/environment";
import type { EnvironmentBinding, HDREnvironment } from "@adui/three/environment";
import { loadTexture, loadKTX2 } from "@adui/three/textures";
import type { TextureAsset, KTX2TextureAsset } from "@adui/three/textures";
import { attachGLTFAnimations } from "@adui/three/animation";
import type { GLTFAnimationsHandle } from "@adui/three/animation";
import { attachPicking } from "@adui/three/interaction";
import { attachDOMLabels } from "@adui/three/labels";
import type { DOMLabelHandle, DOMLabelsHandle } from "@adui/three/labels";
import { cloneGLTF, loadGLTF } from "@adui/three/loaders";
import type { GLTFInstance, GLTFModel } from "@adui/three/loaders";
import type { LoadGLTFOptions } from "@adui/three/loaders";
import dracoJS from "three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url";
import dracoWasm from "three/addons/libs/draco/gltf/draco_decoder.wasm?url";
import basisJS from "three/addons/libs/basis/basis_transcoder.js?url";
import basisWasm from "three/addons/libs/basis/basis_transcoder.wasm?url";
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";
import type { Object3D } from "three";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="shell">
    <header class="topbar"><a class="brand" href="#">adui<span>/</span>three</a><span class="version">CORE · 0.0.0</span><a class="source" href="https://github.com/adui-studio/adui-three">GitHub ↗</a></header>
    <main>
      <section class="intro"><div class="eyebrow"><span class="dot"></span> CORE PLAYGROUND</div><h1>一个场景，<br><span>清晰的生命周期。</span></h1><p>从创建到释放，让 Three.js 场景的每一步都可控。<br>两个独立实例，一起验证最小核心。</p></section>
      <section class="workspace" aria-label="双实例演示"></section>
      <section class="notes"><div><span class="note-index">01 / COMPOSE</span><h2>保留原生能力</h2><p>直接使用 scene、camera 与 renderer。OrbitControls 从可选入口接入。</p></div><div><span class="note-index">02 / OWN</span><h2>明确资源归属</h2><p>只有显式登记的资源交由宿主释放。场景中的外部共享资源由所有者管理。</p></div><div><span class="note-index">03 / OBSERVE</span><h2>验证每个边界</h2><p>暂停、改变容器尺寸、销毁再重建，观察两个实例的独立状态。</p></div></section>
    </main><footer><span>@adui/three · 本地开发预览，尚未发布</span><a href="/?demo=instances">实例化网格演示 ↗</a><span>TypeScript / ESM / WebGL 2</span></footer>
  </div>`;

const teardown: Array<() => void> = [];
const panels = new Map<string, { copy(source: GLTFModel): void; available(): boolean }>();

function mountPanel(id: string, color: number): void {
  const card = document.createElement("article");
  card.className = "scene-card";
  card.dataset.testid = `scene-${id}`;
  card.innerHTML = `
    <div class="card-heading"><div><span class="scene-id">SCENE ${id}</span><h2>${id === "A" ? "主场景" : "独立实例"}</h2></div><span class="state" data-testid="state">ready</span></div>
    <div class="stage"><div class="viewport" aria-label="场景 ${id}，拖动旋转，滚轮缩放"><div class="label-overlay"></div></div><span class="stage-hint">拖动旋转 · 滚轮缩放</span><p class="error" role="alert" hidden></p></div>
    <div class="metrics"><div><span>UPDATES</span><strong data-testid="frames">0</strong></div><div><span>VIEWPORT</span><strong data-testid="size">—</strong></div><div><span>DPR</span><strong data-testid="dpr">—</strong></div><div><span>DRAW CALLS</span><strong data-testid="draw-calls">0</strong></div></div>
    <div class="actions"><button data-action="start" class="primary">运行</button><button data-action="stop">暂停</button><button data-action="render">绘制一帧</button><button data-action="dispose">销毁</button><button data-action="rebuild">重建 ↻</button></div>
    <div class="effect-actions"><select class="capture-format" data-action="capture-format" aria-label="截图格式"><option value="image/png">PNG</option><option value="image/jpeg">JPEG</option><option value="image/webp">WebP</option></select><button data-action="capture">截图</button><button data-action="cancel-capture">取消截图</button><button data-action="clear-capture">清除截图</button><a data-testid="capture-download" hidden>下载截图</a><span data-testid="capture-state">idle</span></div>
    <img class="capture-preview" data-testid="capture-preview" alt="场景截图预览" hidden>
    <div class="resize-actions"><button data-action="width" aria-pressed="false">收窄容器</button><button data-action="zero" aria-pressed="false">零高度</button><button data-action="labels" aria-pressed="true">显示标签</button><button data-action="fit">适配视角</button><button data-action="transition">平滑取景</button><button data-action="cancel-transition">取消过渡</button><button data-action="large-model" aria-pressed="false">大模型</button></div>
    <p class="camera-feedback" role="status">取景过渡：<span data-testid="transition-state">idle</span> · <span data-testid="transition-progress">0</span>%</p>
    <div class="effect-actions"><button data-action="transform" aria-pressed="false">变换手柄</button><button data-action="transform-mode">切换变换</button><button data-action="remove-transform">释放手柄</button></div>
    <p class="camera-feedback" role="status">变换：<span data-testid="transform-mode">idle</span> · <span data-testid="transform-position">—</span></p>
    <div class="effect-actions"><button data-action="bloom" aria-pressed="false">泛光</button><button data-action="bloom-strength" aria-pressed="false">增强泛光</button><button data-action="outline" aria-pressed="false">选择描边</button><button data-action="remove-bloom">释放后处理</button><span data-testid="bloom-state">idle</span></div>
    <div class="effect-actions"><button data-action="environment">加载 HDR</button><button data-action="environment-background" aria-pressed="true">环境背景</button><button data-action="cancel-environment">取消环境</button><button data-action="remove-environment">移除环境</button><button data-action="environment-error">环境失败</button></div>
    <p class="environment-feedback" role="status">环境：<span data-testid="environment-state">idle</span> · 原创 HDR 渐变</p>
    <div class="effect-actions"><button data-action="texture">加载纹理</button><button data-action="texture-ktx2">加载 KTX2 纹理</button><button data-action="texture-ktx2-error">KTX2 纹理失败</button><button data-action="texture-flip" aria-pressed="true">纹理翻转</button><button data-action="cancel-texture">取消纹理</button><button data-action="remove-texture">移除纹理</button><button data-action="texture-error">纹理失败</button></div>
    <p class="camera-feedback" role="status">占位物体纹理：<span data-testid="texture-state">idle</span> · 原创方向图 / 棋盘图</p>
    <div class="model-actions"><button data-action="glb">加载 GLB</button><button data-action="gltf">加载 GLTF</button><button data-action="draco">加载 Draco</button><button data-action="meshopt">加载 Meshopt</button><button data-action="ktx2">加载 KTX2</button><button data-action="ktx2-glb">KTX2 GLB</button><button data-action="decoder-error">缺少解码器</button><button data-action="ktx2-error">缺少转码器</button><button data-action="cancel-model">取消加载</button><button data-action="remove-model">移除模型</button><button data-action="invalid-model">失败示例</button></div>
    <p class="model-feedback" role="status">模型未加载 · 使用项目原创的内嵌纹理样例</p>
    <div class="model-actions"><button data-action="clone-model">创建实例</button><button data-action="clone-peer">复制到另一场景</button><button data-action="clone-play">播放实例</button><button data-action="clone-pause">暂停实例</button><button data-action="remove-clone">移除实例</button></div>
    <p class="camera-feedback" role="status">实例：<span data-testid="clone-state">idle</span> · <span data-testid="clone-time">0.000</span> s · 共享几何体与材质</p>
    <div class="animation-actions"><button data-action="animated-model">加载动画样例</button><button data-action="skin-model">加载骨骼样例</button><button data-action="animation-play">播放动画</button><button data-action="animation-pause">暂停动画</button><button data-action="animation-resume">继续动画</button><button data-action="animation-next">切换片段</button><button data-action="animation-fade">渐变切换</button><button data-action="animation-once">单次播放</button><button data-action="animation-stop">停止动画</button></div>
    <p class="animation-feedback" role="status">动画：<span data-testid="animation-state">idle</span> · <span data-testid="animation-clip">—</span> · <span data-testid="animation-time">0.000</span> s · 渐变 <span data-testid="animation-blend-progress">0</span>%</p>
    <label class="animation-timeline">定位<input type="range" min="0" max="100" step="1" value="0" data-action="animation-seek" aria-label="动画定位"><span data-testid="animation-progress">0</span>%</label>
    <p class="picking-feedback" role="status">悬停：<span data-testid="hovered">—</span> · 选中：<span data-testid="selected">—</span><span class="picking-hint">点击物体选中 · 点击空白清除</span></p>`;
  document.querySelector(".workspace")!.appendChild(card);
  const viewport = card.querySelector<HTMLDivElement>(".viewport")!;
  const errorOutput = card.querySelector<HTMLParagraphElement>(".error")!;
  const button = (action: string): HTMLButtonElement =>
    card.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  let app: ThreeApp | undefined;
  let frames = 0;
  let draws = 0;
  let narrow = false;
  let zero = false;
  let placeholder: Mesh | undefined;
  let model: GLTFModel | undefined;
  let instance: GLTFInstance | undefined;
  let instanceAnimation: GLTFAnimationsHandle | undefined;
  let instanceLabel: DOMLabelHandle | undefined;
  let request: AbortController | undefined;
  let modelVersion = 0;
  let modelState: "idle" | "loading" | "loaded" | "cancelled" | "error" = "idle";
  let modelMessage = "模型未加载 · 使用项目原创的内嵌纹理样例";
  let labels: DOMLabelsHandle | undefined;
  let placeholderLabel: DOMLabelHandle | undefined;
  let markerLabel: DOMLabelHandle | undefined;
  let modelLabel: DOMLabelHandle | undefined;
  let labelsVisible = true;
  let animation: GLTFAnimationsHandle | undefined;
  let animationIndex = 0;
  let orbit: OrbitControlsHandle | undefined;
  let largeModel = false;
  let fittedDistance: number | undefined;
  let transition: CameraTransitionHandle | undefined;
  let effects: PostprocessingHandle | undefined;
  let selectedObject: Object3D | undefined;
  let glow: Mesh | undefined;
  let strongBloom = false;
  let environment: HDREnvironment | undefined;
  let environmentBinding: EnvironmentBinding | undefined;
  let environmentRequest: AbortController | undefined;
  let environmentVersion = 0;
  let environmentState = "idle";
  let environmentBackground = true;
  let transform: TransformControlsHandle | undefined;
  let textureAsset: TextureAsset | KTX2TextureAsset | undefined;
  let textureRequest: AbortController | undefined;
  let textureVersion = 0;
  let textureState = "idle";
  let textureFlip = true;
  let captureRequest: AbortController | undefined;
  let captureVersion = 0;
  let captureURL: string | undefined;
  let captureState = "idle";

  function addLabel(
    object: Object3D,
    text: string,
    offset: readonly [number, number, number],
  ): DOMLabelHandle {
    const element = document.createElement("span");
    element.className = "scene-label";
    element.dataset.testid = "object-label";
    element.textContent = text;
    const label = labels!.add({ object, element, offset });
    label.visible = labelsVisible;
    labels!.update();
    return label;
  }

  function clearPicking(): void {
    transform?.detach();
    selectedObject = undefined;
    if (effects?.outline && !effects.disposed) effects.outline.selectedObjects = [];
    card.querySelector('[data-testid="hovered"]')!.textContent = "—";
    card.querySelector('[data-testid="selected"]')!.textContent = "—";
    card.dataset.pickCount = "0";
    viewport.style.cursor = "";
  }

  function refresh(): void {
    const state = app?.state ?? "unavailable";
    card.dataset.state = state;
    card.dataset.contextLost = String(app?.contextLost ?? false);
    card.dataset.captureState = captureState;
    card.querySelector('[data-testid="capture-state"]')!.textContent = captureState;
    button("capture").disabled =
      !app || state === "disposed" || !app.size.width || !app.size.height || !!captureRequest;
    button("cancel-capture").disabled = !captureRequest;
    button("clear-capture").disabled = !captureURL && !captureRequest;
    card.querySelector(".state")!.textContent = state + (app?.contextLost ? " · GPU lost" : "");
    card.querySelector('[data-testid="frames"]')!.textContent = String(frames);
    const size = app?.size;
    card.querySelector('[data-testid="size"]')!.textContent = size
      ? `${size.width} × ${size.height}`
      : "—";
    card.querySelector('[data-testid="dpr"]')!.textContent = size
      ? size.pixelRatio.toFixed(2)
      : "—";
    card.querySelector('[data-testid="draw-calls"]')!.textContent = String(
      app?.renderer.info.render.calls ?? 0,
    );
    button("start").disabled = !app || state === "running" || state === "disposed";
    button("stop").disabled = !app || state !== "running";
    button("dispose").disabled = !app || state === "disposed";
    button("fit").disabled = !app || state === "disposed" || !app.size.width || !app.size.height;
    button("render").disabled = button("fit").disabled;
    card.dataset.renderCount = String(draws);
    card.dataset.textureState = textureState;
    card.dataset.textureFlip = String(textureFlip);
    card.querySelector('[data-testid="texture-state"]')!.textContent = textureState;
    for (const action of ["texture", "texture-error", "texture-ktx2", "texture-ktx2-error"])
      button(action).disabled = !app || state === "disposed" || !!model;
    button("cancel-texture").disabled = textureState !== "loading";
    button("remove-texture").disabled = !textureAsset || textureAsset.disposed;
    button("texture-flip").disabled =
      !textureAsset ||
      textureAsset.disposed ||
      !!model ||
      textureState === "loading" ||
      (!!textureAsset && "isCompressedTexture" in textureAsset.texture);
    button("texture-flip").setAttribute(
      "aria-pressed",
      String(textureFlip && !(textureAsset && "isCompressedTexture" in textureAsset.texture)),
    );
    const activeTransform = transform && !transform.disposed ? transform : undefined;
    const hasTransform = !!activeTransform;
    const transformObject = transform?.controls.object;
    card.dataset.transformMode = activeTransform?.controls.mode ?? "idle";
    card.dataset.transformDragging = String(!!transform?.controls.dragging && hasTransform);
    card.dataset.transformPosition =
      transformObject?.position
        .toArray()
        .map((value) => value.toFixed(3))
        .join(",") ?? "";
    card.dataset.orbitEnabled = String(orbit?.controls.enabled ?? false);
    card.dataset.cameraPosition =
      app?.camera.position
        .toArray()
        .map((value) => value.toFixed(5))
        .join(",") ?? "";
    card.querySelector('[data-testid="transform-mode"]')!.textContent = card.dataset.transformMode;
    card.querySelector('[data-testid="transform-position"]')!.textContent =
      card.dataset.transformPosition || "—";
    button("transform").disabled = !app || state === "disposed";
    button("transform").setAttribute("aria-pressed", String(hasTransform));
    button("transform-mode").disabled = !hasTransform || !!transform?.controls.dragging;
    button("remove-transform").disabled = !hasTransform;
    card.dataset.environmentState = environmentState;
    card.querySelector('[data-testid="environment-state"]')!.textContent = environmentState;
    for (const action of ["environment", "environment-error"])
      button(action).disabled = !app || state === "disposed";
    button("cancel-environment").disabled = environmentState !== "loading";
    button("remove-environment").disabled = !environment || environment.disposed;
    button("environment-background").disabled = !environment || environment.disposed;
    button("environment-background").setAttribute("aria-pressed", String(environmentBackground));
    button("transition").disabled = button("fit").disabled || hasTransform;
    button("cancel-transition").disabled = transition?.state !== "running";
    const bloomState = !effects
      ? "idle"
      : effects.disposed
        ? "disposed"
        : effects.bloom!.enabled
          ? "enabled"
          : "disabled";
    card.dataset.bloomState = bloomState;
    card.querySelector('[data-testid="bloom-state"]')!.textContent = bloomState;
    button("bloom").disabled = !app || state === "disposed";
    button("bloom").setAttribute("aria-pressed", String(bloomState === "enabled"));
    button("bloom-strength").disabled = !effects || effects.disposed;
    button("bloom-strength").setAttribute("aria-pressed", String(strongBloom));
    button("remove-bloom").disabled = !effects || effects.disposed;
    button("outline").disabled = !app || state === "disposed";
    button("outline").setAttribute(
      "aria-pressed",
      String(!!effects?.outline?.enabled && !effects.disposed),
    );
    card.dataset.outlineState = !effects
      ? "idle"
      : effects.disposed
        ? "disposed"
        : effects.outline?.enabled
          ? "enabled"
          : "disabled";
    card.dataset.outlineSelection = String(effects?.outline?.selectedObjects.length ?? 0);
    card.dataset.transitionState = transition?.state ?? "idle";
    card.querySelector('[data-testid="transition-state"]')!.textContent =
      card.dataset.transitionState;
    card.querySelector('[data-testid="transition-progress"]')!.textContent = String(
      Math.round((transition?.progress ?? 0) * 100),
    );
    button("large-model").disabled = !model || state === "disposed";
    button("large-model").setAttribute("aria-pressed", String(largeModel));
    if (fittedDistance === undefined) delete card.dataset.fitDistance;
    else card.dataset.fitDistance = fittedDistance.toFixed(3);
    card.dataset.modelState = modelState;
    card.querySelector(".model-feedback")!.textContent = modelMessage;
    for (const action of [
      "glb",
      "gltf",
      "invalid-model",
      "draco",
      "meshopt",
      "decoder-error",
      "ktx2",
      "ktx2-glb",
      "ktx2-error",
    ])
      button(action).disabled = !app || state === "disposed";
    button("cancel-model").disabled = modelState !== "loading";
    button("remove-model").disabled = !model;
    const hasInstance = !!instance && !instance.disposed;
    card.dataset.cloneState = hasInstance ? "ready" : "idle";
    card.querySelector('[data-testid="clone-state"]')!.textContent = hasInstance
      ? (instanceAnimation?.state ?? "ready")
      : "idle";
    card.querySelector('[data-testid="clone-time"]')!.textContent = (
      instanceAnimation?.action?.time ?? 0
    ).toFixed(3);
    button("clone-model").disabled = !model || hasInstance;
    button("clone-peer").disabled = !model || !panels.get(id === "A" ? "B" : "A")?.available();
    button("remove-clone").disabled = !hasInstance;
    button("clone-play").disabled = !hasInstance || !instanceAnimation?.clips.length;
    button("clone-pause").disabled = instanceAnimation?.state !== "playing";
    const animationState = animation?.state ?? "idle";
    card.dataset.animationState = animationState;
    card.querySelector('[data-testid="animation-state"]')!.textContent = animationState;
    card.querySelector('[data-testid="animation-clip"]')!.textContent =
      animation?.action?.getClip().name ?? "—";
    card.querySelector('[data-testid="animation-time"]')!.textContent = (
      animation?.action?.time ?? 0
    ).toFixed(3);
    card.dataset.animationBlending = String(animation?.blending ?? false);
    card.dataset.animationBlendProgress = (animation?.blendProgress ?? 0).toFixed(3);
    card.querySelector('[data-testid="animation-blend-progress"]')!.textContent = String(
      Math.round((animation?.blendProgress ?? 0) * 100),
    );
    const canAnimate =
      !!animation && !animation.disposed && animation.clips.length > 0 && !hasTransform;
    button("animated-model").disabled = !app || state === "disposed";
    button("skin-model").disabled = !app || state === "disposed";
    for (const action of ["animation-play", "animation-next", "animation-once", "animation-fade"])
      button(action).disabled = !canAnimate;
    button("animation-pause").disabled = !canAnimate || animationState !== "playing";
    button("animation-resume").disabled = !canAnimate || animationState !== "paused";
    button("animation-stop").disabled = !canAnimate || !animation?.action;
    const timeline = card.querySelector<HTMLInputElement>('[data-action="animation-seek"]')!;
    timeline.disabled = !canAnimate || !animation?.action;
    const duration = animation?.action?.getClip().duration ?? 0;
    const progress =
      duration > 0 ? Math.round(((animation?.action?.time ?? 0) / duration) * 100) : 0;
    timeline.value = String(progress);
    card.querySelector('[data-testid="animation-progress"]')!.textContent = String(progress);
  }

  function clearModel(): void {
    transition?.cancel();
    largeModel = false;
    fittedDistance = undefined;
    animation?.dispose();
    animation = undefined;
    animationIndex = 0;
    clearPicking();
    modelLabel?.dispose();
    modelLabel = undefined;
    modelVersion++;
    request?.abort();
    request = undefined;
    const previous = model;
    model = undefined;
    modelState = "idle";
    modelMessage = "模型未加载 · 使用项目原创的内嵌纹理样例";
    if (placeholder) placeholder.visible = !instance || instance.disposed;
    previous?.dispose();
    if (labels && !labels.disposed) labels.update();
  }

  function clearCapture(): void {
    captureVersion++;
    captureRequest?.abort();
    captureRequest = undefined;
    const preview = card.querySelector<HTMLImageElement>('[data-testid="capture-preview"]')!;
    preview.removeAttribute("src");
    preview.hidden = true;
    const download = card.querySelector<HTMLAnchorElement>('[data-testid="capture-download"]')!;
    download.removeAttribute("href");
    download.hidden = true;
    if (captureURL) URL.revokeObjectURL(captureURL);
    captureURL = undefined;
    captureState = "idle";
  }

  async function requestCapture(): Promise<void> {
    const owner = app;
    if (!owner || owner.state === "disposed") return;
    const version = ++captureVersion;
    const controller = new AbortController();
    captureRequest?.abort();
    captureRequest = controller;
    captureState = "encoding";
    refresh();
    try {
      const selectedFormat = card.querySelector<HTMLSelectElement>(
        '[data-action="capture-format"]',
      )!.value;
      const type =
        selectedFormat === "image/jpeg"
          ? "image/jpeg"
          : selectedFormat === "image/webp"
            ? "image/webp"
            : "image/png";
      const image = await captureFrame(owner, { signal: controller.signal, type, quality: 0.9 });
      if (version !== captureVersion || owner !== app || owner.signal.aborted) return;
      const url = URL.createObjectURL(image);
      if (captureURL) URL.revokeObjectURL(captureURL);
      captureURL = url;
      const preview = card.querySelector<HTMLImageElement>('[data-testid="capture-preview"]')!;
      preview.src = url;
      preview.hidden = false;
      const download = card.querySelector<HTMLAnchorElement>('[data-testid="capture-download"]')!;
      download.href = url;
      const extension =
        image.type === "image/jpeg" ? "jpg" : image.type === "image/webp" ? "webp" : "png";
      download.download = `scene-${id}.${extension}`;
      download.hidden = false;
      captureState = "ready";
    } catch (error) {
      if (version !== captureVersion || owner !== app) return;
      captureState =
        error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "error";
    } finally {
      if (version === captureVersion) {
        captureRequest = undefined;
        refresh();
      }
    }
  }

  function clearInstance(): void {
    clearPicking();
    instanceAnimation?.dispose();
    instanceAnimation = undefined;
    instanceLabel?.dispose();
    instanceLabel = undefined;
    const previous = instance;
    instance = undefined;
    previous?.dispose();
    if (placeholder) placeholder.visible = !model || model.disposed;
  }

  function copyInstance(source: GLTFModel): void {
    if (!app || app.state === "disposed") throw new Error("场景不可用");
    clearInstance();
    instance = cloneGLTF(app, source);
    instance.scene.position.x += 2.2;
    if (instance.animations.length) instanceAnimation = attachGLTFAnimations(app, instance);
    instanceLabel = addLabel(
      instance.scene.children[0] ?? instance.scene,
      `独立实例 · 场景 ${id}`,
      [0, 2, 0],
    );
    if (placeholder) placeholder.visible = false;
    if (app.state !== "running") app.render();
    refresh();
  }

  panels.set(id, { copy: copyInstance, available: () => !!app && app.state !== "disposed" });

  function ensureEffects(): PostprocessingHandle {
    if (!app || app.state === "disposed") throw new Error("场景不可用");
    if (!effects || effects.disposed)
      effects = attachPostprocessing(app, {
        bloom: { enabled: false, strength: strongBloom ? 2.5 : 1, threshold: 0.9 },
        outline: {
          enabled: false,
          edgeStrength: 4,
          visibleEdgeColor: 0xffdd44,
          selectedObjects: selectedObject ? [selectedObject] : [],
        },
      });
    return effects;
  }

  function clearEnvironment(): void {
    environmentVersion++;
    environmentRequest?.abort();
    environmentRequest = undefined;
    environment?.dispose();
    environment = undefined;
    environmentBinding = undefined;
    environmentState = "idle";
  }

  function clearTexture(): void {
    textureVersion++;
    textureRequest?.abort();
    textureRequest = undefined;
    textureAsset?.dispose();
    textureAsset = undefined;
    textureState = "idle";
  }

  async function requestTexture(url: string, ktx2 = false): Promise<void> {
    if (!app || app.state === "disposed" || !placeholder) return;
    const version = ++textureVersion;
    textureRequest?.abort();
    const controller = new AbortController();
    textureRequest = controller;
    const owner = app;
    const material = placeholder.material as MeshStandardMaterial;
    textureState = "loading";
    refresh();
    let loaded: TextureAsset | KTX2TextureAsset | undefined;
    try {
      loaded = ktx2
        ? await loadKTX2(owner, url, {
            signal: controller.signal,
            transcoderPath: { js: basisJS, wasm: basisWasm },
          })
        : await loadTexture(owner, url, { signal: controller.signal, flipY: textureFlip });
      if (version !== textureVersion || owner !== app || loaded.disposed) {
        loaded.dispose();
        return;
      }
      textureAsset?.dispose();
      const texture = loaded.texture;
      const previous = material.map;
      loaded.resources.track({
        dispose(): void {
          if (material.map === texture) {
            material.map = previous;
            material.needsUpdate = true;
          }
        },
      });
      material.map = texture;
      material.needsUpdate = true;
      textureAsset = loaded;
      loaded = undefined;
      textureState = "loaded";
      if (owner.state !== "running") owner.render();
    } catch (error) {
      loaded?.dispose();
      if (version !== textureVersion || owner !== app) return;
      textureState =
        error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "error";
    } finally {
      if (version === textureVersion) {
        textureRequest = undefined;
        refresh();
      }
    }
  }

  async function requestEnvironment(url: string): Promise<void> {
    if (!app || app.state === "disposed") return;
    const version = ++environmentVersion;
    environmentRequest?.abort();
    const controller = new AbortController();
    environmentRequest = controller;
    const owner = app;
    environmentState = "loading";
    refresh();
    let loaded: HDREnvironment | undefined;
    try {
      loaded = await loadHDR(owner, url, { signal: controller.signal });
      if (version !== environmentVersion || owner !== app || loaded.disposed) {
        loaded.dispose();
        return;
      }
      environment?.dispose();
      environmentBinding = attachEnvironment(owner, loaded, { background: environmentBackground });
      environment = loaded;
      loaded = undefined;
      environmentState = "loaded";
      if (owner.state !== "running") owner.render();
    } catch (error) {
      loaded?.dispose();
      if (version !== environmentVersion || owner !== app) return;
      environmentState =
        error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "error";
    } finally {
      if (version === environmentVersion) {
        environmentRequest = undefined;
        refresh();
      }
    }
  }

  async function requestModel(
    url: string,
    compression?: "draco" | "meshopt" | "ktx2",
  ): Promise<void> {
    if (!app || app.state === "disposed") return;
    clearModel();
    const owner = app;
    const version = modelVersion;
    const controller = new AbortController();
    request = controller;
    modelState = "loading";
    modelMessage = "正在加载与解析模型…";
    refresh();
    try {
      const decoders: Pick<LoadGLTFOptions, "draco" | "meshoptDecoder" | "ktx2"> = {};
      if (compression === "draco")
        decoders.draco = { decoderPath: { js: dracoJS, wasm: dracoWasm } };
      if (compression === "meshopt")
        decoders.meshoptDecoder = (
          await import("three/addons/libs/meshopt_decoder.module.js")
        ).MeshoptDecoder;
      if (compression === "ktx2")
        decoders.ktx2 = { transcoderPath: { js: basisJS, wasm: basisWasm } };
      const loaded = await loadGLTF(owner, url, {
        ...decoders,
        signal: controller.signal,
        onProgress: ({ ratio }) => {
          if (version !== modelVersion) return;
          modelMessage =
            ratio === null
              ? "下载中，文件总量未知…"
              : `文件下载 ${(ratio * 100).toFixed(0)}% · 等待解析完成`;
          refresh();
        },
      });
      if (version !== modelVersion || owner !== app || loaded.disposed) {
        loaded.dispose();
        return;
      }
      model = loaded;
      clearPicking();
      if (transform && !transform.disposed) transform.attach(loaded.scene);
      modelState = "loaded";
      modelMessage = `${url.endsWith(".glb") ? "GLB" : "GLTF"} 已加载 · 保留原始材质与尺寸`;
      if (placeholder) placeholder.visible = false;
      if (loaded.gltf.animations.length) animation = attachGLTFAnimations(owner, loaded);
      modelLabel = addLabel(
        loaded.scene.children[0] ?? loaded.scene,
        `原创模型 · 场景 ${id}`,
        [0, 2, 0],
      );
    } catch (error) {
      if (version !== modelVersion || owner !== app) return;
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      modelState = cancelled ? "cancelled" : "error";
      modelMessage = cancelled
        ? "加载已取消"
        : `加载失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      if (version === modelVersion) {
        request = undefined;
        refresh();
      }
    }
  }

  function report(error: unknown): void {
    errorOutput.textContent = error instanceof Error ? error.message : String(error);
    errorOutput.hidden = false;
  }

  function rebuild(): void {
    try {
      app?.dispose();
      orbit = undefined;
      effects = undefined;
      glow = undefined;
      strongBloom = false;
      transform = undefined;
      clearEnvironment();
      clearTexture();
      clearInstance();
      clearModel();
      errorOutput.hidden = true;
      app = new ThreeApp(viewport, { camera: { position: [4, 3, 5] }, maxPixelRatio: 2 });
      app.resources.track({ dispose: clearCapture });
      const owner = app;
      owner.signal.addEventListener(
        "abort",
        () => {
          queueMicrotask(() => {
            if (owner !== app || !owner.contextLost) return;
            clearInstance();
            clearModel();
            clearEnvironment();
            clearTexture();
            refresh();
          });
        },
        { once: true },
      );
      frames = 0;
      draws = 0;
      app.scene.background = new Color(0x11191b);
      const geometry = app.resources.track(
        id === "A" ? new BoxGeometry(1.6, 1.6, 1.6) : new IcosahedronGeometry(1.15, 0),
      );
      const material = app.resources.track(
        new MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.15, flatShading: true }),
      );
      const mesh = new Mesh(geometry, material);
      mesh.name = id === "A" ? "立方体" : "二十面体";
      placeholder = mesh;
      mesh.position.y = 1.1;
      app.scene.add(mesh, new AmbientLight(0xffffff, 1.7));
      glow = new Mesh(
        app.resources.track(new SphereGeometry(0.18, 16, 12)),
        app.resources.track(new MeshBasicMaterial({ color: new Color(4, 2, 0.5) })),
      );
      glow.position.set(1.9, 1.8, 0);
      glow.visible = false;
      app.scene.add(glow);
      const light = new DirectionalLight(0xffffff, 3.2);
      light.position.set(3, 6, 4);
      app.scene.add(light);
      const grid = new GridHelper(12, 24, 0x36504a, 0x223332);
      app.resources.track(grid.geometry);
      for (const gridMaterial of Array.isArray(grid.material) ? grid.material : [grid.material])
        app.resources.track(gridMaterial);
      app.scene.add(grid);
      orbit = attachOrbitControls(app);
      const { controls } = orbit;
      controls.target.set(0, 0.8, 0);
      controls.enableDamping = true;
      controls.minDistance = 3;
      controls.update();
      labels = attachDOMLabels(app, viewport.querySelector<HTMLDivElement>(".label-overlay")!);
      placeholderLabel = addLabel(mesh, `${mesh.name} · 场景 ${id}`, [0, 1.25, 0]);
      const marker = document.createElement("button");
      marker.className = "scene-marker";
      marker.dataset.testid = "label-button";
      marker.textContent = `标记 ${id}`;
      marker.setAttribute("aria-pressed", "false");
      const mark = (): void => {
        const pressed = marker.getAttribute("aria-pressed") !== "true";
        marker.setAttribute("aria-pressed", String(pressed));
        marker.textContent = `${pressed ? "已标记" : "标记"} ${id}`;
      };
      marker.addEventListener("click", mark);
      app.resources.track({ dispose: () => marker.removeEventListener("click", mark) });
      markerLabel = labels.add({
        object: mesh,
        element: marker,
        offset: [0, -1.1, 0],
        anchor: [0.5, 0],
        interactive: true,
      });
      markerLabel.visible = labelsVisible;
      const picking = attachPicking(app, {
        objects: () => {
          const roots = [];
          if (model && !model.disposed) roots.push(model.scene);
          if (instance && !instance.disposed) roots.push(instance.scene);
          return roots.length ? roots : [mesh];
        },
      });
      picking.on("hover", ({ intersection }) => {
        card.querySelector('[data-testid="hovered"]')!.textContent = intersection
          ? intersection.object.name || "模型网格"
          : "—";
        viewport.style.cursor = intersection ? "pointer" : "";
      });
      picking.on("click", ({ intersection }) => {
        selectedObject = intersection?.object;
        if (effects?.outline && !effects.disposed)
          effects.outline.selectedObjects = selectedObject ? [selectedObject] : [];
        card.querySelector('[data-testid="selected"]')!.textContent = intersection
          ? intersection.object.name || "模型网格"
          : "—";
        card.dataset.pickCount = String(Number(card.dataset.pickCount ?? 0) + 1);
        if (app?.state !== "running") app?.render();
        refresh();
      });
      app.onUpdate(({ delta }) => {
        if (!transform || transform.disposed) {
          mesh.rotation.y += delta * 0.35;
          mesh.rotation.x += delta * 0.12;
          if (model && !model.disposed && !animation) model.scene.rotation.y += delta * 0.35;
        }
        frames++;
      });
      app.onAfterRender(() => {
        draws++;
      });
      app.start();
    } catch (error) {
      try {
        app?.dispose();
      } catch {
        /* Keep the original initialization diagnostic. */
      }
      report(error);
    }
    refresh();
  }

  const click = (event: MouseEvent): void => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]")
      ?.dataset.action;
    try {
      if (action === "start") app?.start();
      if (action === "stop") app?.stop();
      if (action === "render") app?.render();
      if (action === "capture") void requestCapture();
      if (action === "cancel-capture") captureRequest?.abort();
      if (action === "clear-capture") clearCapture();
      if (action === "dispose") {
        app?.dispose();
        clearInstance();
        clearModel();
        clearEnvironment();
        clearTexture();
      }
      if (action === "rebuild") rebuild();
      if (action === "texture") void requestTexture("/textures/quadrants.png");
      if (action === "texture-ktx2") void requestTexture("/models/checker.ktx2", true);
      if (action === "texture-ktx2-error") void requestTexture("/textures/invalid.png", true);
      if (action === "texture-error") void requestTexture("/textures/invalid.png");
      if (action === "cancel-texture") textureRequest?.abort();
      if (action === "texture-flip") {
        textureFlip = !textureFlip;
        void requestTexture("/textures/quadrants.png");
      }
      if (action === "remove-texture") {
        clearTexture();
        if (app?.state !== "running") app?.render();
      }
      if (action === "transform" && app) {
        if (transform && !transform.disposed) transform.dispose();
        else {
          transition?.cancel();
          animation?.pause();
          transform = attachTransformControls(app, {
            object: model && !model.disposed ? model.scene : placeholder,
            orbitControls: orbit?.controls,
          });
          const owner = app;
          const handle = transform;
          handle.controls.addEventListener("change", () => {
            if (handle.disposed || owner !== app || owner.state === "disposed") return;
            if (owner.state !== "running") owner.render();
            refresh();
          });
        }
        if (app.state !== "running") app.render();
      }
      if (action === "transform-mode" && transform && !transform.disposed) {
        const mode = transform.controls.mode;
        transform.controls.setMode(
          mode === "translate" ? "rotate" : mode === "rotate" ? "scale" : "translate",
        );
      }
      if (action === "remove-transform") {
        transform?.dispose();
        transform = undefined;
        if (app?.state !== "running") app?.render();
      }
      if (action === "environment") void requestEnvironment("/environments/studio.hdr");
      if (action === "environment-error") void requestEnvironment("/environments/invalid.hdr");
      if (action === "cancel-environment") environmentRequest?.abort();
      if (action === "remove-environment") {
        clearEnvironment();
        if (app?.state !== "running") app?.render();
      }
      if (action === "environment-background" && app && environment && !environment.disposed) {
        environmentBackground = !environmentBackground;
        environmentBinding?.dispose();
        environmentBinding = attachEnvironment(app, environment, {
          background: environmentBackground,
        });
        if (app.state !== "running") app.render();
      }
      if (action === "glb") void requestModel("/models/sample.glb");
      if (action === "gltf") void requestModel("/models/sample.gltf");
      if (action === "draco") void requestModel("/models/draco.glb", "draco");
      if (action === "meshopt") void requestModel("/models/meshopt.glb", "meshopt");
      if (action === "ktx2") void requestModel("/models/ktx2.gltf", "ktx2");
      if (action === "ktx2-glb") void requestModel("/models/ktx2.glb", "ktx2");
      if (action === "ktx2-error") void requestModel("/models/ktx2.glb");
      if (action === "decoder-error") void requestModel("/models/draco.glb");
      if (action === "invalid-model") void requestModel("/models/invalid.gltf");
      if (action === "cancel-model") request?.abort();
      if (action === "remove-model") clearModel();
      if (action === "clone-model" && model) copyInstance(model);
      if (action === "clone-peer" && model) panels.get(id === "A" ? "B" : "A")?.copy(model);
      if (action === "clone-play") instanceAnimation?.play(0);
      if (action === "clone-pause") instanceAnimation?.pause();
      if (action === "remove-clone") {
        clearInstance();
        if (app?.state !== "running") app?.render();
      }
      if (action === "animated-model") void requestModel("/models/animated.glb");
      if (action === "skin-model") void requestModel("/models/skin-morph.glb");
      if (action === "animation-play") animation?.play(animationIndex);
      if (action === "animation-pause") animation?.pause();
      if (action === "animation-resume") animation?.resume();
      if (action === "animation-next" && animation?.clips.length) {
        animationIndex = (animationIndex + 1) % animation.clips.length;
        animation.play(animationIndex);
      }
      if (action === "animation-fade" && animation?.clips.length) {
        animationIndex = (animationIndex + 1) % animation.clips.length;
        animation.crossFadeTo(animationIndex, { duration: 2 });
        if (app?.state !== "running") app?.render();
      }
      if (action === "animation-once") animation?.play(animationIndex, { loop: "once" });
      if (action === "animation-stop") animation?.stop();
      if (action === "bloom" && app) {
        const pass = ensureEffects().bloom!;
        pass.enabled = !pass.enabled;
        // Keep the bright source visible when bypassing bloom so the halo can be compared.
        if (glow) glow.visible = true;
        if (app.state !== "running") app.render();
      }
      if (action === "outline" && app) {
        const pass = ensureEffects().outline!;
        pass.enabled = !pass.enabled;
        selectedObject ??= model && !model.disposed ? model.scene : placeholder;
        pass.selectedObjects = selectedObject ? [selectedObject] : [];
        if (app.state !== "running") app.render();
      }
      if (action === "bloom-strength" && effects && !effects.disposed) {
        strongBloom = !strongBloom;
        effects.bloom!.strength = strongBloom ? 2.5 : 1;
        if (app?.state !== "running") app?.render();
      }
      if (action === "remove-bloom") {
        effects?.dispose();
        effects = undefined;
        if (glow) glow.visible = false;
        if (app?.state !== "running") app?.render();
      }
      if (action === "large-model" && model) {
        transition?.cancel();
        model.scene.scale.multiplyScalar(largeModel ? 1 / 20 : 20);
        largeModel = !largeModel;
        fittedDistance = undefined;
        modelMessage = largeModel ? "模型已放大 20 倍 · 可点击适配视角" : "已恢复模型载入时的尺寸";
      }
      if (action === "fit" && app) {
        const target = model && !model.disposed ? model.scene : placeholder;
        if (target) {
          const frame = fitObject(app, target, { controls: orbit?.controls });
          fittedDistance = frame.distance;
          // The host stays stopped; the demo explicitly draws a single updated view when paused.
          if (app.state !== "running") app.render();
          labels?.update();
        }
      }
      if (action === "transition" && app) {
        const target = model && !model.disposed ? model.scene : placeholder;
        if (target) {
          const motion = transitionToObject(app, target, {
            controls: orbit?.controls,
            duration: 2,
            direction: [-1, 0.8, 1],
          });
          transition = motion;
          // This demo chooses to resume the host; the library never starts it implicitly.
          app.start();
          void motion.finished.then((result) => {
            if (transition !== motion) return;
            if (result.status === "completed") fittedDistance = result.frame.distance;
            if (result.status === "failed") report(result.error);
            refresh();
          });
        }
      }
      if (action === "cancel-transition") transition?.cancel();
      if (action === "labels") {
        labelsVisible = !labelsVisible;
        for (const label of [placeholderLabel, markerLabel, modelLabel, instanceLabel])
          if (label && !label.disposed) label.visible = labelsVisible;
        if (labels && !labels.disposed) labels.update();
        button("labels").setAttribute("aria-pressed", String(labelsVisible));
      }
      if (action === "width") {
        narrow = !narrow;
        viewport.style.width = narrow ? "66%" : "100%";
        button("width").setAttribute("aria-pressed", String(narrow));
      }
      if (action === "zero") {
        zero = !zero;
        viewport.style.height = zero ? "0px" : "340px";
        button("zero").setAttribute("aria-pressed", String(zero));
      }
      refresh();
    } catch (error) {
      report(error);
    }
  };
  card.addEventListener("click", click);
  const seek = (event: Event): void => {
    const input = event.target;
    if (
      !(input instanceof HTMLInputElement) ||
      input.dataset.action !== "animation-seek" ||
      !animation?.action
    )
      return;
    try {
      animation.seek((input.valueAsNumber / 100) * animation.action.getClip().duration);
      if (app?.state !== "running") app?.render();
      refresh();
    } catch (error) {
      report(error);
    }
  };
  card.addEventListener("input", seek);
  const interval = window.setInterval(refresh, 150);
  rebuild();
  teardown.push(() => {
    window.clearInterval(interval);
    card.removeEventListener("click", click);
    card.removeEventListener("input", seek);
    app?.dispose();
    clearInstance();
    clearModel();
    clearEnvironment();
    clearTexture();
  });
}

mountPanel("A", 0x8cdcc1);
mountPanel("B", 0xe8b178);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    for (const cleanup of teardown) cleanup();
  });
