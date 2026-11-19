# ADR-0048 可选 WebGPU 基础宿主

- 状态：Accepted
- 日期：2026-11-19
- 关联需求：FR-064、NFR-001、NFR-002
- 替代关系：扩展 ADR-0002 的后端范围，保留默认 WebGL 宿主和既有公开入口

## 决策

创建入口和选项名称已由 [ADR-0050](0050-public-app-api.md) 定稿；下文保留阶段记录，生命周期原则继续适用。

新增独立 `@adui/three/webgpu` 入口，公开 `createWebGPUApp(container, options):Promise<WebGPUThreeApp>`。继续固定 Three.js 0.187.0，不升级依赖。默认 WebGL 路径不静态加载或初始化 three/webgpu；后续统一工厂按需加载见 [ADR-0049](0049-unified-app-creation.md)。基础阶段仅提供具体 PerspectiveCamera；正交 WebGPU 工厂和节点特效后续单独评估。

原同步 ThreeApp/OrthographicThreeApp 与新入口共用内部 SceneHost 的单一 RAF、启停、尺寸/DPR、隐藏/零尺寸暂停、RenderPipeline、订阅和资源作用域。AnyThreeApp 保留 WebGL 专属 renderer 类型；新增 SceneApp/PerspectiveSceneApp/OrthographicSceneApp 用于与后端无关的接口，避免把 WebGL 插件错误扩大为通用 API。

## 初始化与取消

容器、DPR/delta、镜头、后端选择与 renderer 选项在 DOM/GPU 分配前校验和快照。renderer 仅接受显式配置白名单，不接受外部 canvas/context/device/getFallback。原生 renderer.init 在离屏自有画布完成后才挂载宿主，不启动 RAF。

backend 默认 auto，允许原生回退；webgl2 强制使用 WebGPURenderer 的 WebGL 2 后端；webgpu 在初始化后检查真实坐标系并拒绝回退，拒绝的 renderer 仍清理。app.backend 返回实际 webgpu/webgl2；回退并不使 GLSL ShaderMaterial/EffectComposer 兼容。

signal 只取消创建，不绑定成功宿主生命周期。取消立即拒绝 AbortError，不尝试终止原生适配器/设备请求；迟到完成不挂载，最终清理一次。初始化错误保留原错误，取消/失败后的清理错误通过 onCleanupError（默认 console.error）报告。

## 清理与设备丢失

dispose 同步置 disposed、停止 RAF、abort 宿主 signal、结束资源/监听并移除自有画布。两种宿主均新增 disposeAsync，等待原生清理并聚合先前同步清理错误；调用方应等待它检查 WebGPU 清理结果。原生 WebGPU renderer.dispose 返回 Promise，不允许在后台直接丢弃该拒绝。

原生 renderer.onDeviceLost 与 WebGL contextlost 结束宿主，保留 contextLost 诊断，需要显式重建。成功初始化后的清理只执行一次。WebGL 回退在原生清理后显式释放自有 context；WebGPU device 由原生 backend 释放，不接收外部 device。宿主公开 renderer 仍可配置，应用不能覆盖其设备丢失回调或私自驱动/销毁 renderer。

r187 原生 dispose 在 init 拒绝后再次等待同一 init，会再次拒绝；未交付的原生部分 GPU 分配不能承诺完全释放。SDK 尝试公开清理、移除画布并报告失败，不访问原生私有缓存。

## 兼容范围

controls、loaders、animation、camera、interaction、labels、textures 和 geometry 的宿主参数扩大到 SceneApp；CPU 数学、原生 GLTF/Draco/Meshopt/KTX2 与既有逻辑取消契约复用。DOM 标签采用实际相机坐标系的近远裁剪，WebGPU 使用 [0,1] 深度。

postprocessing/effects/lighting/rendering/capture/Room 环境仍为 WebGL 专属，类型不接受 WebGPU 宿主，并对绕过类型的 JS 调用提前拒绝。HDR/EXR 绑定、角色导航及各可选能力在 WebGPU 上的完整验收尚未完成；通用类型接通不表示所有原生材质/扩展和 GPU 释放行为已逐项验证。

## 验证与边界

单测覆盖初始化取消、迟到清理、严格后端、独立宿主、设备丢失、挂载失败回滚、异步错误与标签裁剪。真实浏览器分开测试 WebGPU 和 WebGL 回退的像素、模型动画、拾取、控件、DOM 标签、尺寸及重建；没有原生适配器时明确跳过原生测试，不能计为 WebGPU GPU 验收成功。设置 ADUI_REQUIRE_WEBGPU=1 可将缺失适配器变为失败。

正式 examples 增加异步 mount，context.signal 取消未完成初始化，请求版本隔离迟到结果。SDK 清理不依赖示例；工作区和独立 tarball 消费涵盖新增入口。实际结果见 [Harness](../HARNESS.md)。不承诺 FPS、设备矩阵或性能提升。

## 官方依据

- [WebGPURenderer 与迁移限制](https://threejs.org/manual/pages/webgpurenderer.html)
- [Renderer 的 init/dispose/坐标系及设备丢失接口](https://threejs.org/docs/pages/Renderer.html)
- [r187 WebGPURenderer](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgpu/WebGPURenderer.js)
- [r187 Renderer 异步初始化与清理](https://github.com/mrdoob/three.js/blob/r187/src/renderers/common/Renderer.js)
- [r187 KTX2 双 renderer 能力检测](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/loaders/KTX2Loader.js)
