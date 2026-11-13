# ADR-0009 独占渲染管线与单次绘制

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-021
- 替代关系：扩展 ADR-0002 的绘制阶段，默认渲染保持不变

## 背景

持续封装阶段需要为泛光等后处理提供单一绘制出口。不能在 onUpdate 中额外 render，也不能让 EffectComposer 自建循环或覆盖 renderer.render。r187 的 setEffects 需要构造时启用浮点输出缓冲；其 WebGLOutput 尺寸更新由 setSize 路径触发，未覆盖宿主使用的 setDrawingBufferSize。当前选择显式借用管线接口以独立管理尺寸和资源。

## 决策

- ThreeApp.setRenderPipeline 接收含 render(FrameInfo)、resize(ViewportSize) 的借用对象。每个宿主最多一条管线；重复挂接在调用新管线前拒绝。立即通知当前 CSS 尺寸和封顶 DPR，之后在尺寸/DPR 变化或之前失败待重试时同步通知，包括暂停和零尺寸。
- 返回幂等解除函数，以租约身份清除当前管线；旧解除函数不能移除后来挂接的对象。挂接失败或回调中销毁会释放槽位。宿主不调用借用对象的 dispose；自有模块另通过 app.resources 管理资源。
- onUpdate 完成后执行管线 render，替代默认 renderer.render，成功后沿用 onAfterRender。无新 RAF，不改变 delta 或更新顺序。尺寸或绘制错误停止宿主并抛出，消费者可解除失败管线后恢复。
- ThreeApp.render 显式绘制一次，使用同一管线与完成阶段，不执行更新、不启动宿主、不累计时间，FrameInfo.delta=0，elapsed 保持上次更新值。ready/stopped/running 均可调用；隐藏或零尺寸跳过，销毁后拒绝。
- 更新、绘制和完成回调中重入 render 均拒绝，避免同一宿主递归或重复绘制。完成阶段中启停/销毁仍通过版本标记立即取消后续回调。直接调用原生 renderer.render 仍绕过宿主管线和完成通知。

## 尺寸失败恢复

宿主分别记录原生绘制缓冲与管线的待同步状态；测量值可更新，只有各自原生调用成功才清 dirty。投影或缓冲失败仍停止宿主、保留管线通知，下次同尺寸 resize 或绘制前按缓冲→管线顺序重试。零尺寸跳过原生分配，但不丢失待恢复状态；不承诺回滚已写的原生相机/缓冲副作用。

resize 和挂接时的首次尺寸通知设置操作保护：拒绝递归 resize、绘制或管线重挂接，避免递归回调或使用半同步状态绘制。初始化失败继续释放租约，运行期异常停止调度；结束始终解除保护。

## 代价与验收

2026-11-13 补充单次绘制结果：render 返回 boolean；同步调用当前 renderer/pipeline 并正常返回后为 true，隐藏/零尺寸、准备中断或读取方法后租约失效导致未调用绘制时为 false。已完成绘制后，观察者停止/销毁宿主、抑制其余完成通知不把结果改回 false；原有异常仍抛出。它表示同步绘制调用发生，不保证第三方管线输出、像素变化或 GPU 完成。忽略返回值的调用保持可用；自定义覆盖/测试替身须同步返回布尔值。

2026-11-13 补充方法读取边界：初次挂接依次读取 render/resize 各一次，每次读取后重新检查宿主状态，再验证方法及独占槽位；用已读取的 resize 进行首次通知。后续每次绘制/尺寸通知仍读取当前方法，不冻结管线配置；读取 getter 后重新检查宿主及租约身份，失效则跳过返回的旧方法，绘制也不派发完成通知。方法始终以管线对象为 this 调用，不新增每帧 bind 分配。任意 getter 已发生的业务副作用不回滚；调用方仍拥有管线资源。

七项先行失败单测覆盖初次读取期间销毁、重复读取、接收者、绘制期间销毁/替换及尺寸读取期间销毁/解除。真实 WebGL 专项遍历两类宿主的八个销毁场景，验证旧方法/完成阶段不调用，自有资源与 canvas 清理且对侧像素/上下文不变。实际汇总见 Harness。

允许外部实现替换绘制策略，代价是调用方必须保证管线输出、原生 renderer 状态还原和资源清理；宿主只管理调用时序。借用对象可以在回调中触发原生同步事件，不能保证任意用户回调的事务回滚。完整 WebGPU/WebXR 支持仍未提供。

新增宿主单测验证独占/解除身份、初始化中断、尺寸与 DPR、暂停单次绘制、异常、重入和多实例；演示通过公开 app.render 显示“绘制一帧”，浏览器验证暂停时完成计数增长且更新和 RAF 不增长、标签完成阶段、零尺寸和重建。真实结果见 Harness。

## 来源

- [r187 WebGLRenderer](https://github.com/mrdoob/three.js/blob/r187/src/renderers/WebGLRenderer.js)
- [r187 WebGLOutput](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgl/WebGLOutput.js)
- [EffectComposer](https://threejs.org/docs/pages/EffectComposer.html)
