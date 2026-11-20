# ADR-0053 宿主驱动 GSAP 时间线

- 状态：Accepted
- 日期：2026-11-20
- 需求：FR-072

## 决策

attachGSAPTimeline 位于既有 animation 入口，使用结构化 GSAPTimelineLike 类型，SDK 不导入或依赖 GSAP。消费者先填充 paused:true 根时间线，再将清理所有权交给句柄。禁止 ScrollTrigger、反向播放、无限根重复和已绑定时间线；嵌套编排应先放在该根内，绑定后不再直接修改结构、时钟或目标写入者。

宿主 onUpdate 使用 delta × playbackRate 推进 totalTime，始终保留原生 paused 状态；不修改 globalTimeline、ticker 或其他页面动画。有限 repeat/yoyo 交给 GSAP。默认自动运行，支持暂停、恢复、静默定位后暂停、静默重播和非负倍速；宿主停止/隐藏/零尺寸不推进。

原生回调中的控制命令排队到采样后，避免递归调用 totalTime；dispose 立即解除宿主和可选模型 scope，kill 延后到本次采样结束。清理留下当前属性，不执行全局 killAll 或 revert；调用方负责避免与 Mixer、路径或相机控制器同时写同一属性。

## 依据与验证

核验 [GSAP totalTime](<https://gsap.com/docs/v3/GSAP/Timeline/totalTime()/>) 的总时间、重复和事件抑制语义，并用工作区固定 GSAP3.15.1 做真实时间线测试。实际结果见 [Harness](../HARNESS.md)。
