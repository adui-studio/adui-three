# 本地模型 Fixtures

sample.gltf 与 sample.glb 是本项目原创的四面体，带一个内嵌白色 PNG 纹理，采用仓库 MIT 许可。invalid.gltf 故意使用不支持的 glTF 1.0，仅用于失败反馈验证。没有私有资产、外部模型或在线依赖。

在根目录运行 `pnpm run fixtures:models` 通过 [生成脚本](../../../../scripts/generate-model-fixtures.mjs) 重建。浏览器回归使用这两个小文件验证真实 GLTFLoader 解码、纹理与 GLB 路径，不代表已验证大型、压缩、骨骼或复杂资产。

animated.glb 复用原创四面体与纹理，包含 Lift（上下平移）和 Slide（左右平移）两个时长 2 秒的 LINEAR 节点动画，同样采用 MIT 许可并由生成器重建。用于验证 Mixer、模型变换、DOM 标签跟随和播放生命周期，不代表已实测骨骼/morph 动画资产。

skin-morph.glb 增加两个 joint、显式 inverse bind 矩阵、JOINTS_0/WEIGHTS_0 和一个 POSITION morph target。Bend 在 2 秒内弯曲顶部骨骼，Morph 在同一时间内改变顶部位置；顶部骨骼故意不命名，令原生 GLTFLoader 产生 UUID 轨道。所有几何/权重/动画数据与 PNG 都由项目生成，采用 MIT 许可，无外部骨架或模型输入。

该样例用于实际 GPU 骨骼/morph 变形、克隆 UUID 重绑/姿态隔离以及 bone texture/共享 morph 纹理释放验收；两段片段可用演示时间轴检查。不作为完整资产兼容性、蒙皮性能或形变后材质物理正确性的基准；未运行独立 glTF schema validator。规范依据为 [glTF 2.0 Skins](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#skins) 和 [Morph Targets](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#morph-targets)。

draco.glb 使用 KHR_draco_mesh_compression，meshopt.glb 使用 EXT_meshopt_compression，均只压缩本项目原创四面体的 position/normal，保留同一 PNG 和材质。生成器使用开发依赖 draco3dgltf 1.5.7 与 meshoptimizer 0.25.0；演示的运行时 decoder 从 Three.js 0.187.0 提供，来源和许可证见 [许可记录](../licenses/README.md)。

这些四面体只用于解码与生命周期验证，压缩元数据可能令总文件更大，不作为压缩率或性能基准。压缩样例不替换原静态或动画 fixtures。

Draco 生成设置为 position 14 bit、normal 10 bit 量化（有损）；Meshopt 直接编码原有 FLOAT 属性缓冲，不执行简化或量化。

checker.ktx2 是原创 16×16 黄蓝棋盘，ETC1S/BasisLZ、sRGB、5 级 mip；ktx2.gltf 使用外部纹理，ktx2.glb 内嵌同一内容，两者增加显式 TEXCOORD_0。KHR_texture_basisu 为 required，无 PNG 回退；设备缺少压缩纹理扩展时由 Basis 转码器回退 RGBA。资产继续采用 MIT 许可，不作为质量/压缩率基准。

KTX2 生成通过 [工具入口](../../../../scripts/basis-encoder.mjs) 使用官方 Basis Universal v1_60_snapshot_final，固定提交 c54f46f8aaa44eff1bc6e1d919e61e18b2b8f7d1 与 JS/WASM SHA256。首次运行需下载两份开发工具到被忽略的 .cache/model-fixtures，校验后执行；暖缓存可离线重建。工具不属于模型输入，不进入主包或演示运行时分发；运行转码器仍来自 Three.js 0.187.0，许可见相邻记录。
