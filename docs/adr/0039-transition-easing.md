# ADR-0039 过渡节奏预设

- 状态：Accepted
- 日期：2026-11-13
- 关联需求：FR-051、FR-020、FR-029、FR-047
- 替代关系：扩展 ADR-0008/0017/0035 的参数化方式，默认行为不变

## 决策

camera 和 animation 入口均导出 type TransitionEasing="linear"|"smoothstep"，共享内部无状态 easing.ts。CameraTransitionOptions、CameraViewTransitionOptions 和 CrossFadeOptions 增加 easing；相机默认 smoothstep，渐变默认 linear。undefined 使用本模块默认，其他非法运行值在变更前 RangeError。没有新增运行时公共函数或独立工具包。

linear 直接使用时间进度 p；smoothstep 使用 p*p*(3-2*p)。相机用该因子插值既有位置/球面方向、target、zoom 和镜头；动画只改变交接权重，片段时间、Mixer/动作倍速和有限循环不变。progress/blendProgress 继续报告未经缓动的时间比例；暂停和完成条件也沿用原时钟，终点为 1。

预设只解析为内部固定函数，不开放逐帧消费者回调。控制器创建/交接时保存预设，之后改选项或演示按钮仅影响下一次请求。原生角度约束、球面轨道、投影和曲线形状仍可能导致世界/屏幕速度变化；linear 不保证物理或视觉匀速，也不提供弹性、过冲或自定义曲线。

## 生命周期

相机预设 getter 在准备写锁内读取，非法请求不替换有效运动。书签准备后重新检查 signal，被 getter 同步取消时返回取消句柄并保留旧租约。渐变沿用命令队列，进入队列前校验并捕获预设；中断用当前实际有效权重交接，不能从原始时间比例重算离场权重。

不新增调度、资源或原生事件；相机独立暂停、模型级倍速、所有者结束与错误清理保持原契约。默认核心不引入可选插值实现，分发允许 camera/animation 共用私有数学 chunk。

## 验证

单测用 1/4 进度区分 0.25 与 0.15625，覆盖透视位置、正交轨道目标、两类书签镜头、真实 Action 权重和中断交接；非法值、准备 getter 和取消保留旧运动也回归。投影演示可选下一次匀速过渡，主演示可选下一次平滑渐变；浏览器沿用实际像素、原生绘制、暂停/继续与中断断言。独立包消费验证两个入口的公共类型及私有 chunk，实际门禁结果见 Harness。

## 来源

- [Quaternion 官方文档](https://threejs.org/docs/pages/Quaternion.html)
- [AnimationMixer 官方文档](https://threejs.org/docs/pages/AnimationMixer.html)
- [相机过渡](0008-camera-transition.md)
- [动画渐变](0017-animation-crossfade.md)
- [视角过渡](0035-camera-view-transition.md)
