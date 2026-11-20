# ADR-0055 原生统计快照与宿主监视

- 状态：Accepted
- 日期：2026-11-20
- 需求：FR-074

## 决策

在既有 rendering 入口提供 captureRenderStats 和 attachRenderMonitor，不新增包入口或 SDK 运行时依赖。前者读取并冻结原生计数与 CSS 视口，后者只订阅 onAfterRender，以画布窗口 performance.now 的间隔计算宿主绘制完成频率；FrameInfo.delta 仅用于识别恢复首帧/手动绘制，不参与 FPS 数值计算。默认每0.5秒通知，逐次完成仍保留最新快照；手动 read 不绘制、不通知回调。

WebGL info.render.calls 是 draw calls，节点 Info.render.calls 是累计 render 次数，后者必须读取 drawCalls。程序数分别来自 WebGL programs.length 和节点 memory.programs；节点 memory.total 作为 estimatedBytes，WebGL 不提供时为 null。不读 GPU timestamp 或推算未知显存字节，不使用同步 GPU 查询。

autoReset 保留原值，绝不调用 info.reset 或更换 renderer.render。WebGL 多 pass 可能只留下最后一次调用的计数，节点重置还受其内部 Animation 影响；快照明确保留原生重置窗口，不承诺整帧 pass 汇总。资源计数可含预热缓存，不能单凭一次非零读数判定泄漏。

暂停、首帧、隐藏或零尺寸的显式读取清空计时窗口；恢复后重新观测，不计入空闲时间。snapshot 是最近观测，不使用后台轮询维持“实时”假象。dispose 解除订阅，最后的纯数据快照仍可读取；read 在销毁后拒绝。同步 onSample 异常沿宿主完成回调规则传播，可在回调中安全销毁。

SDK 不拥有面板；共享 UI 只通过公开包入口消费统计，根工作区显式声明本地 SDK 开发依赖。面板使用原生 details、键盘焦点、固定间隔更新和已有色彩令牌，不保存或上传数据。

## 依据与验证

核验锁定 r187 源码及 [WebGLRenderer.info](https://threejs.org/docs/pages/WebGLRenderer.html#info)、[节点 Info](https://threejs.org/docs/pages/Info.html)。模块测试与真实浏览器结果见 [Harness](../HARNESS.md)。
