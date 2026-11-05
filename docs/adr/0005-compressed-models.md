# ADR-0005 压缩模型解码与任务所有权

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-017
- 替代关系：扩展 ADR-0003，不改变逻辑取消、资源快照与模型生命周期

## 背景与候选方案

普通 GLTF/GLB 与动画已实现，继续支持 KHR_draco_mesh_compression 和 EXT_meshopt_compression。可借用共享 DRACOLoader、建立解码池服务，或为每任务创建自有解码器。原生建议复用 Draco 实例，但借用的 Worker 不能随某次取消或宿主销毁而终止；全局池又需要租约、关闭与在途任务计数。

## 决策

- 扩展 loadGLTF 选项，不新增空包或插件容器。draco 配置显式 decoderPath（目录或 r187 JS/WASM URL 对）和 workerLimit（默认 1，正整数）；不默认 CDN，不使用废弃 setDecoderConfig。
- 每次配置 Draco 的任务拥有一个 DRACOLoader，底层 loadAsync 真正成功或失败后 dispose；不在逻辑取消、进度回调失败或宿主销毁时提前终止。原生工作可继续，迟到模型先按既有契约清理，再释放解码器，避免留下等待 Worker 的调用。
- Meshopt 模块由应用显式传入并借用；不初始化、重配或销毁其自建 Workers。解码器缺失、文件请求和原生解码失败保持原始错误。
- 解码器释放错误通过 onCleanupError 报告；报告时任务 Promise 已结束，不撤销已交付模型或替换原失败结果。Reporter 异常沿用现有兜底日志。
- 普通调用不创建 Draco 实例或请求解码二进制。核心默认入口不依赖 loaders；loaders 的 Three.js/addons 保持外部化。
- 演示用 Vite URL 导入锁定 Three.js 的 glTF decoder 文件，Meshopt 模块在需要时动态导入；全部资源本地托管并附许可证。模型内容仍为项目原创，开发编码器仅用于生成 fixtures。

## 代价与边界

独立实例有重复 Worker/WASM 初始化成本，workerLimit 是每任务限制，不是全局并发上限。暂不增加共享解码池；后续有真实并发需求再设计租约服务。逻辑取消不保证网络/CPU 工作立即停止；底层不结束时，暂时保留完成清理所需引用。原生解析失败未返回的局部资源仍沿用 ADR-0003 的边界。

浏览器需要 Worker、Blob URL 和 WebAssembly；部署策略须允许相应资源。使用解码器 URL 对时采用 WASM 路径，不承诺旧式纯 JS 回退。KTX2、一般 loader/插件注入、批量优化与压缩率/性能基准不在此轮范围。

## 验证与来源

单测覆盖配置快照、参数校验、正常/迟到成功或失败、设置失败、释放错误和任务隔离。浏览器用原生 Worker 与 ImageBitmap 计数验证实际解码、同 URL 取消隔离、初始化中销毁、错误恢复及普通模型无解码器请求。四面体很小，压缩元数据可比节省字节更多，不把样例当作压缩率基准。

- [r187 DRACOLoader URL 和释放接口](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/loaders/DRACOLoader.js)
- [Draco glTF 扩展](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_draco_mesh_compression)
- [Meshopt glTF 扩展](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_meshopt_compression)
- [Meshoptimizer 0.25 编码接口](https://github.com/zeux/meshoptimizer/tree/v0.25/js)
- [演示许可记录](../../apps/website/public/licenses/README.md)

接口与实际结果同步 [SDD](../SDD.md)、[需求](../REQUIREMENTS.md) 和 [Harness](../HARNESS.md)。
