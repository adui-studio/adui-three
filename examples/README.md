# @adui/three 示例

9 个可独立阅读的场景，直接消费公开 SDK 入口。每个主题同时提供运行画面和实际源码；画廊负责切换、取消旧初始化、销毁与重建。

## 运行

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

打开终端显示的 /play/ 地址。examples:build 构建此目录的 dist，docs:build 将同一套产物嵌入文档站 /play/，没有第二份演示实现。

## 选择渲染器

进入任一主题后，可在工具栏选择 WebGL、WebGPU 允许回退或 WebGPU 严格模式。切换会结束旧宿主并重新创建，旁边显示渲染器族与实际后端。

地址可保存和分享，例如 /play/?example=effects&renderer=webgpu-strict。浏览器后退会恢复相应主题与后端选择。默认使用 WebGL；渲染器与输出主题默认选择 WebGPU 允许回退。严格模式初始化失败会显示原因，不静默切换为 WebGL。

## 示例目录

| 主题           | 源码                                     | 内容                           |
| -------------- | ---------------------------------------- | ------------------------------ |
| 场景与生命周期 | [basic.ts](src/cases/basic.ts)           | 原生对象、统一更新、暂停与释放 |
| 模型与动画     | [model.ts](src/cases/model.ts)           | 本地 GLB、异步加载与 Mixer     |
| 相机与视角     | [camera.ts](src/cases/camera.ts)         | 取景、平滑过渡与数值视角       |
| 交互 DOM 标签  | [labels.ts](src/cases/labels.ts)         | 输入框、按钮与完整卡片         |
| 点云与流光     | [effects.ts](src/cases/effects.ts)       | 飞点、路径带、波纹、光柱与护罩 |
| 光影与环境     | [shadows.ts](src/cases/shadows.ts)       | 阴影、色彩与 Room 环境         |
| 第一与第三人称 | [navigation.ts](src/cases/navigation.ts) | 控件、输入和静态 BVH           |
| 实例化网格     | [instances.ts](src/cases/instances.ts)   | 共享资产和独立实例数据         |
| 渲染器与输出   | [webgpu.ts](src/cases/webgpu.ts)         | 后端、泛光、描边、环境和截图   |

所有主题使用同一套 API；渲染器选择由 ExampleContext 传入，shared.createScene 使用 ThreeApp.create 并传递创建 signal。资产来自共享 [fixtures](../fixtures/README.md)，不依赖私有模型。

## 新增示例

新增主题时在 src/cases 导出 async mount(context)，返回自有 SceneApp；登记 [catalog](src/catalog.ts)，再在 docs/examples 引用真实源码。控件、效果和事件沿用宿主生命周期，不另建 RAF。修改后运行 ready 和 test:site，涉及 SDK 或渲染行为时按 [Harness](../docs/HARNESS.md) 补充验证。

正式使用说明见 [文档目录](../docs/examples/index.md)，集成竞争与资源诊断见 [website](../apps/website/README.md)。
