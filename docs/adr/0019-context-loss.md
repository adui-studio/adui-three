# ADR-0019 上下文丢失时结束宿主

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-031
- 替代关系：补充 ADR-0002 的异常生命周期边界

## 决策

ThreeApp 监听自有 canvas 的 webglcontextlost。收到事件先将只读 contextLost 标记为 true，再执行完整 dispose：取消 RAF、abort、清订阅/平台监听、释放自有资源、detach 场景、释放 renderer 并移除 canvas。该标记在已结束句柄上保持，普通主动销毁不将它设为 true。已经丢失的上下文不再次 forceContextLoss。

结束后 start/render/resize 沿用 disposed 拒绝语义，stop/dispose 仍幂等；迟到的 webglcontextrestored 不会重启旧宿主。应用收到既有 signal.abort 后可检查 contextLost，更新界面并由业务选择创建新 ThreeApp、重新加载和恢复状态。库不创建第二循环、重试计时器、自动 reload 或更换已公开的 renderer 引用。

## 原因与边界

本地 r187 / Chromium / SwiftShader 原型尝试保留宿主并在原生 restore 后重试尺寸。基础场景可继续，但 HDR/图片/泛光恢复后改变尺寸触发旧 GPU 对象清理，出现 INVALID_OPERATION（1282）及 object does not belong to this context。不能把恢复事件或出现像素当成完整恢复成功；失败诊断见 Harness。

当前 renderer 是稳定的自有公开引用，后处理等模块还借用它；透明替换 renderer 会违背引用契约。批量重置借用的 scene 资源会影响其他宿主；读取/清除原生私有缓存也不是当前封装边界。选择在上下文仍丢失时清理旧原生监听和缓存，并让应用显式重建，避免继续驱动不完整恢复的资源图。这是固定版本下的保守恢复策略，不断言所有浏览器/驱动或未来版本都无法恢复。

库拥有的模型实例在其他宿主仍可继续使用共享资产租约；只有丢失宿主的局部节点/骨骼被释放。自有 pending 请求同步逻辑取消、迟到结果按原契约清理。借用的 RenderPipeline 本身不会被核心 dispose；模块仍需显式在 app.resources 登记清理。普通清理错误继续尝试剩余操作，最终按原语义聚合并交给浏览器；不承诺 GPU/硬件损坏后能重建成功。

## 验证

单测覆盖 ready/stopped/running、更新/绘制内丢失、abort、所有权、清理失败继续、双实例与迟到事件。真实 WEBGL_lose_context 验证旧 canvas 不能复活、跨宿主实例动画/纹理保持、两轮 HDR/图片/泛光清理重建无旧代 GPU 错误、未完成模型迟到清理。软件 WebGL 结果不代替完整硬件矩阵。

## 来源

- [webglcontextlost](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)
- [webglcontextrestored](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextrestored_event)
- [WebGLRenderer 官方 API](https://threejs.org/docs/pages/WebGLRenderer.html)
- [r187 WebGLRenderer](https://github.com/mrdoob/three.js/blob/r187/src/renderers/WebGLRenderer.js)
