# ADR-0049 ThreeApp 统一后端选择

- 状态：Accepted
- 日期：2026-11-19
- 关联需求：FR-065、FR-064、NFR-001、NFR-002
- 替代关系：扩展 ADR-0048 的创建入口，保留已有同步构造和 webgpu 子入口

## 决策

创建入口和选项名称已由 [ADR-0050](0050-public-app-api.md) 定稿；下文保留阶段记录，生命周期原则继续适用。

ThreeApp.create(container, options?) 通过 backend 选择 webgl（默认）或 webgpu，统一返回已就绪、未启动的透视宿主。创建后配置场景并 start，不暴露 initializing 对象或额外 ready Promise。

new ThreeApp 保留同步 WebGL 构造，允许显式 backend:webgl；传入 webgpu 在类型和运行时均拒绝并指向异步工厂。不让构造器返回 Promise，也不在未就绪时接受绘制命令。OrthographicThreeApp 同步行为保持，本次不新增正交 WebGPU 工厂。

WebGPU 的 fallback 默认 true，允许原生节点 renderer 的 WebGL 2 回退；false 映射为严格 WebGPU，发现回退则清理并拒绝。主工厂不使用 auto/webgl2 作为创建选择。原 createWebGPUApp 子入口保留兼容与强制回退诊断。

## 类型与按需加载

CreateThreeAppOptions 为 WebGLAppCreateOptions / WebGPUAppCreateOptions 的判别联合。字面量选项通过重载分别返回 ThreeApp（WebGLRenderer）或 WebGPUThreeApp（WebGPURenderer）；动态选项返回两者联合。宿主 getter rendererType 给出 webgl/webgpu，可收窄动态返回值；backend 给出实际 webgl2/webgpu。

回退后的 rendererType 仍为 webgpu，不能仅根据 backend:webgl2 调用 WebGL 专属插件。默认核心只对 webgpu 类型做静态类型引用，显式请求时动态加载模块；默认 WebGL 路径不初始化 WebGPU、不请求适配器。

## 创建与取消

在动态导入之前快照顶层选项、renderer 字段、camera 字段和 position 元组。非法后端、非布尔 fallback、WebGL 误传 fallback、非法镜头对象与预先取消在分配前拒绝。

signal 仅作用于创建。动态模块加载期间取消立即拒绝，不终止模块运输，也不在迟到后创建 renderer；导入成功后交接给既有 WebGPU 生命周期。WebGL 挂载中同步取消回滚新宿主。成功后解除创建监听，卸载调用 dispose/disposeAsync；加载模型用 app.signal。

本层只选择和准备配置，不复制 RAF、renderer 初始化或资源清理实现。故障和迟到清理沿用 ADR-0048。静态工厂返回对应宿主，WebGPU 路径不以 instanceof ThreeApp 判断能力，通过类型和 rendererType 判断。

## 验证

单测覆盖默认同步兼容、回退策略、导入前参数快照、导入期间取消、非法选项和挂载取消；严格打包消费覆盖精确 renderer 类型、动态收窄及 WebGL 专属能力拒绝。浏览器分别测试统一 WebGL、WebGPU 自动回退、严格 WebGPU 和兼容入口强制回退，无适配器跳过不计为 GPU 验收。正式示例与 API 统一使用 ThreeApp.create，结果见 [Harness](../HARNESS.md)。

- [Three.js 异步初始化与回退](https://threejs.org/manual/pages/webgpurenderer.html)
- [Renderer 原生生命周期](https://threejs.org/docs/pages/Renderer.html)
