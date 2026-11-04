# @adui/three

以生命周期为中心的 Three.js 封装。统一管理场景、渲染循环、容器尺寸和资源释放，同时保留原生 Three.js 对象的扩展能力。

> [!NOTE]
> 项目处于早期开发阶段，版本为 `0.0.0`，尚未发布 npm。当前通过工作区依赖 `workspace:*` 使用。支持 ESM、TypeScript 类型声明与 WebGL 2，Three.js peer 范围为 `>=0.187.0 <0.188.0`。

## 功能

- **场景宿主**：`ThreeApp` 创建独立的 scene、PerspectiveCamera、WebGLRenderer 和 canvas。
- **统一帧循环**：显式 start/stop、按秒更新回调，页面隐藏或容器零尺寸时自动暂停。
- **尺寸适配**：监听容器变化和 DPR，限制像素比，避免每帧重复调整绘制缓冲。
- **资源归属**：显式登记自有资源，幂等销毁，保护借用资源。
- **可选控制器**：OrbitControls 共用宿主循环，随实例释放。
- **模型加载**：支持 GLTF/GLB、逻辑取消、迟到结果清理和模型资源释放，保留原始材质与坐标。

## 快速开始

开发环境：Node.js `>=22.18.0`，pnpm `12.16.1`。

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

打开终端显示的地址，即可运行双实例演示：独立暂停/重启、改变容器尺寸、销毁重建，以及模型加载、取消、移除和失败恢复。演示模型由本项目原创，不依赖在线资产。

## 基本用法

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

## 开发

| 命令                       | 用途                                   |
| -------------------------- | -------------------------------------- |
| `pnpm run dev`             | 启动演示，开发时主包源码支持 HMR       |
| `pnpm run ready`           | 文档、格式、Lint、类型、单元测试和构建 |
| `pnpm run test:browser`    | 构建生产演示并运行真实 Chromium 回归   |
| `pnpm run fixtures:models` | 重建原创 GLTF/GLB 测试模型             |
| `pnpm run docs:check`      | 检查文档结构、链接和需求追踪           |

首次运行浏览器回归前安装对应浏览器：

```sh
pnpm exec playwright install chromium
pnpm run test:browser
```

当前有 36 项主包单元测试和 3 项浏览器回归。浏览器实测使用 Chromium / SwiftShader，完整兼容矩阵与长期 GPU 资源基准仍待补充；尚未支持 WebGPU、WebXR、压缩模型解码配置或框架适配。

## 项目结构

```text
packages/three/       主库、可选子入口与单元测试
apps/website/         双实例与模型演示
tests/browser/       生产构建的浏览器回归
scripts/             文档校验与模型生成
docs/                需求、设计、决策与验证记录
```

[API 文档](packages/three/README.md) · [架构与设计](docs/ARCHITECTURE.md) · [开发验证](docs/HARNESS.md) · [贡献指南](CONTRIBUTING.md) · [Agent 协作约定](AGENTS.md)
