# ADR-0017 可中断动画渐变

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-029
- 替代关系：扩展 ADR-0004 / ADR-0015，保留即时 play

## 决策

GLTFAnimationsHandle.crossFadeTo(selector, options) 增加普通权重交接，duration 默认 0.3 正有限 Mixer 秒，其他选项同 play。公开 blending 与 blendProgress，进度初始/取消 0、完成 1。选择和选项在动作改变前校验，沿用原生事件队列；同一当前目标无操作，无旧动作则普通播放，重播仍用 play。

不直接串联 native fadeIn/fadeOut，因为中断时重新从 0/1 起算会丢掉当前权重。使用原生 getEffectiveWeight 拍快照，每次宿主更新前通过 setEffectiveWeight 线性插值；目标到 1，其他贡献到 0。重选仍活动的旧目标保留其时间，新目标从零开始。native Mixer 继续负责属性混合和原始绑定状态，没有独立时钟、RAF、渲染或内部缓存访问。

动作集合每片段最多一个，途中可含多个片段，完成后只留目标；不在 Mixer.update 正遍历活动数组时停用。旧动作在原生采样返回后统一尝试 stop，失败继续并聚合。缓存保留到既有 uncacheRoot 生命周期，不声称提前回收所有 CPU 引用。

## 时间、控制与清理

渐变与片段同用 Mixer 时间：宿主有效 delta 乘 mixer.timeScale，0 暂停，值须非负有限；action.timeScale 只影响片段采样。控制器 pause 跳过整个采样。当前目标 once 早于渐变结束时先记完成，等交接结束才将控制器 state 置 finished，clamp/恢复姿态遵循原生设置。

play/stop 清渐变和旧动作，seek 清其他贡献并全权重定位目标；无渐变时 seek 继续保留原生 weight。dispose 先清公开状态和队列，原生调用返回后 stopAllAction/uncacheRoot，模型和宿主双范围归属保持。

只接收普通 blend mode、有限 [0,1] 有效权重；不提供 additive、warp、反向、状态图或重定向。调用方不同时驱动 native fading/action 调度。错误停止宿主并抛出，不回滚已写姿态。相同物理属性使用不同绑定路径等原生局限不由封装解决。

## 验证

真实 Mixer 数学验证中间姿态和权重、连续中断/切回、30 次快速改选后有界 action 集合、暂停/缩放时钟、短 once、seek/play/stop、事件排队和同步销毁、清理失败继续及双模型隔离。浏览器用既有原创 GLB 验证实际标签姿态在交接中保持连续、暂停/恢复、定位/停止、模型移除与宿主重建；未把节点用例外推为骨骼/morph 完整验收。实际结果见 Harness。

## 来源

- [AnimationAction 官方 API](https://threejs.org/docs/pages/AnimationAction.html)
- [r187 AnimationAction](https://github.com/mrdoob/three.js/blob/r187/src/animation/AnimationAction.js)
- [r187 AnimationMixer](https://github.com/mrdoob/three.js/blob/r187/src/animation/AnimationMixer.js)
