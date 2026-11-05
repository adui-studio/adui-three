# 演示解码资源与许可

Draco JS/WASM 从锁定的 Three.js 0.187.0 glTF decoder 目录通过 Vite URL 导入，Basis JS/WASM 来自同版本 basis 目录，Meshopt decoder 来自同版本 Three.js addon，并按需动态导入。没有从 CDN 加载运行时解码器，也未把第三方解码实现复制到主库源码。

- [Three.js MIT](three.txt)：Three.js 0.187.0 原始 LICENSE。
- [Draco Apache-2.0](draco.txt)：Google Draco 1.5.7 官方 LICENSE；Three.js Draco README 标注相同许可。
- [Meshoptimizer MIT](meshoptimizer.txt)：编码器 0.25.0 的 LICENSE，另保留 r187 decoder 源头的 2016–2026 作者声明。
- [Basis Universal Apache-2.0](basis.txt)：官方 v1_60_snapshot_final 固定提交的原始 LICENSE；r187 basis README 同样标注 Apache-2.0，覆盖本轮使用来源记录。

几何压缩样例使用开发依赖 draco3dgltf 1.5.7 与 meshoptimizer 0.25.0，模型几何与 PNG 是本项目原创。原始解码器文件由构建工具输出到演示 dist，运行时许可说明随 public 目录复制；主 npm 包不包含这些二进制资源。

KTX2 棋盘也是本项目原创；开发生成器另使用 Basis Universal v1_60_snapshot_final 的官方预构建 JS/WASM，固定提交与字节哈希后下载到忽略的本地缓存，不分发该编码工具。运行时 Basis 资源只从锁定的 Three.js 依赖输出，不把开发编码工具版本冒充为运行转码器的精确上游提交。

来源：[Draco 许可](https://github.com/google/draco/blob/1.5.7/LICENSE)、[Meshoptimizer 许可](https://github.com/zeux/meshoptimizer/blob/v0.25/LICENSE.md)、[Three.js 许可](https://github.com/mrdoob/three.js/blob/r187/LICENSE)、[Basis 许可](https://github.com/BinomialLLC/basis_universal/blob/c54f46f8aaa44eff1bc6e1d919e61e18b2b8f7d1/LICENSE) 与 [r187 basis 来源说明](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/libs/basis/README.md)。此处记录实际使用的来源和声明，不代表完整依赖审计。
