# ADR-0015 动画片段时间定位

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-027
- 替代关系：扩展 ADR-0004，保留既有播放/暂停接口

## 决策

GLTFAnimationsHandle.seek(seconds) 只定位已选片段，单位秒，范围 [0, clip.duration] 且必须有限。无选择或已销毁时拒绝，非法时间在改动前拒绝。定位后统一 paused，不启动宿主或绘制；resume 从该时间继续，stop 仍恢复原始绑定属性并清选择。

通过原生 AnimationAction.reset 重置循环/完成和淡变内部状态，保留 loop、clamp、weight 和 timeScale 配置，写入 action.time 后由既有 sample(0) 采样。mixer.time 不前进，不使用按 mixer.timeScale 缩放全局时间的 Mixer.setTime。定位精确端点在暂停时保持；恢复后 repeat 沿用原生环绕，once 在下一次有效采样完成。

已完成的动作可重新定位，包括 clampWhenFinished=false 已退出姿态影响的动作。定位不保留过去循环次数或原生淡变/warp；这些扩展不在既有封装支持范围。

## 事件与边界

复用 execute/sample 的更新重入保护和延期清理，无新订阅、RAF 或资源。原生 finished/loop 内调用先做当前选择的输入校验，随后依序执行队列；执行前重新校验实际选择，防止更早的 play/stop 命令改变选择。若新选择不接受该时间，命令抛错、队列停止，交宿主既有帧错误契约处理。

定位采样内同步释放模型/宿主，仍保持 disposed，原生返回后清 Mixer，不重新写成 paused。演示滑块显示百分比，消费者换算为秒，库只提供秒接口。未实现反向、混合、状态机或完整骨骼/morph 验收。

## 验证

真实 Mixer 验证精确姿态、不推进时间、倍速恢复、完成动作、两端/非法值、片段/模型隔离、排队重校验和采样内销毁。浏览器使用既有原创节点动画，验证暂停宿主中的时间轴与标签姿态、恢复、一次播放端点、模型移除和重建；实际结果见 Harness。

## 来源

- [AnimationAction 官方 API](https://threejs.org/docs/pages/AnimationAction.html)
- [AnimationMixer 官方 API](https://threejs.org/docs/pages/AnimationMixer.html)
- [r187 reset 与零 delta 采样](https://github.com/mrdoob/three.js/blob/r187/src/animation/AnimationAction.js)
