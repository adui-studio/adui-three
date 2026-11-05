# ADR-0016 独立二维 KTX2 资产

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-028
- 替代关系：扩展 ADR-0006 / ADR-0014，保留模型和图片入口

## 决策

textures 新增 loadKTX2(app,url,options)，显式 transcoderPath（以 / 结尾的目录或 JS/WASM URL 对）、workerLimit=1（1–32）、signal/onProgress/onCleanupError。配置在异步前保存；不默认 CDN、不修改全局缓存、无新依赖或循环。

能力检测借用 app.renderer。独立 FileLoader 下载 ArrayBuffer，完成后交内部 TaskKTX2Loader.parse；适配层复制输入，隔离全局任务缓存和转移后的字节。任务早于解析取消则跳过迟到字节，原生解析已经开始则等回调完成，之后释放转码器/Worker/Blob URL；不中止共享运输或承诺强制超时。原生失败可拒绝，已结算的清理失败报告。

成功返回 KTX2TextureAsset：原生 CompressedTexture、前置 resources、disposed、幂等 dispose。资源登记宿主，移交后适配层不再拥有纹理；失败/取消/不支持结果由适配层清理。资产先运行消费者解除钩子，再清纹理，失败继续并聚合；没有 ImageBitmap.close。

## 格式与类型边界

首版仅接收二维 Basis 输出。r187 原生声明只写 CompressedTexture，但运行时也可能返回 DataTexture、数组或立方纹理；按实际类型标记拒绝原始未压缩/数组/立方结果，并清理它们。不把原生类型声明当成完整格式支持承诺。

保留文件的颜色空间、mip 链、预乘和原始方向，不提供 flipY/colorSpace 覆盖，不生成压缩 mip。RGBA 回退仍使用原生 Basis 纹理路径。当前只实测 ETC1S/BasisLZ；UASTC/HDR、全部 GPU 格式和长期资源指标尚未验证。

## 集成与验证

应用选择材质、设置 needsUpdate，并在资产 resources 登记解除引用；加载不自动绑定、绘制或启动宿主。演示复用已存在原创 checker.ktx2 与本地 Basis 资源，不新增编码器或二进制。

单测控制运输/原生 parse，保留适配层、原生纹理及资源 scope，验证参数/快照、能力检测、独立缓冲和归属、取消/迟到、错误恢复、格式边界和清理报告。浏览器验证真实压缩 mip/纹理删除、同 URL 一次下载及独立取消、WASM 初始化期间销毁、缺失转码器/无效容器恢复及 RGBA 回退。模型和独立纹理复用测试探针，实际结果见 Harness。

## 来源

- [KTX2Loader 官方文档](https://threejs.org/docs/pages/KTX2Loader.html)
- [r187 KTX2Loader](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/loaders/KTX2Loader.js)
- [原模型 KTX2 决策](0006-ktx2-lifecycle.md)
