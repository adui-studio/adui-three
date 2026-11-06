# ADR-0007 相机取景与控件同步

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-019
- 替代关系：扩展 ADR-0002 的可选能力，不改变宿主调度

## 背景与方案

模型尺寸和位置由资产决定，加载器默认保留原始变换；应用需要按模型边界调整相机。可实现逐角点的紧凑取景、世界包围球的保守取景，或引入相机动画控制器。本轮选择即时保守取景，先明确原生相机、OrbitControls 和暂停状态的边界。

## 决策

- 新增可选 camera 入口：computeObjectFrame(camera, object, options) 仅规划，fitObject(app, object, options) 立即应用；不创建 RAF、订阅、资源句柄或自动启动宿主，不跟随后续模型/容器变化。
- 更新祖先/子节点世界矩阵，以原生 Box3.setFromObject(object,true) 获取世界 AABB；包围球半径为对角线一半。用考虑 zoom 的有效垂直 FOV 与 aspect 对应水平 FOV 中的较小半角，计算 distance=radius*padding/sin(halfAngle)，再应用 minimumDistance。
- 默认 padding=1.2（>=1），minimumDistance=0；默认保持视线方向，也接受非零世界 direction。返回 Box3、center、position、radius、distance、推荐 near/far 的独立快照。拒绝空/零/非有限边界、无效参数和无法保持计算距离的数值范围。
- 支持未挂父节点、无缩放、自动矩阵、无 view/filmOffset 的透视相机。fitObject 要求宿主和 resource scope 存活、视口非零；ready/stopped 可用。默认设置推荐裁剪面，adjustClipping=false 时先检查原裁剪面能包含取景球。
- 可借用当前相机的原生 OrbitControls。取景距离遵守 minDistance；maxDistance 与 cursor/目标半径范围无法容纳时在写相机前拒绝，不修改这些限制。方向继续受原生角度约束，包围球对方向变化保持保守。
- 控件同步时临时关闭 damping/autoRotate，通过公开 update(0) 消耗残余平移/旋转/缩放，再写相机和 target 并 update(0)。finally 恢复原标志；不访问控件私有字段。同步事件中宿主销毁会中止后续写入，同相机重入拒绝。消费者 change 回调抛错可能保留原生更新已发生的变动，不承诺事务回滚。
- 演示显式提供“适配视角”和模型放大 20 倍，移除演示固定 maxDistance=15 的限制以容纳大模型。暂停时由消费者显式 render 一次并 update 标签，库本身仍不渲染或启停。

## 代价与验证边界

AABB 包围球可能留较多空白，precise 遍历有 CPU 成本。原生边界包含隐藏后代；InstancedMesh/BatchedMesh 沿用原生保守边界，着色器位移或过期实例边界需由应用维护。取景只描述调用时快照；动画、旋转、resize 后按需求重算。裁剪面针对目标，其他场景物体可能被裁剪。

单测投影世界 AABB 角点验证横竖屏、zoom、缩放和变换，使用真实 OrbitControls 验证惯性、限制、事件重入及销毁。浏览器验证暂停绘制、拾取/标签、大模型、窄容器、零尺寸、移除重建与真实拖拽。平滑过渡由 [ADR-0008](0008-camera-transition.md) 实现，正交另由 [ADR-0027](0027-orthographic-framing.md) 和 [ADR-0028](0028-orthographic-transition.md) 提供独立接口；父级/偏轴相机及完整设备矩阵仍留后续，实际结果见 Harness。

## 蒙皮姿态补充

2026-11-06 补查发现 updateWorldMatrix 不执行 SkinnedMesh.updateMatrixWorld 中的绑定逆矩阵刷新，且取景子树可能不含其骨骼。现在在 precise Box3 顶点采样前更新每个蒙皮网格引用的骨骼世界矩阵，再通过原生 updateMatrixWorld 按 bindMode 刷新绑定逆矩阵。覆盖 Attached/Detached 模式，不改骨骼 inverse-bind 数组、不创建骨骼 GPU 纹理或驱动动画。

先行单测复现兄弟骨骼姿态丢失和父级变换重复计入；真实浏览器复现缩放 20 倍却将取景距离放大约 400 倍。修复后复用同一路径的即时取景和平滑取景按当前姿态工作。操作仍是调用时快照，新增的骨骼矩阵更新仅发生在请求取景时，不代替逐帧动画边界维护。

## 准备期重入补充

2026-11-06 两项先行失败回归发现，透视即时取景在选项 getter 和世界顶点准备时尚未持有写锁，嵌套 fitObject 可写同一相机。锁现覆盖 prepareObjectFrame 起的整个调用，准备失败在取消旧过渡前抛出，所有退出路径释放；控件标志仅在实际租用后恢复，恢复异常也不遗留锁。纯计算接口仍不接管写入。

## 来源

- [r187 Box3](https://github.com/mrdoob/three.js/blob/r187/src/math/Box3.js)
- [r187 PerspectiveCamera](https://github.com/mrdoob/three.js/blob/r187/src/cameras/PerspectiveCamera.js)
- [r187 OrbitControls](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/controls/OrbitControls.js)
- [r187 SkinnedMesh](https://github.com/mrdoob/three.js/blob/r187/src/objects/SkinnedMesh.js)
