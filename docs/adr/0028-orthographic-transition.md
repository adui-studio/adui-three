# ADR-0028 正交相机平滑取景

- 状态：Accepted
- 日期：2026-11-06
- 关联需求：FR-040

## 决策

camera 新增 transitionOrthographicToObject，接受正交宿主、目标和既有 CameraTransitionOptions，返回 CameraTransitionHandle<OrthographicObjectFrame>。句柄与结果类型增加默认 ObjectFrame 的泛型参数，原透视调用兼容。共用内部 transitionFrame 的单相机登记、宿主 delta、smoothstep 姿态/轨道插值、scope/signal、输入取消、外部改写检查与错误清理，不复制循环。

正交沿用即时规划和约束，对 zoom 按同一进度作凸组合并更新投影，保持微小终点；起始 near=0 有效。默认先扩裁剪、完成后收紧，取消保留当前姿态/zoom 和扩展裁剪面。原 transitionToObject 仍要求透视宿主。

## 竞争与配置

准备及应用都持有相机写锁，无效/预取消请求保留既有有效过渡。外部正交视锥/zoom、尺寸、姿态或 min/maxZoom 等约束修改，在下次有效更新取消；停止/零尺寸不轮询。控件继续按 ADR-0008 租用 enabled/damping/autoRotate，带控件时 pointerdown/wheel 取消并交还输入。

即时正交 fit 先取消旧过渡并恢复租约，再保存配置用于临时关闭/恢复，避免把租用的 false 当作用户原值。目标移动/删除不自动跟踪，演示主动取消；没有自动启动/绘制、新 RAF、路径避障或过渡中模型始终完整可见的承诺。

## 验证

十二项新增单测覆盖 zoom/姿态、near=0、暂停、替换/即时应用、无效/预取消、外部视锥/缩放约束、输入/signal、独立 scope、异常、准备重入及微小 zoom；原十七项透视过渡单测保持。浏览器验证真实像素、暂停/继续、独立对侧、wheel/resize/即时取景/销毁重建；严格包消费验证 completed.frame.zoom。

## 来源

- [OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html)
- [r187 Quaternion](https://github.com/mrdoob/three.js/blob/r187/src/math/Quaternion.js)
- [r187 OrbitControls](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/controls/OrbitControls.js)
