# @adui/three

以生命周期为中心的 Three.js 封装。统一管理场景、渲染循环、容器尺寸和资源释放，同时保留原生 Three.js 对象的扩展能力。

> [!NOTE]
> 项目处于早期开发阶段，版本为 `0.0.0`，尚未发布 npm。当前通过工作区依赖 `workspace:*` 使用。支持 ESM、TypeScript 类型声明与 WebGL 2，Three.js peer 范围为 `>=0.187.0 <0.188.0`。

## 功能

- **场景宿主**：`ThreeApp` / `OrthographicThreeApp` 创建透视/正交相机与独立 scene、WebGLRenderer、canvas，演示比较见 `/?demo=orthographic`。
- **统一帧循环**：显式 start/stop、按秒更新回调，页面隐藏或容器零尺寸时自动暂停。
- **尺寸适配**：监听容器变化和 DPR，限制像素比，避免每帧重复调整绘制缓冲。
- **资源归属**：显式登记自有资源，幂等销毁，保护借用资源。
- **可选控制器**：OrbitControls 共用宿主循环，随实例释放。
- **模型加载**：支持 GLTF/GLB、逻辑取消、迟到结果清理和模型资源释放，保留原始材质与坐标。
- **压缩解码**：显式配置 Draco、Meshopt 与 KTX2；检测转码能力，隔离模型纹理所有权并清理在途任务。
- **对象拾取**：显式目标、最近命中、点击与悬停变化；拖拽过滤，随实例清理监听。
- **DOM 标签**：跟随对象定位，可选交互，自动隐藏视野外目标，随实例移除 DOM 与监听。
- **模型动画**：独立 Mixer，复用宿主循环，播放/暂停/切换、有限循环与往返，随模型或宿主清理。
- **路径运动**：借用原生三维曲线，驱动对象位置和可选切线朝向，支持独立暂停、替换与所有者清理；见[路径 API](packages/three/README.md#对象路径运动) 和 `/?demo=path` 演示。
- **泛光后处理**：可选 HDR 效果链，复用宿主绘制、跟随尺寸，显式关闭或释放资源。
- **相机取景**：透视与正交分别按世界边界、画布比例规划距离或 zoom，支持原生 OrbitControls 约束与同步。
- **视角保存**：数值快照支持 JSON 往返、当前比例适配及同类宿主重建后的恢复，显式交接控件与过渡。
- **画布截图**：复用当前管线导出完整画布或像素区域的 PNG/JPEG/WebP Blob，支持取消，不推进场景时间。
- **实例化网格**：借用几何体/材质，管理固定容量的矩阵、颜色、活动数量和专属 buffer，见[实例 API](packages/three/README.md#实例化网格)。开发服务的 `/?demo=instances` 提供独立演示。

## 快速开始

开发环境：Node.js `>=22.18.0`，pnpm `12.16.1`。

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

打开终端显示的地址，即可运行双实例演示：独立暂停/重启、改变容器尺寸、销毁重建，以及模型加载、拾取和标签交互。演示模型由本项目原创，不依赖在线资产。

## 基本用法

应用需直接依赖 `three@0.187.0`；TypeScript 应用直接导入 Three.js 对象时，还需将 `@types/three@0.187.0` 列为自身开发依赖。主包携带的类型依赖供库声明使用，pnpm 隔离布局不会自动把它提升为应用的直接类型依赖。当前使用工作区或本地打包文件，尚未从 npm 发布。

给容器设置明确尺寸：

```html
<div id="scene" style="width: 100%; height: 400px;"></div>
```

```ts
import { ThreeApp } from "@adui/three";
import { BoxGeometry, Mesh, MeshNormalMaterial } from "three";

const app = new ThreeApp(document.querySelector<HTMLElement>("#scene")!);
const geometry = app.resources.track(new BoxGeometry());
const material = app.resources.track(new MeshNormalMaterial());
const cube = new Mesh(geometry, material);
app.scene.add(cube);

app.onUpdate(({ delta }) => {
  cube.rotation.y += delta;
});
app.start();

// 页面离开时释放；在框架中使用对应的组件卸载钩子。
window.addEventListener("pagehide", () => app.dispose(), { once: true });
```

`scene`、`camera` 和 `renderer` 是原生对象，可直接配置。geometry、material、texture 需分别登记；只登记 Mesh 不会递归接管其资源。外部共享资源由其所有者管理。

暂停状态可调用 `app.render()` 绘制一帧并更新标签；不推进动画或启动宿主。`app.setRenderPipeline(pipeline)` 可独占替换绘制阶段，契约见 [管线与单次绘制](packages/three/README.md#绘制管线与单次绘制)。

`captureFrame(app, options)` 从可选 `@adui/three/capture` 入口导出实际画布图像；演示可选择格式、预览和下载。它不包含 DOM 标签，取消和临时画布所有权见[截图 API](packages/three/README.md#截图)。

### 相机控制

```ts
import { attachOrbitControls } from "@adui/three/controls";

const { controls } = attachOrbitControls(app);
controls.enableDamping = true;
```

### 加载模型

```ts
import { loadGLTF } from "@adui/three/loaders";
import { AmbientLight } from "three";

const controller = new AbortController();
app.scene.add(new AmbientLight(0xffffff, 2));
const model = await loadGLTF(app, "/models/sample.glb", {
  signal: controller.signal,
});

// 默认加入 app.scene；可访问 model.scene 和 model.gltf.animations。
// 加载中使用 controller.abort() 取消；加载成功后用 model.dispose() 移除。
// 模型也会自动随 app.dispose() 释放。
```

取消会立即拒绝 Promise，并清理迟到的返回结果；不保证底层网络或解码立即停止。完整选项、资源所有权及错误契约见 [主包 API 文档](packages/three/README.md)。

### 点击与悬停

```ts
import { attachPicking } from "@adui/three/interaction";

const picking = attachPicking(app, { objects: () => [cube] });
const off = picking.on("click", ({ intersection }) => {
  console.log(intersection?.object ?? null); // 空白区域为 null。
});
picking.on("hover", ({ intersection }) => {
  console.log("悬停对象变化", intersection?.object ?? null);
});
// off() 取消该订阅；picking.dispose() 或 app.dispose() 移除全部监听。
```

### DOM 标签

DOM 标签通过 `@adui/three/labels` 的 `attachDOMLabels(app, overlay)` 接入。应用提供与画布重合的定位覆盖层，再以 `labels.add({ object: cube, element })` 添加标签；内容、样式和框架卸载由应用负责。完整布局示例见 [标签 API](packages/three/README.md#dom-标签)。

### 压缩模型

压缩模型的解码配置与 Vite URL 示例见 [主包 API](packages/three/README.md#压缩模型)。演示提供“加载 Draco”“加载 Meshopt”和缺失解码器的失败恢复样例。

KTX2 纹理模型通过 `ktx2: { transcoderPath: { js, wasm } }` 接入，按当前 renderer 能力转码；目录方式同样支持。演示提供外部纹理 GLTF、内嵌 GLB 和缺少转码器示例，详见 [KTX2 API](packages/three/README.md#ktx2-纹理模型)。

### 选择描边

`attachPostprocessing(app, { outline: { selectedObjects: [model.scene] }, bloom: {} })` 可组合选择描边和泛光。与拾取联动时更新 `effects.outline.selectedObjects`；模型移除前清空。契约见 [组合效果](packages/three/README.md#选择描边与组合效果)。

### 泛光

从 `@adui/three/postprocessing` 导入 `attachBloom(app, { strength: 1, radius: 0.4, threshold: 0.85 })`；通过返回的 `pass` 调整原生参数或关闭效果，`dispose()` 完全释放并恢复默认绘制。演示提供泛光、强度和释放操作；限制及颜色/资源约定见 [泛光 API](packages/three/README.md#泛光后处理)。

### 对象变换

从 `@adui/three/controls` 导入 `attachTransformControls`，为场景对象挂接原生平移/旋转/缩放手柄，可借用同一宿主的 OrbitControls 协调拖拽。句柄负责自有 helper、事件和 GPU 资源，目标模型保持借用，见 [对象变换 API](packages/three/README.md#对象变换手柄)。

### 独立图片纹理

`@adui/three/textures` 的 `loadTexture` 返回拥有原生 Texture/ImageBitmap 的资产，支持颜色空间、解码时翻转、逻辑取消与迟到位图关闭。`loadKTX2` 支持显式转码器配置的二维 Basis 压缩纹理，保留文件颜色空间/mip，并独立管理 Worker 与迟到结果。加载不自动修改材质，演示在占位物体上验证方向图和棋盘图，见 [纹理 API](packages/three/README.md#独立图片纹理)。

### HDR / EXR 环境

从 `@adui/three/environment` 导入 `loadHDR` / `loadEXR` 与 `attachEnvironment`，先加载资产，再按应用的请求版本绑定环境照明/可选背景。资产或宿主释放时先解绑，保留外部场景变更；演示提供加载、背景切换、取消和失败恢复，见 [HDR API](packages/three/README.md#hdr-环境)。

### 相机取景

```ts
import { fitObject } from "@adui/three/camera";

fitObject(app, model.scene, { padding: 1.2 });
// 已接入 OrbitControls 时传入 controls: orbitHandle.controls。
```

这是即时取景，不会启动宿主或创建额外循环。演示的“适配视角”和“大模型”可验证不同尺寸目标，选项、裁剪面和控件限制见 [相机 API](packages/three/README.md#相机取景)。

同一入口的 `transitionToObject(app, model.scene, { controls, duration: 0.8 })` 提供平滑取景，返回进度、状态、始终 resolve 的 finished 结果和 cancel/dispose。复用宿主帧循环，暂停时保留进度；新取景、拖拽/滚轮或销毁可打断。演示提供“平滑取景”“取消过渡”，完整边界见 [过渡 API](packages/three/README.md#相机平滑过渡)。

### 模型动画

```ts
import { attachGLTFAnimations } from "@adui/three/animation";

const animations = attachGLTFAnimations(app, model);
if (animations.clips.length) animations.play(0);
// animations.pause() / resume() / stop()；也可按唯一片段名播放。
// 模型移除或宿主销毁时自动清理，不接管 model 资产。
```

演示的“加载动画样例”提供原创 Lift / Slide 两个片段。加载不会自动播放；动画跟随宿主启停，控制器暂停与宿主暂停可分别操作。`animations.seek(seconds)` 精确定位后暂停，演示时间轴支持姿态检查。`crossFadeTo` 支持可中断渐变切换，沿用宿主时钟。

`cloneGLTF(app, model)` 从已加载模型创建独立实例，也可指定另一个宿主；节点、骨骼和动画数据独立，几何体/材质/纹理由租约共享到最后一个使用者结束。演示提供“创建实例”和“复制到另一场景”，用于检查源模型移除后的持续使用；完整所有权边界见[主包 API](packages/three/README.md#复用模型资产)。

## 开发

| 命令                       | 用途                                       |
| -------------------------- | ------------------------------------------ |
| `pnpm run dev`             | 启动演示，开发时主包源码支持 HMR           |
| `pnpm run ready`           | 文档、格式、Lint、类型、单元测试和构建     |
| `pnpm run test:package`    | 实际打包并在独立项目中安装，验证入口和类型 |
| `pnpm run test:browser`    | 构建生产演示并运行真实 Chromium 回归       |
| `pnpm run fixtures:models` | 重建原创 GLTF/GLB 测试模型                 |
| `pnpm run docs:check`      | 检查文档结构、链接和需求追踪               |

首次运行浏览器回归前安装对应浏览器：

```sh
pnpm exec playwright install chromium
pnpm run test:browser
```

当前有 428 项主包单元测试和 99 项浏览器回归。浏览器实测使用 Chromium / SwiftShader，完整兼容矩阵与长期 GPU 资源基准仍待补充；尚未支持 WebGPU、WebXR或框架适配。

## 项目结构

```text
packages/three/       主库、可选子入口与单元测试
apps/website/         双实例与模型演示
tests/browser/       生产构建的浏览器回归
scripts/             文档校验与模型生成
docs/                需求、设计、决策与验证记录
```

[API 文档](packages/three/README.md) · [架构与设计](docs/ARCHITECTURE.md) · [开发验证](docs/HARNESS.md) · [贡献指南](CONTRIBUTING.md) · [Agent 协作约定](AGENTS.md)
