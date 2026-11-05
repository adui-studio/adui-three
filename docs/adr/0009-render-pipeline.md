# ADR-0009 独占渲染管线与单次绘制

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-021
- 替代关系：扩展 ADR-0002 的绘制阶段，默认渲染保持不变

## 背景

持续封装阶段需要为泛光等后处理提供单一绘制出口。不能在 onUpdate 中额外 render，也不能让 EffectComposer 自建循环或覆盖 renderer.render。r187 的 setEffects 需要构造时启用浮点输出缓冲；其 WebGLOutput 尺寸更新由 setSize 路径触发，未覆盖宿主使用的 setDrawingBufferSize。当前选择显式借用管线接口以独立管理尺寸和资源。

## 决策

- ThreeApp.setRenderPipeline 接收含 render(FrameInfo)、resize(ViewportSize) 的借用对象。每个宿主最多一条管线；重复挂接在调用新管线前拒绝。立即通知当前 CSS 尺寸和封顶 DPR，之后仅在尺寸/DPR 变化时同步通知，包括暂停和零尺寸。
- 返回幂等解除函数，以租约身份清除当前管线；旧解除函数不能移除后来挂接的对象。挂接失败或回调中销毁会释放槽位。宿主不调用借用对象的 dispose；自有模块另通过 app.resources 管理资源。
- onUpdate 完成后执行管线 render，替代默认 renderer.render，成功后沿用 onAfterRender。无新 RAF，不改变 delta 或更新顺序。尺寸或绘制错误停止宿主并抛出，消费者可解除失败管线后恢复。
- ThreeApp.render 显式绘制一次，使用同一管线与完成阶段，不执行更新、不启动宿主、不累计时间，FrameInfo.delta=0，elapsed 保持上次更新值。ready/stopped/running 均可调用；隐藏或零尺寸跳过，销毁后拒绝。
- 更新、绘制和完成回调中重入 render 均拒绝，避免同一宿主递归或重复绘制。完成阶段中启停/销毁仍通过版本标记立即取消后续回调。直接调用原生 renderer.render 仍绕过宿主管线和完成通知。

## 代价与验收

允许外部实现替换绘制策略，代价是调用方必须保证管线输出、原生 renderer 状态还原和资源清理；宿主只管理调用时序。借用对象可以在回调中触发原生同步事件，不能保证任意用户回调的事务回滚。完整 WebGPU/WebXR 支持仍未提供。

新增宿主单测验证独占/解除身份、初始化中断、尺寸与 DPR、暂停单次绘制、异常、重入和多实例；演示通过公开 app.render 显示“绘制一帧”，浏览器验证暂停时完成计数增长且更新和 RAF 不增长、标签完成阶段、零尺寸和重建。真实结果见 Harness。

## 来源

- [r187 WebGLRenderer](https://github.com/mrdoob/three.js/blob/r187/src/renderers/WebGLRenderer.js)
- [r187 WebGLOutput](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgl/WebGLOutput.js)
- [EffectComposer](https://threejs.org/docs/pages/EffectComposer.html)
