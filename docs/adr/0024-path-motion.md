# ADR-0024 宿主驱动的对象路径运动

- 状态：Accepted
- 日期：2026-11-06
- 关联需求：FR-036

## 决策

animation 入口新增 followPath(app,object,options)，借用原生 Curve<Vector3> 和已挂在本宿主 scene 下的对象。duration 是每次单向遍历的正有限宿主秒数，loop 为 once（默认）、repeat 或 pingpong。使用 getPointAt 的原生近似弧长采样，坐标属于目标父级局部空间；父级变换可继续变化，但非均匀缩放后不保证世界速度恒定。曲线控制点/弧长配置在运动中保持不变；原生方法可缓存长度，库不改控制点或接管缓存。

创建时验证正有限长度、可用的三维采样和目标自动矩阵，立即放到曲线起点但不绘制/启动宿主。orientToPath 默认 false，只写 position；true 时将局部 +Z 旋到切线，回程反向，不提供倾斜/Frenet 帧或转弯平滑。零/非有限切线拒绝，开曲线 repeat 接缝会跳回起点。

## 调度、取消与所有权

句柄有 state、当前路径比例 progress、始终 resolve 的 finished，以及 pause/resume/cancel/dispose。只登记 app.onUpdate，使用宿主有效 delta；局部暂停不停止另一运动或相机控制，宿主暂停不补墙钟时间。once 完成自动结束；repeat/pingpong 无限运行到取消。取消/结束保留已写姿态，不释放对象、曲线、几何体、材质或纹理。

运动登记 app.resources 和可选 scope（如 model.resources），结束解除两处登记、监听和更新。signal 取消和宿主 abort 立即结束；预先取消的请求不取样、不替换旧运动。同一目标只保留一个控制器，新请求完整校验后才以 replaced 结束旧请求。目标离开 scene、换父节点、关闭自动矩阵或应用改写所拥有的位置/旋转，在下一次更新以 target-changed 结束；未启用朝向时不占用旋转，scale 始终留给应用。

以逐目标写入锁防止曲线自定义回调重入；每次自定义采样返回后核对取消和所有者，失效结果不写入，暂停中返回的候选也不提交。原生字段自定义副作用不承诺事务回滚。采样位置和朝向均准备完毕后才写对象；运行错误结束 failed 并重新抛给宿主既有帧异常策略。清理尝试全部步骤，失败通过 AggregateError 的 finished 结果报告。

## 范围与验证

这是通用曲线运动，不包含寻路网格、碰撞、业务路线、相机漫游或旧项目私有坐标。单测使用 LineCurve3/CatmullRomCurve3，覆盖空间/阶段、所有权/替换/跨宿主、回调/异常、取消/暂停；浏览器对两个独立运动验证真实像素与拾取、局部/宿主暂停、外部手动修改、目标移除/重建、移动端和三轮 GPU buffer 清理。包消费核验新增运行时导出与严格声明，默认核心不反向导入。

## 来源

- [Curve](https://threejs.org/docs/pages/Curve.html)
- [CatmullRomCurve3](https://threejs.org/docs/pages/CatmullRomCurve3.html)
- [Quaternion](https://threejs.org/docs/pages/Quaternion.html)
