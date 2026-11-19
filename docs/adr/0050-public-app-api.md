# ADR-0050 正式宿主 API 与命名

- 状态：Accepted
- 日期：2026-11-19
- 关联需求：FR-066、FR-065、FR-064、NFR-001、NFR-002
- 替代关系：替代 ADR-0048/0049 的阶段性创建入口及选项命名，保留其生命周期原则

## 正式入口

唯一主要创建方式为 ThreeApp.create(container, options?:ThreeAppCreateOptions)。渲染器选择与原生配置集中在 renderer：type 为 webgl（默认）或 webgpu，WebGPU 的 allowFallback 为布尔值、默认 true。配置在异步边界前快照，初始化完成才返回 ready 实例，不自动运行。

两条路径均为实际 ThreeApp 实例，instanceof ThreeApp 成立。实例类型 ThreeApp<"webgl"> / ThreeApp<"webgpu"> 保留精确 renderer，动态配置返回 ThreeAppInstance 判别联合。公开同步构造签名固定返回 WebGL，避免上下文推断为错误的泛型。内部由同一个具名宿主实现承载，WebGPU 初始化通过私有准备数据构造该宿主，不生成另一种公开宿主对象。

ThreeAppOptions 保留给同步构造，ThreeAppCreateOptions 为主要创建配置；WebGLRendererOptions / WebGPURendererOptions 表达渲染器配置。rendererType 反映渲染器族，可用于类型收窄；backend 反映实际 webgl2/webgpu，回退不改变渲染器族。

## 生命周期名称

start / stop 表达连续渲染的启停；renderOnce 明确只绘制一帧，不执行更新或安排 RAF；destroy 表达完整结束宿主并等待原生 GPU 清理。onUpdate / onAfterRender 保留明确的阶段含义，resources.track 保留显式所有权。主文档与9个正式示例使用这些名称。

destroy 调用即同步置 disposed、停止循环、abort signal、移除监听/画布并发起资源清理，返回 Promise 等待 renderer 最终清理，错误可观察，重复调用幂等。原 dispose 继续支持同步 Disposable 协议，render / disposeAsync 作为已有低层兼容方法保留；不作为新的主要用法。状态名 disposed 保持既有契约。

## 删除阶段性入口

主工厂不接受顶层 backend / fallback / rendererType；运行时提前拒绝并提示 renderer.type / renderer.allowFallback，避免旧配置静默创建错误后端。阶段性 CreateThreeAppOptions、WebGLAppCreateOptions、WebGPUAppCreateOptions 和 WebGPUThreeApp 类型不再导出。使用正式类型 ThreeAppCreateOptions / ThreeApp<"webgpu"> / ThreeAppInstance。

撤回本会话新增且尚未发布的 @adui/three/webgpu 入口，原始17个公开入口保持。WebGPU 实现移入 core/webgpu-host.ts，按需导入，不单独暴露另一套创建策略；内部 forceWebGL 仅用于生命周期单测，不进入正式配置。根模块可在无 DOM 环境安全导入。

## 取消与所有权

创建 signal 只控制创建，覆盖惰性模块导入和原生初始化。成功后的模型任务使用 app.signal，组件卸载调用 destroy。迟到初始化和失败清理沿用 ADR-0048；本次不新增第二循环、资产隐式所有权或依赖。资源回收不是一次 GPU fence 等待，原生 init 拒绝后的部分分配限制仍如实记录。

## 验证与阶段

后续扩展边界已由 [ADR-0051](0051-renderer-feature-parity.md) 更新；以下保留本决策阶段的验收说明。

单测验证原同步 WebGL 生命周期、新配置/取消/快照、统一类身份、单次绘制和完整销毁。严格 tarball 消费检查17入口、WebGPU 私有路径拒绝、精确类型和动态收窄。真实浏览器分别验证 WebGL、WebGPU 回退和严格原生；无适配器的原生用例仍跳过，不能称为 GPU 验收通过。

正式 API 契约不等同发布或完整设备支持。本次不发布 npm、不升级依赖、不做 CI；原生 WebGPU 硬件矩阵、节点特效及正交 WebGPU 仍待验收或后续需求。结果见 [Harness](../HARNESS.md)，使用见 [快速开始](../guide/getting-started.md)。

- [Three.js WebGPU 初始化与回退](https://threejs.org/manual/pages/webgpurenderer.html)
- [Three.js Renderer 生命周期](https://threejs.org/docs/pages/Renderer.html)
- [TypeScript 构造签名](https://www.typescriptlang.org/docs/handbook/2/functions.html#construct-signatures)
