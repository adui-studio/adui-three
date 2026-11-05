# ADR-0006 KTX2 转码与纹理所有权

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-018
- 替代关系：扩展 ADR-0003 / ADR-0005 的加载与清理契约

## 背景与候选方案

模型已有 Draco/Meshopt 几何压缩，继续支持 KHR_texture_basisu。可借用应用共享 KTX2Loader、建立共享转码服务，或按任务持有转码器。共享方案能减少初始化，但需要跨模型、宿主与在途任务的租约。r187 还按 ArrayBuffer 缓存转码任务/Texture，同 URL 的 FileLoader 合并请求可把同一缓冲交给不同任务；直接复用结果会混淆独立模型的纹理所有权。

## 决策

- 在 loadGLTF 增加 ktx2:KTX2Options；显式传 transcoderPath（非空目录，或 JS/WASM URL 对），workerLimit 默认 1，限制 1–32，匹配 r187 WorkerPool 的 32 位掩码。配置在异步前拍快照。
- 每任务内部 TaskKTX2Loader，先 detectSupport(app.renderer)，不修改或接管借用的 renderer。URL 对经私有 LoadingManager 映射两个原生文件名，纹理资源 URL 原样透传。不采用废弃 detectSupportAsync、不默认 CDN、不预加载。
- 每次原生 parse 前复制 ArrayBuffer，避免转移合并/缓存输入及跨任务共享 Texture；不修改全局 Cache。付出一份解析输入复制成本，换取独立模型所有权。
- 包装原生 parse 的成功/失败回调以计数。模型原生完成后结束任务，阻止新解析；已开始的解析继续，全部结束才清理转码器，保护失败提前返回和初始化迟到的情况。逻辑取消不提前结束原生任务或终止 Worker。
- 资源快照成功建立后移交已解码纹理，正常/迟到模型均由既有模型句柄清理。原生模型失败、尚未移交的 KTX2 纹理由适配层清理；错误经 onCleanupError 报告并继续其他清理。
- 原生 GLTFLoader 会吞掉部分纹理错误并返回无贴图模型；适配层记录 KTX2 文件/解析的首个错误，原生完成时拒绝原错误并清理已返回结果。普通 PNG/JPEG 路径继续沿用原生行为。
- r187 的 KTX2Loader.dispose 无条件递减原生活动计数，因此只有 transcoderPending 已建立时才调用。未初始化实例没有 Worker/Blob URL，直接结束；此行为需在升级 Three.js 时重新核验。
- 演示通过 Vite URL 导入锁定 Three.js 的本地 Basis JS/WASM，附 Apache-2.0 许可。主包只引用外部 addon，不捆绑二进制或编码器。

## 代价与边界

独立任务增加 WASM/Worker 初始化和缓冲复制，多个并行任务可能触发原生多实例性能提示；保留提示，不建立全局池。workerLimit 不是应用级并发限制。清理依赖原生任务/回调最终结束；Worker 崩溃、脚本执行错误或永不结束的请求不承诺自动恢复，不引入强制超时协议。其他未返回的局部几何/非 KTX2 纹理仍受 ADR-0003 的边界约束。

本轮仅集成模型中的 KTX2，实测 ETC1S + BasisLZ、压缩上传及无压缩扩展时的 RGBA 回退。独立纹理 API、UASTC/HDR/数组/立方纹理、所有 GPU 转码格式和长期性能基准留待真实需求。

## 可重建资产与验证

原创 16×16 棋盘图带 5 级 mip 和 UV，输出外部 checker.ktx2、ktx2.gltf 与内嵌 ktx2.glb。开发生成器使用官方 Basis Universal v1_60_snapshot_final，固定提交 c54f46f8aaa44eff1bc6e1d919e61e18b2b8f7d1 和 JS/WASM SHA256，首次下载到忽略的本地缓存，验证后才执行；不增加 npm 依赖或把工具分发到应用。缓存已备妥时可离线重建。

单测覆盖输入隔离、配置、能力检测、未初始化释放、并行解析失败与迟到清理、错误传播和组合解码器清理。浏览器观察真实 Worker、Blob URL、WebGL 上传/删除，覆盖普通模型无 Basis 请求、GLTF/GLB、错误恢复、同 URL 单请求与独立转码、初始化中销毁、RGBA 回退。实际结果见 [Harness](../HARNESS.md)。

## 来源

- [r187 KTX2Loader](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/loaders/KTX2Loader.js) / [WorkerPool](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/utils/WorkerPool.js)
- [r187 GLTFLoader 纹理路径](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/loaders/GLTFLoader.js)
- [KHR_texture_basisu](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu)
- [固定版本官方编码器](https://github.com/BinomialLLC/basis_universal/tree/c54f46f8aaa44eff1bc6e1d919e61e18b2b8f7d1/webgl/encoder) / [许可记录](../../apps/website/public/licenses/README.md)
