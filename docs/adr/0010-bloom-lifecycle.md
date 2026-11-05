# ADR-0010 可选泛光与渲染资源生命周期

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-022
- 替代关系：使用 ADR-0009 的独占管线，不改变宿主默认渲染

## 决策

- 新增 postprocessing 可选子入口，导出 attachBloom(app, options)。默认核心不导入 composer 或 pass；复用 Three.js 0.187.0 原生 EffectComposer、RenderPass、UnrealBloomPass 与 OutputPass，仍外部化 addons，无新依赖。
- 管线顺序固定为 RenderPass → UnrealBloomPass → OutputPass。自有 HalfFloat 渲染目标支持 HDR；不使用 renderer.setEffects，不改变 renderer.render、toneMapping、outputColorSpace 或宿主调度。颜色转换由 OutputPass 按原生规则执行一次；应用自行选择 tone mapping 和发光材质。
- 参数 strength 默认 1、radius 默认 0.4、threshold 默认 0.85、enabled 默认 true。初始强度和阈值为非负有限数，radius 在 [0,1]；阈值允许 HDR 值大于 1。返回原生 pass 供调整参数及 enabled；外部不自行 dispose 此自有对象。
- composer 及三条 pass 由内部 scope 持有，句柄登记 app.resources。重复挂接失败时回收新建资源，已有管线不受影响；释放句柄解除自身租约并逆序清理全部资源。关闭 pass.enabled 保留 GPU 资源，dispose 才释放模块；原生帧随后恢复。
- resize 使用宿主 CSS 尺寸和封顶 DPR，零尺寸保留已有目标，不分配零大小缓冲；恢复时重新同步。无额外 RAF、观察器或自动启停；app.render 的单次绘制也经过相同后处理。
- 渲染期间取消先标记结束，关闭三条 pass 并解除管线，当前原生 pass 返回后才清理 GPU 资源。后续 pass 不再执行。宿主销毁可能先结束 renderer/context，模块仍不会重新挂接或重新开始绘制；不承诺中断已经进入的原生调用。
- 每次绘制保存原生 render target、autoClear、toneMapping 和清屏色/alpha；渲染返回或失败后恢复（宿主已销毁则不再写 renderer）。绘制和清理错误继续清理，并聚合/抛给宿主，不吞错。

## 代价与验证边界

HDR 目标要求设备支持对应浮点颜色缓冲；不提供自动质量降级。离屏目标默认不启用 MSAA，renderer.antialias 不会自动应用到 composer。全屏泛光有额外显存、填充和绘制成本；只是亮度阈值泛光，不是选择性泛光、描边或完整效果编排。disabled 管线仍有 RenderPass/OutputPass 开销，完全卸载使用 dispose。

单测保留原生 pass/material/target 构造，仅替换 GPU 执行，覆盖配置、尺寸、重复/失败回滚、渲染期销毁、错误恢复和所有权。实际 Chromium/SwiftShader 验证 HDR 像素变化、不同强度、暂停与标签、尺寸/DPR/零尺寸恢复、多实例及重复释放后 texture/framebuffer 活跃计数回到基线。这不能证明长期无泄漏、所有 GPU 或硬件格式支持；结果见 Harness。

## 来源

- [r187 EffectComposer](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/postprocessing/EffectComposer.js)
- [r187 UnrealBloomPass](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/postprocessing/UnrealBloomPass.js)
- [r187 OutputPass](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/postprocessing/OutputPass.js)
