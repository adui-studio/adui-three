# ADR-0023 有限次数循环与往返播放

- 状态：Accepted
- 日期：2026-11-06
- 关联需求：FR-035

## 决策

PlayAnimationOptions.loop 扩展为 repeat/once/pingpong，repetitions 接受正安全整数或 Infinity。repeat/pingpong 默认 Infinity，once 默认且只接受 1。一次 traversal 为单向经过完整片段；pingpong 的 repetitions=2 是一次去程加一次回程，不是两次往返。所有配置在替换动作前校验并快照，CrossFadeOptions 继承这些配置。

沿用原生 setLoop，不自建时间循环或第二 Mixer。play 重置循环历史；pause/resume 与宿主暂停保持预算。seek 继续按片段本地秒数采样并暂停，重置原生循环历史到首个正向阶段，保留循环模式与次数，不是整段往返轨迹的绝对定位。渐变复用尚在播放的目标时保留其原生循环进度，次数是动作总预算，不是追加次数。完成后 state=finished；clamp=false 按原生 binding 恢复，clamp=true 固定末姿态。

## r187 终点归一化

原生有限 pingpong 完成那次 update 可能按相反奇偶阶段采样：单轮结束采起点、两轮结束采终点；直接额外 update(0) 在跨越多轮的大 delta 下也不充分。库记录受管理动作的 finished，等本轮 Mixer 迭代返回后，才用公开 action.reset/time/paused 将保留姿态归一到奇数次的 clip.duration 或偶数次的 0，再 mixer.update(0) 混合一次。不给 Mixer 时间额外增量，也不访问 _loopCount 等私有字段。

处理包括仍有权重的离场动作。有限目标早于渐变完成时仍等权重交接结束；原生事件中调用控制方法继续进入既有队列，销毁则跳过额外采样并待原生迭代结束释放。原生 finished 监听发生在迭代内部，不能把监听内部读到的姿态当作最终混合/归一化完成。直接改原生播放字段、native fades/warps 或手动调用 mixer.update 不属于受管理控制契约。

## 验证与边界

新增十二项原生 Mixer 单测覆盖次数、往返阶段、奇偶终点、大 delta、恢复原姿态、参数拒绝、暂停、seek、入场/离场渐变、事件队列和事件中销毁。浏览器验证真实骨骼 Reach 往返结束时与初始 GPU 像素完全一致，以及有限重复完成、重播、模型移除与宿主重建。严格 tarball 消费覆盖新选项；没有新依赖或公开入口。反向 timeScale、循环剩余次数查询、跨 clip 状态机仍未提供。

## 来源

- [AnimationAction](https://threejs.org/docs/pages/AnimationAction.html)
- [r187 AnimationAction](https://github.com/mrdoob/three.js/blob/r187/src/animation/AnimationAction.js)
