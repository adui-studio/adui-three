# ADR-0041 静态 BVH 与第一、第三人称控制

- 状态：Accepted
- 日期：2026-11-18
- 关联需求：FR-053、FR-054
- 替代关系：扩展 ADR-0008 的相机租约；保留已有 OrbitControls API

## 决策

新增可选 collision / navigation 入口。collision 使用精确锁定的 three-mesh-bvh 0.9.18：原生 MeshBVH 的 SAH、shapecast、ExtendedTriangle.closestPointToSegment 和 raycastFirst 承担空间索引、最近距离和射线查询。native mergeGeometries 合并自有位置快照，不修改 Mesh.prototype，不实现另一套 BVH。核心和普通 controls 不导入 BVH，打包将它与 Three.js 外部化。

createCollisionWorld 显式接受根对象数组，更新世界矩阵，去重普通 Mesh，复制位置/索引、展开为三角形、烘焙世界变换；包含隐藏节点，忽略材质、groups、drawRange。拒绝蒙皮、形变、实例和批次网格及非有限/退化世界变换。动态资产请由应用用上游 StaticGeometryGenerator 等工具先烘焙；当前不提供自动刷新或增量 refit。bounds 是含 BVH 数值 padding 的保守独立快照。

查询不修改输入，返回独立数值。胶囊迭代将两端同时推出相交三角面，返回接触、总修正和 converged；达到预算不伪装已收敛。全局同步查询/构建保护防止原生临时量重入，finally 解除。世界只拥有私有 geometry/tree，dispose 先断开引用再释放，借用源几何体/材质不会销毁。调用者可登记到宿主 ResourceScope。

## 角色与相机

navigation 借用可选 CollisionWorld、透视 ThreeApp 和第三人称 actor，第一人称复用 PointerLockControls 看向，第三人称复用 OrbitControls 环绕/缩放；自有控件、监听和宿主更新订阅。没有第二个 RAF，不自动 start 或 render。角色运动使用统一 Y-up 胶囊，足点是 position；内部有限子步运动、重力、支撑坡度、跳跃和速度投影使用 BVH 的表面修正结果。子步超预算在提交前抛错，不静默截断宿主时间；更新异常释放控件并交由宿主停止策略处理。

场景必须无变换，相机无父级、Y-up、单位缩放和自动矩阵；actor 必须保持场景直接子节点，其 position 由控制器独占，外部改写下次更新结束控制器。用 teleport 改位置；动画模型建议放入 actor Group 的子树，避免根运动竞争。actor 及模型/世界均借用。第三人称只做 target→camera 的射线遮挡，保留 cameraPadding；不是球体/视锥扫掠或全物理相机。

原先 attachOrbitControls 的句柄应先 dispose，再创建角色控制。每个相机只允许一个角色控制器；新取景/过渡通过共享相机租约释放角色控制器。切换第一/第三人称须显式 dispose 旧句柄，不能同时写同一相机。原生 controls 可调节其看向/环绕参数；不要改 object、直接移动相机/actor、启用 autoRotate 或 enablePan 来绕过角色运动。

## 输入与结束

键盘仅接管移动/跳跃键：第一人称须本画布锁定，第三人称须画布聚焦且没有其他指针锁。每次更新重新核对所有者，焦点切换、blur、hidden、禁用清空输入；Escape 仅释放自己的锁。setInput 为显式程序/手柄输入，不要求焦点或锁，复制归一化轴，斜向合成不超速。宿主停止不推进角色，重新开始的零 delta 清键；程序输入保留直到 clearInput/禁用/失焦/销毁。

第一人称 lock 必须由用户手势触发并在宿主运行、非零尺寸且可见时调用，Promise 报告申请结果；同画布在途申请不能重复，即使旧控件已销毁也等其完成。迟到授权在旧所有者结束后立即释放且拒绝，不释放其他 canvas 的锁。原生 lock 方法不返回申请 Promise，因此句柄使用标准 requestPointerLock，原生控件仍负责鼠标与 pointerlockchange。

scope/宿主/显式 dispose 解除监听、更新、相机登记与输入，清理原生控件，恢复自有 touchAction/tabindex 变更，全部独立清理尝试后聚合异常，重复销毁无操作。外部回调中结束所有者时丢弃候选运动；已发生的原生相机写入不回滚。world 先销毁后，角色下次更新报错并释放控制器；世界不会被控制器自动销毁。

## 限制与验证

这是有限子步的运动学静态表面控制，不是刚体引擎、完整连续碰撞、台阶攀爬、动态障碍或导航网格寻路。不承诺任意初始深度穿透、极端速度或所有复杂角落收敛；需要根据资产尺度设置 radius/height、skin、iterations 和 maxSubsteps。源几何体构建后改变不反映到快照。

真实 BVH 数学与原生控件单测覆盖输入所有权、移动/跳跃/顶棚/滑动、预算、迟到授权及清理；双实例演示 /?demo=navigation 验证 Chromium 指针锁、水平转向、Escape、画布像素、相机遮挡和重建。完整结果与环境限制见 [Harness](../HARNESS.md)。

## 来源

- [MeshBVH 官方 API](https://github.com/gkjohnson/three-mesh-bvh/blob/master/API.md)
- [PointerLockControls 官方文档](https://threejs.org/docs/pages/PointerLockControls.html)
- [OrbitControls 官方文档](https://threejs.org/docs/pages/OrbitControls.html)
- 实际安装版本的 package.json、index.d.ts 和 Three.js 0.187.0 原生控件已核对；三方示例未整段迁入。

## 支撑间隙补充

原生推出的 skin 留出分离间隙，微小 delta 的重力位移可能不足以再次穿入，不能把“无穿入接触”直接当作离地。无支撑且非上升时，以 radius*0.02 的有界向下胶囊探测确认可站表面；只接受已收敛、垂直落差和侧向修正均在预算内的结果，不向上攀台阶，不在上升或无地面时吸附。探测中所有者结束仍丢弃完整候选；主世界/资源所有权和迭代预算不变。

新增真实 BVH 微步长、贴墙混合步长、跳跃、离地与探测中销毁回归，避免偶发输入落在无支撑帧而被丢弃。该修复不扩大为动态刚体或完整台阶控制。
