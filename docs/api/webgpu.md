# ThreeApp 渲染器配置

统一从 `@adui/three` 导入 `ThreeApp`。通过 `renderer.type` 选择渲染器，使用 `ThreeApp.create()` 完成初始化；返回值是已就绪、未运行的 ThreeApp 实例。

## 创建

```ts
import { ThreeApp } from "@adui/three";

const app = await ThreeApp.create(container, {
  renderer: {
    type: "webgpu", // "webgl" 或 "webgpu"；省略时为 "webgl"
    allowFallback: true, // 仅 WebGPU：允许原生 WebGL 2 回退，默认 true
    antialias: true,
  },
  camera: { fov: 50, near: 0.1, far: 1000, position: [3, 2, 5] },
  maxPixelRatio: 2,
});
```

container 是有明确宽高的浏览器 HTMLElement。普通 WebGL 可直接 `await ThreeApp.create(container)`；严格要求原生 WebGPU 时设置 `renderer.allowFallback: false`。初始化失败会拒绝 Promise，不交付未就绪对象。WebGPU 模块按需加载，WebGL 路径不请求 WebGPU 设备。

## 正式生命周期

| API                                  | 契约                                                           |
| ------------------------------------ | -------------------------------------------------------------- |
| ThreeApp.create(container, options?) | 异步初始化并返回 ready 实例，不自动启动                        |
| app.start()                          | 启动或恢复连续渲染，重复调用不增加循环                         |
| app.stop()                           | 停止连续渲染，保留场景、资源与姿态                             |
| app.renderOnce()                     | 显式绘制一帧，返回是否发生绘制；不更新动画或启动循环           |
| app.onUpdate(callback)               | 每帧绘制前更新，返回取消订阅函数                               |
| app.onAfterRender(callback)          | 更新与成功绘制后通知，返回取消函数                             |
| app.destroy()                        | 立即结束宿主并返回 Promise，等待原生清理完成；幂等且错误可观察 |

`destroy()` 调用即转为 disposed、停止 RAF、abort 宿主 signal、解除监听并移除画布。框架卸载时等待 `await app.destroy()`；销毁后的实例不可重新 start，需要重新 create。renderOnce 的 true 表示已提交本次绘制调用，不表示 GPU 已执行完成。

原 `new ThreeApp` 保留给同步 WebGL 接入；`render`、`dispose`、`disposeAsync` 保留低层兼容及 Disposable 协议，正式用法统一使用 create / renderOnce / destroy。扩展模块与原生 geometry、material、texture 的资源句柄仍按各自 dispose 协议释放。

## 渲染器与实际后端

| renderer.type          | app.rendererType | app.backend | 原生 app.renderer |
| ---------------------- | ---------------- | ----------- | ----------------- |
| webgl（默认）          | webgl            | webgl2      | WebGLRenderer     |
| webgpu，原生设备可用   | webgpu           | webgpu      | WebGPURenderer    |
| webgpu，发生允许的回退 | webgpu           | webgl2      | WebGPURenderer    |

rendererType 表示渲染器族，backend 表示实际图形 API。WebGPU 回退仍使用节点 renderer，不能以 backend:webgl2 判断旧 GLSL 特效可用。两条路径均满足 `app instanceof ThreeApp`。

## 正式类型

主要配置类型为 `ThreeAppCreateOptions`，渲染器配置为 `WebGLRendererOptions` / `WebGPURendererOptions`。字面量选项推断为 `ThreeApp<"webgl">` 或 `ThreeApp<"webgpu">`，原生 renderer 类型精确保留：

```ts
import type { ThreeAppCreateOptions } from "@adui/three";

const options = {
  renderer: { type: "webgpu", allowFallback: false },
} satisfies ThreeAppCreateOptions;
const app = await ThreeApp.create(container, options);
// app.renderer 精确为 WebGPURenderer。
```

动态配置返回 `ThreeAppInstance` 判别联合，通过 app.rendererType 收窄。`ThreeAppOptions` 仅描述已有同步 WebGL 构造配置；新接入统一使用 ThreeAppCreateOptions。

## 配置与所有权

camera 的默认值为 fov=50、near=.1、far=1000、position=[3,2,5]；maxPixelRatio=2，maxDelta=.1秒。geometry/material/texture 分别登记到 app.resources，不隐式接管借用资产。scene/camera/renderer 是只读原生引用，允许配置属性，不允许替换或另建竞争循环。

renderer 中其余字段传给所选原生 renderer。WebGPU 支持 antialias、alpha、depth、stencil、samples、reversedDepthBuffer、logarithmicDepthBuffer、powerPreference、outputBufferType；不接受外部 canvas/context/device。配置和相机 position 在异步边界前快照。

signal 仅取消创建，覆盖按需导入与设备初始化；成功后模型加载使用 app.signal，卸载调用 destroy。WebGPU 取消或创建失败后的迟到清理错误由 onCleanupError 接收，默认 console.error；该回调只对 WebGPU 创建适用。

## 使用与迁移

完整可复制场景见 [快速开始](../guide/getting-started.md)，真实渲染器示例见 [示例源码](../examples/webgpu.md)。此前未发布的顶层 backend/fallback 已改为 renderer.type/renderer.allowFallback；配置类型 CreateThreeAppOptions 改为 ThreeAppCreateOptions；独立 @adui/three/webgpu 入口已撤回，使用主入口统一创建。旧写法会在类型和运行时拒绝，详细对照见 [迁移指南](../MIGRATION.md#正式宿主-api)。

## 能力与验收范围

模型/动画、控件、CPU 拾取、DOM 标签、相机、纹理及几何复用既有模块。泛光/描边/颜色滤镜、八种动态特效、实时阴影、色调与曝光、Room/HDR/EXR 环境和截图共用现有入口，内部按 renderer 选择原生实现；后处理统一用 configure 更新参数。原生 pass / node / material 仍按实际渲染器保留不同类型，不能直接互换。正交宿主仍通过 OrthographicThreeApp 创建，目前只支持 WebGL。

正式 API 契约不代表 npm 已发布或所有设备已验收。自动化 Chromium 环境仅暴露 SwiftShader，core/compatibility 适配器均返回 null；这不是使用者电脑缺显卡或 npm 依赖。已连接用户 Chrome/NVIDIA Ampere，在严格模式下确认 backend=webgpu，并通过17项原生扩展专项；完整浏览器/设备矩阵仍待扩展，详见验收记录。资源限制见 [ADR-0048](../adr/0048-webgpu-host.md)，正式决策见 [ADR-0050](../adr/0050-public-app-api.md)，扩展决策见 [ADR-0051](../adr/0051-renderer-feature-parity.md)，实际验证见 [Harness](../HARNESS.md)。

## 诊断 GPUAdapter

GPUAdapter 由浏览器在安全上下文中选择。返回 null 可能与浏览器策略、驱动、软件渲染或远程运行环境有关，不能单独判定显卡能力。项目的 website 提供 ?demo=capabilities，分别检测 core/compatibility 并显示厂商、架构和回退标记；?demo=webgpu-features&backend=webgpu 运行严格模式及17项扩展自检。正式示例任意主题也可选择严格 WebGPU，并查看实际后端。

参考 [WebGPU 适配器选择规范](https://www.w3.org/TR/webgpu/#adapter-selection)。
