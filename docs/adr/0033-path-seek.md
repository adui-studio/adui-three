# ADR-0033 路径运动定位

- 状态：Accepted
- 日期：2026-11-13
- 关联需求：FR-045、FR-036
- 替代关系：扩展 ADR-0024 的存活运动控制，保持单宿主更新和资源边界

## 决策

PathMotionHandle.seek(progress) 接受 [0,1] 有限弧长进度。成功时立即采样对象父级局部位置与可选正向切线朝向，将 progress/phase 设为该值并进入 paused；无绘制、RAF、宿主启停或 finished 通知。只有 running/paused 句柄可用，已完成/取消/失败或预先取消的句柄拒绝，不重新登记已结束运动。

使用既有 Curve.getPointAt/getTangentAt 及候选位置/旋转准备，不改曲线、duration、父级或所有权。progress 是路径比例，不是累计秒数或指定循环次数。定位总是重置到首个正向阶段，即使之前正在往返的回程；局部 +Z 对齐正向切线。非均匀父级缩放和原生弧长近似限制保持。

## 端点与继续

端点 0/1 都可暂停预览，不因 seek(1) 自动完成。resume 后下一次宿主更新继续使用原 duration：once 在 1 处完成；repeat 从 1 回绕到 0；pingpong 从 1 转向返回（零 delta 仍在端点，正 delta 才进入回程）。宿主暂停时不推进，也不补偿墙钟时间。需要复用已结束目标时创建新的 followPath。

## 竞争与错误

非法进度在采样前 RangeError，保留现有运动和姿态。定位使用同一目标写锁，禁止在曲线采样/更新期间重入 seek 或替换运动，finally 解锁。采样后、应用前检查所有者、目标挂接/原姿态和命令版本；采样回调改变 pause/resume 状态、取消、销毁或移动目标时丢弃旧候选。有效状态变化增加命令版本；相同状态的 pause/resume 不制造变化。未执行的新命令不排队。

曲线采样或变换写入异常将存活运动置 failed，解除宿主/可选 scope/事件登记，finished resolve 失败并同步向调用方抛出；单独 seek 不自行停止宿主。外部目标变化按 target-changed 取消，所有者结束按 disposed 取消。已发生的业务/原生写入回调副作用不回滚，任意自定义变换 setter 不承诺事务原子性。

## 验证与演示

原生数学单测覆盖暂停/继续、局部坐标、正向重置、三类循环端点、未提前完成、非法/结束输入、采样命令竞争、scope/目标结束、采样与切线失败及重入后的重用。演示滑块只控制路径 A，消费者显式绘制选定姿态。浏览器核验真实箭头像素、拾取、暂停宿主和另一目标进度、端点完成及目标/宿主重建。tarball 消费验证新增方法；不将这些用例外推为任意曲线精度或运动规划能力。

## 来源

- [Curve 官方文档](https://threejs.org/docs/pages/Curve.html)
- [r187 Curve 实现](https://github.com/mrdoob/three.js/blob/r187/src/extras/core/Curve.js)
