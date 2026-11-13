# ADR-0036 模型动画运行倍速

- 状态：Accepted
- 日期：2026-11-13
- 关联需求：FR-048、FR-016、FR-029、FR-037
- 替代关系：扩展 ADR-0004/0017/0025 的播放控制，不改变动作级 timeScale

## 决策

GLTFAnimationsHandle 增加 readonly playbackRate:number 与 setPlaybackRate(rate:number):void。采用模型级原生 AnimationMixer.timeScale，初始 1，允许非负有限数；0 冻结模型时钟，不改变 playing/paused/finished 状态。消费者仍使用 pause/resume 表达控制状态，改倍速不会恢复一个暂停的控制器。

模型级倍速缩放所有贡献动作与渐变时钟，动作级 play/crossFadeTo 的 timeScale 保留；实际片段速度为宿主 delta、模型 playbackRate 与动作 timeScale 的乘积。保持片段选择、动作时间、循环预算、权重、渐变进度及当前姿态，不主动采样、绘制或启动宿主，无新时钟/资源。现有宿主停止/隐藏/零尺寸行为不变。

倍速可在 idle/paused/finished 时设置，跨 play/seek/stop 保留；新控制器重新默认 1。playbackRate 直接反映公开 mixer.timeScale，保留消费者使用原生对象的能力；绕过封装写入不受本 setter 校验。有限参数不保证无限累计时间或所有 Number 极值均可计算，不新增倒播契约。

## 通知和生命周期

调用时先校验所有者及参数，非法值在排队或变更前 RangeError。沿用现有 execute 队列，原生 Mixer 事件和封装 on 通知中的设置待本次采样/全部通知结束再执行；同批订阅者看到同一采样速度，后续更新才消费新速度。采样或通知抛错会丢弃待执行命令，销毁也丢弃命令，结束控制器不能再设置。

不接管其他模型的 Mixer，不更改全局场景速度；暂停或 0 倍速时，其余目标与宿主绘制可以继续。控制器结束沿用已有 Mixer/根资源清理，不创建额外订阅或可释放对象。

## 验证

单测覆盖动作级速度乘法、有限循环结束、零倍速独立冻结、渐变冻结/继续、暂停与定位、stop/play 保留、非法值、事件排队、失败丢弃和模型结束。演示提供 0～2 倍速滑块并随模型清理；浏览器比较冻结前后原生像素、宿主帧/独立动画继续、有限完成通知和重建重置。tarball 消费校验声明；真实门禁结果见 Harness。

## 来源

- [AnimationMixer 官方文档](https://threejs.org/docs/pages/AnimationMixer.html)
- [动画生命周期](0004-animation-lifecycle.md)
- [动画渐变](0017-animation-crossfade.md)
- [动画通知](0025-animation-notifications.md)
