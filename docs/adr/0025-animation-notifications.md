# ADR-0025 动画采样完成后的通知

- 状态：Accepted
- 日期：2026-11-06
- 关联需求：FR-037

## 决策

GLTFAnimationsHandle.on 提供 loop/finished 的同步订阅，返回独立解除函数；泛型 GLTFAnimationEvents 将事件名映射到只读 payload。两种事件都有原生 action 和借用 clip；loop 有原生 loopDelta，finished 有 direction。订阅不回放历史事件，stop/seek/pause 不制造完成事件。

原生 Mixer 在 action 更新中派发事件，早于属性混合写入。库仅记录当前选中动作的 loop 以及待完成信息，在 mixer.update、往返端点归一化和渐变交接完成后、宿主绘制前通知。有限入场动作早于渐变结束时，finished 等权重交接完成再派发；离场动作不会冒充控制器完成。loopDelta 沿用原生合并通知，不为大 delta 跨过的每一轮合成通知。

## 回调与生命周期

通知仍处于宿主更新栈中，不是 GPU 绘制完成事件，不等待异步回调。派发时快照订阅并检查当前成员，新增订阅从后续通知生效；同一个函数可独立订阅多次。回调中的 play/crossFadeTo/seek/stop 等操作沿用队列，等本批通知结束后按序执行，保证其他订阅先观察同一采样结果。

回调销毁模型/宿主会清空待通知和订阅，跳过后续回调并在采样栈退出后清 Mixer 缓存。回调异常立即终止本批通知、丢弃未执行控制命令并传播到宿主既有帧异常策略；不自动重试事件。stop/play 保留订阅到 handle.dispose；销毁后新订阅拒绝，既有解除函数幂等。原生 mixer 仍可观察，但直接修改播放字段或手动 update 不属于这些通知的保证范围。

## 验证

十二项原生 Mixer 单测验证采样先后、往返末姿态、恢复绑定、loopDelta、订阅增删/重复、排队切换、渐变延期、销毁、异常、非回溯与参数边界。真实 GLB 演示验证完成后切换下一片段、独立 loop 通知、模型替换/宿主重建和往返仅完成一次；严格包消费验证事件类型收窄。

## 来源

- [AnimationMixer](https://threejs.org/docs/pages/AnimationMixer.html)
- [r187 AnimationMixer.update](https://github.com/mrdoob/three.js/blob/r187/src/animation/AnimationMixer.js)
