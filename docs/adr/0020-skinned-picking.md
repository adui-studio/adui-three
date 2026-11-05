# ADR-0020 拾取前刷新蒙皮边界

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-032
- 替代关系：补充 FR-014 的动画目标契约

## 决策

PickingOptions.updateSkinnedBounds 默认 true。有效画布坐标拾取时，在同步目标世界矩阵后，按 recursive 的目标范围对 SkinnedMesh 去重准备：同步骨骼世界矩阵（包括 mesh 树外的兄弟骨骼），调用原生 updateMatrixWorld 更新 attached bind inverse，重新 computeBoundingSphere；已有 boundingBox 时同步刷新，不创建未使用的 box。然后调用原生 Raycaster，保持层/交点/可见性语义。

原生蒙皮 sphere 只自动初始化一次，box 需调用者维护；两项先行失败回归显示骨骼移动和兄弟骨骼/父变换会被旧边界漏选。拾取时刷新满足暂停宿主、未先绘制及外部原生骨骼写入的使用方式，无需额外 RAF 或每帧遍历。

## 成本与所有权

每次有效 pick 对参与的蒙皮顶点/骨骼进行 CPU 计算，应用已维护边界或使用专用碰撞代理时可设 false。此选项不等于维护每帧渲染剔除，不处理任意 shader/GPU 位移；不接管目标、骨骼或资产，也不创建 GPU 资源。几何的 morph 属性继续共享，边界属于每个 mesh。

准备与 raycast 可触发用户重写方法；其后检查句柄/宿主存活，失效不再返回交点。整个同步 pick 拒绝重入，finally 释放保护，避免用户 getter/raycast 的嵌套调用覆盖同一 raycaster。普通错误保留、后续有效调用可重试，不回滚已计算的原生矩阵/边界。

## 验证

真实蒙皮数学用例覆盖旧 sphere/box、兄弟骨骼和 bind inverse、opt-out、不额外分配 box、重叠根去重、recursive=false、错误后恢复、同步失效和重入。原创样例新增 Reach 片段移动根骨骼 3 单位，在暂停宿主下以实际 GPU 像素定位鼠标，验证移出旧边界后仍可悬停/选中和返回，不改变其他实例；结果见 Harness。

## 实例身份补充

实例化网格接入后，以 object 引用和 instanceId/batchId 数值快照共同去重 hover 和匹配 click，不改变原生 Intersection。两项真实 InstancedMesh 数学测试与一项 batchId 结果复用测试先复现旧行为；修复后同一网格跨实例派发 hover，静止指针下切换实例取消点击。浏览器用实际红/蓝像素定位，真实移动鼠标验证实例 0 → 13 → 0 → 离开。

## 来源

- [SkinnedMesh 官方 API](https://threejs.org/docs/pages/SkinnedMesh.html)
- [r187 SkinnedMesh](https://github.com/mrdoob/three.js/blob/r187/src/objects/SkinnedMesh.js)
- [r187 Raycaster](https://github.com/mrdoob/three.js/blob/r187/src/core/Raycaster.js)
