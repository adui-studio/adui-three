# ADR-0029 相机视图快照与恢复

- 状态：Accepted
- 日期：2026-11-06
- 关联需求：FR-041

## 决策

camera 入口增加 captureCameraView/restoreCameraView 及 CameraView、PerspectiveCameraView、OrthographicCameraView、CameraViewOptions。快照是 version=1 的独立数值数据，包含 kind、position、quaternion、up、zoom、near/far 和可选轨道 target；透视增加 fov，正交增加 top/bottom/centerX。只读类型不等同运行时冻结，数组与原生对象不共享，不复制场景、userData、renderer 或 GPU 资产。

调用方自行 JSON/存储，库不访问 localStorage 或业务 Store。快照可独立于原宿主存活，只能恢复到同类相机；恢复以当前 CSS 宽高比重算透视 aspect 或正交左右范围，保留垂直构图与正交水平中心。摄像机 up/姿态/裁剪面和 zoom 恢复，renderer 设置及原生深度模式不属于快照。

候选验证沿用目标当前深度模式；反向模式通过 Matrix4 公开投影方法构造临时矩阵，不写只读 reversedDepth。极端正交跨度的探针复现正向逆矩阵有限、反向却溢出的情况，校验必须在写目标之前按实际模式拒绝；不把数学用例当作反向深度硬件矩阵验收。

## 校验与控制器

只支持未挂父级、无缩放、自动矩阵、无 view offset/透视 filmOffset 的相机。运行时检查版本、类型、数组长度/空洞/有限数值、归一化四元数、非零 up、裁剪与镜头范围，并用独立原生候选验证数值可表示性。capture 不采样、写相机、改变调度或取消过渡，零尺寸仍可捕获当前配置；restore 要求宿主/scope 存活与非零视口。

带控件时 capture 保存 target 并要求姿态看向目标且无 roll、up 为单位向量。带控件恢复需要快照包含 target、控件属于相机且 up 与当前一致；不访问 OrbitControls 缓存。预先校验距离、正交 zoom、目标半径及限制合法性；原生角度约束继续生效，可调整最终姿态，返回新的实际 CameraView。保存时未借用控件的快照仍可无控件恢复。

## 生命周期

restore 从准备开始持有共享写锁，先完整验证再取消既有过渡；非法数据保留原有效请求。取消旧租约之后才保存控件配置，临时关闭 damping/autoRotate 并通过公开 update(0) 消耗残留，再应用候选、更新投影/控件和世界矩阵。回调结束所有者或抛错时恢复配置并释放锁；不回滚原生副作用。库不绘制、不启动或新建 RAF，也不修改原生 controls.saveState/reset 状态。

## 验证

原生数学/控件测试覆盖快照独立/JSON、同类跨宿主、当前比例与非对称正交窗口、无效输入/布局/生命周期、target/惯性/约束、过渡交接与异常重入。真实浏览器验证正交/透视缩放和原生平移后恢复完全相同像素、跨宿主重建保留 JSON、窄容器垂直尺度与取消过渡；打包消费验证八个 camera 命名导出及联合类型收窄。

## 来源

- [PerspectiveCamera](https://threejs.org/docs/pages/PerspectiveCamera.html)
- [OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html)
- [Quaternion 归一化要求](https://threejs.org/docs/pages/Quaternion.html)
- [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html)
- [Matrix4 公开投影与反向深度参数](https://threejs.org/docs/pages/Matrix4.html)
