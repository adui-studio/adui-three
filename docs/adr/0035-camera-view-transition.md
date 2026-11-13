# ADR-0035 保存视角平滑恢复

- 状态：Accepted
- 日期：2026-11-13
- 关联需求：FR-047、FR-041、FR-020、FR-040
- 替代关系：扩展 ADR-0029 的恢复方式，沿用 ADR-0008/0028 的相机租约

## 决策

camera 子入口新增 transitionToCameraView(app,view,options?)。接受既有 version=1 CameraView，仅恢复到同类型透视/正交相机；位置、朝向、镜头和可选轨道 target 先复制验证，终点水平构图适配当前 CSS 比例。duration 默认 0.8 个宿主秒，必须正且有限；可选 signal、controls。句柄提供 state/progress/finished/cancel/dispose，完成结果为独立实际 view，不假定原生角度限制完全保留输入姿态。

每相机仅一个运动，复用 camera-runtime 的写锁与登记；合法源和终点验证后才替换已有取景/视角过渡。预取消不替换旧运动。仅订阅宿主 onUpdate，不创建计时器、RAF、GPU 对象，不启动或绘制。停止、隐藏、零尺寸沿用宿主时间策略。

## 插值与投影

使用 smoothstep；无控件时位置作凸组合、旋转用原生四元数 slerp。借用 OrbitControls 时 target 和正距离作凸组合，方向在单位球面插值，每帧通过公开 update(0) 同步并接受原生角度约束。距离采用 (1-t)*start+t*end，避免 start+(end-start)*t 将很小的正终点舍入成零；原取景过渡同步修正该问题。

zoom、透视 fov/aspect 或正交四条边作凸组合。near/far 在开始时扩到源与终点的并集，完成时恢复终点；取消保留当前姿态、镜头和扩展裁剪面。无控件时 up 在完成时写入目标，途中旋转由四元数决定；有控件时要求源与终点单位 up 相同、无 roll。临时原生相机先验证投影/世界矩阵，之后才写入真实相机，不改只读 reversedDepth，复用既有原生坐标系验证。

不支持父级、缩放、手动矩阵、view offset 或透视 filmOffset；不保证途中对象始终可见、无碰撞或所有数值范围可表示。原生方法、属性回调已经产生的副作用不回滚。

## 生命周期与控件

开始时消费原生惯性并租用 enabled/enableDamping/autoRotate=false。结束仅在标志仍为本模块写入值时恢复旧值；指针或滚轮输入取消。scope 结束、signal、后续即时恢复/取景/过渡均解除订阅和登记，借用相机/控件不释放。

宿主 CSS 尺寸、姿态、投影配置、up、控件归属/target/约束或租用标志的可观察修改在下一次更新取消，不覆盖消费者值；停止期间不轮询。准备和写入期间同相机重入拒绝，原生回调返回后复查所有者与结束状态。异常同步传播，finished 总是 resolve；清理独立执行，失败聚合为 failed。原生矩阵方法被任意改写的行为不具有事务保证。

## 验证

单测覆盖两类镜头/控件、当前比例、快照隔离、宿主暂停、非法请求保留原运动、共享租约、输入/取消/外部修改、异常及重入。投影演示保留立即恢复并增加平滑恢复/取消和进度；浏览器验证真实像素、原生平移、暂停继续、宽度变化、重建和双实例隔离。包消费覆盖独立导入与严格完成结果类型，实际门禁结果见 Harness。

## 来源

- [Quaternion 官方文档](https://threejs.org/docs/pages/Quaternion.html)
- [OrbitControls 官方文档](https://threejs.org/docs/pages/OrbitControls.html)
- [PerspectiveCamera 官方文档](https://threejs.org/docs/pages/PerspectiveCamera.html)
- [OrthographicCamera 官方文档](https://threejs.org/docs/pages/OrthographicCamera.html)
- [相机视图](0029-camera-views.md)
- [相机过渡](0008-camera-transition.md)
- [正交过渡](0028-orthographic-transition.md)
