# ADR-0018 模型实例与共享资产租约

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-030
- 替代关系：扩展 ADR-0003 / ADR-0004 的显式克隆路径

## 决策

loaders 导出同步 cloneGLTF(app, source, {addToScene?})，默认挂载到目标宿主。source 必须为本库仍存活的 GLTFModel 或 GLTFInstance，不接受手工拼装句柄。只复制当前默认 scene 树，不复制 parser、其他 scenes、模型扩展 scope 或消费者监听；不是 URL 缓存或重新下载。

GLTFInstance 提供 scene、独立 animations、resources、disposed、dispose。动画控制器接受模型或实例，仍在目标宿主更新阶段使用独立 Mixer，不自动播放。调用方决定姿态、位置、启停和绘制；克隆不会启动宿主或创建新 RAF。

使用固定 r187 SkeletonUtils.clone 复制节点和重连骨骼；克隆前拒绝树外骨骼。原生 Skeleton.clone 仍共享 inverse 矩阵，因此额外复制 boneInverses。普通 morph 权重与 InstancedMesh 矩阵沿用原生复制，实例 morphTexture 另用 TextureSource 拥有独立数据。AnimationClip.clone 复制轨道数据并保留原生插值工厂；UUID 节点绑定改写到新树，命名绑定保持原生语义。不是骨架重定向；插件扩展与自定义 clone/copy 行为未承诺兼容。

## 所有权与清理

原加载快照拆成节点/骨骼 scope 与共享 geometry/material/texture/image scope。原模型和每个显式实例各持一个幂等租约。每个句柄结束先清自己的扩展（含 Mixer），detach，释放自己的节点/骨骼，再释放租约；最后一个使用者结束才释放整份原始共享资产快照。原模型结束后不能再用它克隆，但存活实例可继续创建实例。跨宿主使用不会将实例登记到源宿主；任一宿主结束只清自己的句柄。

共享粒度是整个原加载快照，包含其他原始 scenes 的资产，避免子集引用计数和动态追踪。材质、纹理、几何体仍按引用共享，修改会影响所有使用者，不可提前手动 dispose。加载后新增/替换的借用资源仍由外部所有者保证存活；clone 不接管它们。只承诺标准节点、骨骼和 morph 动画的独立数据，不保证共享材质的属性动画独立。

克隆和挂载可能触发同步用户代码；保留租约并在原生操作后重查所有者。失败回滚临时节点、骨骼和租约；某项清理失败仍尝试其余操作并聚合错误。原生克隆未返回的局部 CPU 分配可由 GC 回收，不宣称自定义 clone 中的外部副作用能够回滚。

## 验证与边界

单测使用真实节点、Skeleton、Mixer、morph 和 InstancedMesh，覆盖独立数据/UUID 重绑、源先结束/实例先结束、实例再克隆、跨宿主、外部资源、非法状态/骨骼、同步销毁及清理失败。浏览器使用原创 GLB 验证实际像素、源 renderer 销毁后的另一宿主动画/纹理、同宿主共享 GPU 分配及三轮回到基线。后续原创双 joint/morph 样例补充真实 GPU 变形、UUID 重绑、姿态隔离和骨骼/morph 纹理释放；尚未外推完整 GPU/资产/浏览器矩阵。结果见 Harness。

## 来源

- [SkeletonUtils 官方 API](https://threejs.org/docs/pages/module-SkeletonUtils.html)
- [r187 SkeletonUtils](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/utils/SkeletonUtils.js)
- [r187 Skeleton](https://github.com/mrdoob/three.js/blob/r187/src/objects/Skeleton.js)
- [r187 KeyframeTrack](https://github.com/mrdoob/three.js/blob/r187/src/animation/KeyframeTrack.js)
- [TextureSource 官方 API](https://threejs.org/docs/pages/TextureSource.html)
