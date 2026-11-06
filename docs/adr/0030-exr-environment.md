# ADR-0030 EXR 环境资产

- 状态：Accepted
- 日期：2026-11-06
- 关联需求：FR-042

## 决策

environment 子入口增加 loadEXR，复用 LoadHDROptions、HDREnvironment 和 attachEnvironment。HDR 是高动态范围资产的公共句柄；loadHDR 保持 Radiance RGBE 解析，loadEXR 显式使用 r187 EXRLoader、part=0、HalfFloatType、RGBAFormat。保留原生色彩空间、方向与过滤设置，映射为等距柱状环境；不自动猜格式、选 part、调整曝光或改业务材质。

两种格式共用内部任务生命周期与资产归属，默认核心不引入 loader。下载仍由 FileLoader 按 URL 合并，逻辑取消不 abort 共享运输；EXR 解码前为每个有效任务复制 ArrayBuffer，允许原生解压使用自有输入而不污染其他任务。已取消/结束的迟到响应跳过解析；同步解析不能中途抢占，解析过程中所有者结束则消费返回纹理并清理，不复活资产。

## 绑定与释放

load 不改场景；attachEnvironment 继续借用同宿主资产并独占绑定，按值恢复外部 environment/background/intensity。资产拥有 DataTexture 和扩展 scope，先结束绑定/消费者，再释放纹理及原生派生缓存。取消后清理错误沿用 onCleanupError，失败任务可重试，无新 RAF、Worker、全局解码器缓存或二进制分发。

## 原创资产与验证

离线生成 64×32 version 2 单 part 未压缩 OpenEXR：B/G/R FLOAT 通道、递增 scanline、原始数学渐变，峰值大于 4；原生解码为半浮点 RGBA。生成器直接写公开文件布局，没有复制编码器或图片。重复生成 HDR/EXR 字节哈希一致；不把 Three.js 解码成功当作完整 OpenEXR schema/压缩/多 part/深度数据验收。

七项 EXR 单测验证真实半浮点/方向/绑定、输入隔离、取消、解析期结束、迟到清理错误、失败重试及预取消；原十二项 HDR 测试保持。浏览器验证真实照明/背景/泛光、同 URL 隔离与结束、三轮源纹理和原生转换目标回到预热基线。EXRLoader 的 TinyEXR/OpenEXR 保留声明及 r187 vendored fflate 0.8.3 MIT 许可随演示提供，主库外部化原生 addon。

## 来源

- [EXRLoader 官方 API](https://threejs.org/docs/pages/EXRLoader.html)
- [r187 EXRLoader](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/loaders/EXRLoader.js)
- [OpenEXR 官方文件布局](https://openexr.com/en/latest/OpenEXRFileLayout.html)
- [fflate v0.8.3 许可](https://github.com/101arrowz/fflate/blob/v0.8.3/LICENSE)
