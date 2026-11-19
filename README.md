# @adui/three

以清晰的生命周期封装 Three.js。统一管理场景、相机、帧循环、尺寸和资源，保留原生 Three.js 对象，按需组合模型、交互、导航和视觉效果。

> [!NOTE]
> 当前版本 **0.0.0，尚未发布 npm**。ESM / TypeScript / 默认 WebGL 2，可选 WebGPU，扩展 API 共用；Three.js 与类型版本固定为 **0.187.0**，peer 范围为 `>=0.187.0 <0.188.0`。

[快速开始](docs/guide/getting-started.md) · [API 参考](docs/api/index.md) · [正式示例](examples/README.md) · [开发文档](docs/development/index.md)

## 本地运行

Node.js `>=22.18.0`，pnpm `12.16.1`。

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

打开终端中的 `/play/` 地址。示例画廊包含场景、模型动画、相机、复杂 DOM 标签、点云与流光、阴影、第一/第三人称及实例化，每个主题都能查看实际源码。

```sh
pnpm run docs:dev      # VitePress 文档站，包含已构建的示例
pnpm run docs:build    # 构建完整文档与示例
pnpm run docs:preview  # 本地预览构建结果
```

尚未发布时的工作区与 tarball 接入见[安装与版本](docs/guide/installation.md)。

## 基本用法

容器需要明确尺寸。应用直接依赖 `three@0.187.0`，直接使用 Three.js 类型时另安装 `@types/three@0.187.0`。

```ts
import { ThreeApp } from "@adui/three";
import { BoxGeometry, Mesh, MeshNormalMaterial } from "three";

const container = document.querySelector<HTMLElement>("#scene")!;
const app = await ThreeApp.create(container, { renderer: { type: "webgl" } });
const geometry = app.resources.track(new BoxGeometry());
const material = app.resources.track(new MeshNormalMaterial());
const cube = new Mesh(geometry, material);
app.scene.add(cube);
app.onUpdate(({ delta }) => {
  cube.rotation.y += delta;
});
app.start();

// 页面或组件卸载时调用；不会递归接管未登记的借用资源。
window.addEventListener(
  "pagehide",
  () => {
    void app.destroy().catch(console.error);
  },
  { once: true },
);
```

`scene`、`camera`、`renderer` 是原生对象。场景创建后默认不运行，暂停状态可 `app.renderOnce()` 绘制一帧。

## 能力

| 领域       | 能力与文档                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 场景与资源 | [透视/正交宿主、帧循环、尺寸、资源范围](docs/api/core.md)                                                                                              |
| 模型与动画 | [GLTF/GLB、Draco/Meshopt/KTX2](docs/api/loaders.md)、[动作混合、定位、路径运动](docs/api/animation.md)                                                 |
| 相机与交互 | [取景与视角](docs/api/camera.md)、[拾取](docs/api/interaction.md)、[DOM 标签](docs/api/labels.md)、[原生控件](docs/api/controls.md)                    |
| 导航与几何 | [第一/第三人称](docs/api/navigation.md)、[BVH 碰撞](docs/api/collision.md)、[路径与实例化](docs/api/geometry.md)                                       |
| 视觉效果   | [点云飞线、流光与空间特效](docs/api/effects.md)、[阴影](docs/api/lighting.md)、[泛光/描边/滤镜](docs/api/postprocessing.md)                            |
| 环境与输出 | [HDR/EXR/Room](docs/api/environment.md)、[图片/KTX2 纹理](docs/api/textures.md)、[Editor 渲染基准](docs/api/rendering.md)、[截图](docs/api/capture.md) |

统一 [ThreeApp.create 后端选择](docs/api/webgpu.md) 通过 renderer.type:webgl/webgpu 创建宿主，提供异步初始化和实际后端诊断；原生 GPU 验收受当前适配器环境限制，效果兼容范围见文档。

完整的 17 个公开入口见 [API 索引](docs/api/index.md)。库不依赖业务 Store、框架或固定 DOM 选择器。

## 目录结构

```text
packages/three/      SDK、17 个公开入口与单元测试
examples/            面向使用者的正式示例与源码画廊
apps/docs/           VitePress 配置、主题与文档构建
apps/website/        浏览器回归 playground，保留已有调试场景
docs/                使用指南、API、示例说明和开发文档
fixtures/            两个消费者共用的原创测试资产与许可记录
tests/               浏览器、站点与独立包消费验证
```

[目录与边界](docs/development/package-layout.md)说明内部实现分组。已有调试场景使用 `pnpm run dev:playground`。

## 本地验证

```sh
pnpm run ready
pnpm run test:package
pnpm run test:browser
pnpm run test:site
```

具体范围、真实结果与限制见 [Harness](docs/HARNESS.md)。浏览器与硬件兼容矩阵仍待扩展，当前不提供性能保证。

[贡献指南](CONTRIBUTING.md) · [MIT](LICENSE)
