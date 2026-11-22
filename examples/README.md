# ADui Three 示例

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

每个主题可展开“渲染统计”，查看原生绘制/资源计数、宿主观测FPS与帧间隔；基础主题另提供“读取统计快照”。计数与估算的解释见[API](../docs/api/rendering.md#渲染统计与监视)，不代表整帧 pass 合计或设备显存占用。

基础主题提供宿主驱动的 GSAP 时间线；模型主题提供模型/HDR 批任务、取消和预加载；渲染器主题提供正交/透视重建，可分享 `/play/?example=webgpu&projection=orthographic&renderer=webgpu`。

独立用法直接使用公开 API，配套 HTML 与安装步骤见[文档目录](../docs/examples/index.md)；画廊实现保留完整交互回归。

| 主题           | TypeScript                             | JavaScript                             | 画廊实现                            |
| -------------- | -------------------------------------- | -------------------------------------- | ----------------------------------- |
| 场景与生命周期 | [basic.ts](recipes/basic.ts)           | [basic.js](recipes/basic.js)           | [交互演示](src/cases/basic.ts)      |
| 模型与动画     | [model.ts](recipes/model.ts)           | [model.js](recipes/model.js)           | [交互演示](src/cases/model.ts)      |
| 相机与视角     | [camera.ts](recipes/camera.ts)         | [camera.js](recipes/camera.js)         | [交互演示](src/cases/camera.ts)     |
| 交互 DOM 标签  | [labels.ts](recipes/labels.ts)         | [labels.js](recipes/labels.js)         | [交互演示](src/cases/labels.ts)     |
| 点云与流光     | [effects.ts](recipes/effects.ts)       | [effects.js](recipes/effects.js)       | [交互演示](src/cases/effects.ts)    |
| 光影与环境     | [shadows.ts](recipes/shadows.ts)       | [shadows.js](recipes/shadows.js)       | [交互演示](src/cases/shadows.ts)    |
| 角色导航       | [navigation.ts](recipes/navigation.ts) | [navigation.js](recipes/navigation.js) | [交互演示](src/cases/navigation.ts) |
| 实例化网格     | [instances.ts](recipes/instances.ts)   | [instances.js](recipes/instances.js)   | [交互演示](src/cases/instances.ts)  |
| 渲染器与输出   | [webgpu.ts](recipes/webgpu.ts)         | [webgpu.js](recipes/webgpu.js)         | [交互演示](src/cases/webgpu.ts)     |

所有主题使用同一套 API；渲染器选择由 ExampleContext 传入，shared.createScene 使用 ThreeApp.create 并传递创建 signal。资产来自共享 [fixtures](../fixtures/README.md)，不依赖私有模型。

## 新增示例

新增画廊主题在src/cases导出mount(context)，另在recipes独立编写公开TS用法并登记[catalog](src/catalog.ts)。运行examples:generate生成JS，文档引用双语言与HTML。控件和资源沿用宿主生命周期，不另建RAF；修改后运行ready、test:recipes及test:site，其他门禁按[Harness](../docs/HARNESS.md)。

正式使用说明见 [文档目录](../docs/examples/index.md)，集成竞争与资源诊断见 [website](../apps/website/README.md)。

## 界面与品牌

使用用户提供的 ADui Three 横向标志，技术包名保持 @adui/three。共享基础令牌与原创静态几何预览不进入 SDK，设计和可访问性维护见[界面设计与品牌](../docs/development/visual-design.md)。

## 源码高亮与页面动效

对外源码来自独立编写的recipes，提供TypeScript与自动生成JavaScript、HTML、package.json和说明；不引用画廊shared.ts或ExampleContext。完整工程下载包含当前SDK本地包与必要资产，解压后pnpm install、pnpm run dev；主包未发布npm。修改TS后执行examples:generate，ready检查生成漂移，test:recipes验证18份外部工程。阅读器保留原文复制、主题/换行、展开与Escape，页面GSAP动效仍与场景时钟独立。
