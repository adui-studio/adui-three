# ADR-0032 对象世界边界测量

- 状态：Accepted
- 日期：2026-11-13
- 关联需求：FR-044、FR-019、FR-039
- 替代关系：提取取景的共享边界准备，保持两类相机 API 和生命周期

## 决策

geometry 可选入口提供 computeObjectBounds(object:Object3D):Box3。每次返回独立、可修改的世界轴对齐包围盒快照；消费者通过原生 getSize/getCenter 获取尺寸和中心。无相机、宿主、DOM、调度器或资源登记，调用不绘制、不推进动画、不上传属性、不归一化或重挂目标。世界单位由应用决定。

内部 object-bounds.ts 同时被 geometry 与两类相机取景引用，geometry 不导入 camera、控制器或 addon，核心默认入口也不反向导入。相机原有准备/应用写锁和控件约束保持；实例/批次改用当前矩阵及数量重新准备边界，避免旧缓存导致错误取景。

## 原生语义和副作用

先更新祖先/子树世界矩阵。对 SkinnedMesh 刷新被引用的骨骼（可在子树外），再按原生绑定模式同步 bindMatrixInverse；不改变 inverse-bind 数组或分配 boneTexture。普通 Mesh 交给 Box3.setFromObject(object,true)，逐 CPU 顶点采样当前形变和骨骼姿态。手动矩阵模式仍遵循原生自动更新开关。

InstancedMesh 先重算共享 geometry.boundingBox，再重算对象 boundingBox，读取当前 count 和矩阵；BatchedMesh 重算活动实例的聚合边界，沿用原生每几何体缓存和公开修改方法。它们使用原生保守盒，不承诺逐实例形变紧边界。矩阵、bindMatrixInverse 和上述包围盒缓存会被更新；几何体/材质/节点仍属于调用方，无 dispose 或 needsUpdate 写入。

包含隐藏对象和子树内的 CPU 几何体，不按可见性、layers、drawRange 或实际像素筛选。不是 OBB、碰撞体或屏幕边界，不计算 shader 位移/未知 GPU 顶点，不能用作任意自定义材质的可见表面测量。扫描成本随顶点、实例和骨骼增长，应用按需测量，不默认逐帧执行。

## 错误与验证

非 Object3D 输入抛 TypeError；空树、没有活动实例或最终边界非有限时抛 RangeError。零尺寸点盒有效。相同根对象的同步重入拒绝；原生准备失败向外传播，finally 解除防护供后续重试。失败可能已经更新部分原生矩阵或缓存，不承诺事务回滚。

原生数学单测覆盖负缩放/隐藏子树、暂停骨骼与形变、实例缓存/数量/CPU 几何体修改、批次删除、独立快照、所有权、错误与重入。演示选择显式按钮展示上次测量，不自动刷新；浏览器验证暂停姿态和父缩放、零尺寸容器、无额外绘制/动画推进、另一宿主与重建。tarball 消费检查声明和无 DOM 数学调用；既有相机取景/过渡回归继续运行。

## 来源

- [Box3 官方文档](https://threejs.org/docs/pages/Box3.html)
- [SkinnedMesh 官方文档](https://threejs.org/docs/pages/SkinnedMesh.html)
- [InstancedMesh 官方文档](https://threejs.org/docs/pages/InstancedMesh.html)
- [BatchedMesh 官方文档](https://threejs.org/docs/pages/BatchedMesh.html)
- [锁定 r187 的 Box3 实现](https://github.com/mrdoob/three.js/blob/r187/src/math/Box3.js)
