# ADR-0008 相机平滑过渡与中断清理

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-020
- 替代关系：扩展 ADR-0007，保留即时取景 API

## 决策

在 camera 入口增加 transitionToObject。复用边界、有效视锥和控件限制校验，以调用时快照规划终点；同一相机只保留一个过渡。仅订阅 ThreeApp.onUpdate(delta)，不创建 RAF、自动启动、直接 render 或接管模型。默认 duration=0.8 秒，正有限数，采用固定 smoothstep；宿主停止、隐藏或零尺寸时保持进度，恢复不补算墙钟时间。

没有 controls 时插值位置并对旋转做 Quaternion.slerp；有 controls 时插值 target、轨道半径和最短方向旋转，避免相反方向直线插值穿越目标。原生角度限制继续生效，不承诺路径避障或中途完整可见。过渡期间关闭 enabled/damping/autoRotate；结束时仅恢复仍为租用值 false 的配置，外部已改为 true 的配置保留。公开 update(0) 清惯性，不访问私有字段。

返回带 state、progress、finished、cancel/dispose 的句柄，登记到 app.resources。finished 始终 resolve completed/cancelled/failed；同步非法输入抛错，并尽量在取消旧请求前拒绝。更新异常先清理并 resolve failed，再交回宿主停止循环和抛出。所有清理继续执行，清理异常聚合到 failed 结果。

主动取消、AbortSignal、同相机新过渡、即时 fitObject、宿主/scope 销毁都会结束过渡。有 controls 时画布 pointerdown/wheel 捕获阶段取消，恢复控件供同一手势使用，不消费事件。外部视口、投影、姿态、控件约束或可观察配置修改，在下一次有效更新时取消；无更新期间不轮询。原生同步事件中可取消/销毁，同相机重入取景拒绝。

adjustClipping=true 时先扩展裁剪范围，完成才收紧至终点推荐值；取消保留当前姿态与扩展裁剪面。false 保留原裁剪面并校验终点。目标移动、动画和后续删除不会被自动跟踪；消费者负责在目标失效时取消。演示显式选择启动宿主并在模型移除/缩放时取消。

## 代价与验证

每个过渡保存目标的数值快照与少量临时数学对象，不接管或释放目标 GPU 资产；应用仍应解除不再需要的句柄引用。单测使用真实 Quaternion/OrbitControls，覆盖暂停、插值、相反方向、重入、异常、清理及多实例；浏览器覆盖实际渲染、标签、输入中断、尺寸与模型/宿主生命周期。完整硬件兼容、路径避障及长期性能仍未验收。

## 来源

- [r187 Quaternion](https://github.com/mrdoob/three.js/blob/r187/src/math/Quaternion.js)
- [r187 Vector3](https://github.com/mrdoob/three.js/blob/r187/src/math/Vector3.js)
- [r187 OrbitControls](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/controls/OrbitControls.js)
