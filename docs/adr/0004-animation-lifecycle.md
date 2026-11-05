# ADR-0004 模型动画与清理范围

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-016
- 替代关系：扩展 ADR-0003 的模型生命周期，不改变加载时的资源快照与逻辑取消策略

## 背景与候选方案

模型加载、拾取和标签已实现，继续增加显式动画播放。仅把 Mixer 登记在 app 上，会使单独移除模型后仍保留更新订阅；每帧轮询 disposed 在宿主停止时又不能及时清理。修改模型 dispose 方法或把动画控制硬编码进 loader，会扩大耦合和所有权风险。

## 决策

- `GLTFModel.resources` 是独立 ResourceScope，用于模型相关的扩展句柄；模型先标记 disposed，再执行扩展 scope，之后 detach 和清理原有资源快照。扩展失败仍继续释放资产，最终聚合异常。只清理 scope 不等于移除模型。
- 独立 `@adui/three/animation` 导出 attachGLTFAnimations，类型引用 GLTFModel，不把 GLTFLoader 实现导入动画产物。loader 不自动创建 Mixer 或开始播放。
- 一个活动句柄独占一个根对象，Mixer 同时绑定宿主和模型 scope；任意所有者释放都结束句柄。只借用根和 clips，不释放模型或修改 clip 数据。
- 显式选择唯一名称或索引；同一时刻单片段，切换立即停止旧片段并从零开始。首版提供 repeat/once、结束保留姿态、正向倍速及暂停/继续/停止，不实现淡入淡出、seek、反向、状态机或自动重定向。
- 统一 onUpdate 的 delta 驱动，无第二 RAF。暂停控制器跳过 Mixer 采样，不改宿主状态或用户设置的 mixer.timeScale。stop/dispose 停止 action，按原生 binding 规则恢复属性；dispose 另外 uncacheRoot。
- r187 在 update 内同步派发 loop/finished；此时播放命令排队至该次 update 结束再执行。dispose 立即标记失效、移除订阅并丢弃命令，缓存清理延到原生调用栈返回，避免中途改缓存。错误继续交给宿主处理。

## 代价与边界

片段引用是快照，调用方不能在播放中修改 clip。原生 mixer/action 可读和配置参数，调度与缓存由句柄管理；外部手动 update、play/stop、uncache 或再创建同属性写入者会破坏该约束。应用注册的原生事件监听由应用解除。

普通模型释放先清理 Mixer 再释放资产；若在 Mixer 原生事件中释放模型，资产可能在 update 返回前已释放，原生 CPU 采样可以完成这一次写入，然后清理缓存，模型不会重新挂载。原生错误导致无法完成采样时依然尝试延后清理。保留句柄/原生 mixer 的业务引用仍可保留 CPU 对象，不声称完整内存回收。

## 验证与来源

单测使用真实 Mixer、tracks 和模型句柄，验证数值采样、片段选择、结束/暂停、双范围清理与原生事件重入。项目自生成 animated.glb 的 Lift/Slide 为两段 LINEAR 节点平移；浏览器观察实际模型标签位置与播放时间，不据此声称已实测骨骼、morph、大模型或长期性能。

- [r187 Mixer 更新与缓存](https://github.com/mrdoob/three.js/blob/r187/src/animation/AnimationMixer.js)
- [r187 Action 同步事件](https://github.com/mrdoob/three.js/blob/r187/src/animation/AnimationAction.js)
- [glTF 动画规范](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#animations)

接口与结果同步 [SDD](../SDD.md)、[需求](../REQUIREMENTS.md) 和 [Harness](../HARNESS.md)。
