# ADR-0027 正交对象取景

- 状态：Accepted
- 日期：2026-11-06
- 关联需求：FR-039

## 决策

camera 子入口新增 computeOrthographicFrame 与 fitOrthographicObject，返回 OrthographicObjectFrame（既有 bounds/center/position/radius/distance/near/far 加 zoom）。默认 computeObjectFrame/fitObject 和 transitionToObject 继续要求透视相机，避免一个接口出现不同缩放含义。此决策补充 ADR-0026 的后续正交取景，尚未包含正交平滑过渡。

两种相机复用内部 computeFrameBounds，按需准备世界矩阵、子树外骨骼和原生 bind inverse，再使用精确 Box3。正交采用保守的世界 AABB 包围球，不依赖当前 zoom；缩放为 min(未缩放宽,高)/(2*radius*padding)，距离为 max(2*radius*padding,minimumDistance)，因此任意朝向均可容纳包围球。padding 默认 1.2 且 >=1，minimumDistance 默认 0，direction 采用当前逆视线或显式世界方向。

## 应用与边界

仅支持未挂父级、无缩放、自动矩阵且居中的正交相机；拒绝 view offset、非对称视锥、无效 up/zoom/边界和不可表示投影，不承诺最紧凑视角、实例逐项裁剪或 shader 顶点位移。推荐 near/far 保守容纳深度；adjustClipping=false 允许原生 near=0，但现有范围不足时先拒绝。

fit 接受 OrthographicThreeApp，应用前检查宿主/viewport、控件归属及 min/maxZoom、distance、target radius/角度约束，不改调用方约束。先以关闭 damping/autoRotate 的公开 update 消耗残留，再设置 target、position、zoom、裁剪面/朝向并同步控件，最终恢复配置。整个准备/应用受相机写锁保护，选项 getter、顶点/控件回调异常后也释放锁。异常不回滚已发生的原生副作用，不自动绘制、启动或订阅宿主。

大小/姿态改变后由消费者重新取景；resize 不自动规划。演示在 fit 中抑制原生 controls change 的中间绘制，完成后显式绘制一次。

## 验证

原生数学/控件单测覆盖相机无写规划、窄幅/边距、世界角点、外部骨骼及父级缩放、无效布局/输入、无额外调度、约束/配置恢复、near=0、宿主结束、准备重入和 getter/控件失败。浏览器将对象放大 20 倍后验证真实像素恢复、拾取/标签、对侧隔离、窄屏重新取景及零尺寸失败恢复。tarball 核验新增命名导出和 zoom 类型，旧透视边界保持。

## 来源

- [OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html)
- [Box3 精确世界边界](https://threejs.org/docs/pages/Box3.html)
- [r187 OrbitControls 距离与缩放约束](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/controls/OrbitControls.js)
