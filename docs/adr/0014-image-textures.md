# ADR-0014 独立图片纹理与位图所有权

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-026
- 替代关系：无，新增 textures 可选入口

## 决策

loadTexture(app, url, options) 返回 Promise<TextureAsset>。options 支持 signal、colorSpace=SRGBColorSpace、flipY=true、onProgress 和 onCleanupError。颜色空间仅接受 SRGBColorSpace/LinearSRGBColorSpace/NoColorSpace；普通颜色图默认 sRGB，法线/标量图由应用指定 NoColorSpace，不按文件名推断。URL、配置与能力检查在下载前完成，调用时保存选项。

使用 FileLoader arraybuffer 共享不可变下载字节，然后在宿主画布所属 Window 逐任务调用 createImageBitmap(new Blob([buffer]), options)。不使用 ImageBitmapLoader 的 URL 位图缓存，因为不同选项可能混用同一缓存结果，且无法独立拥有 close 权限。原生纹理与位图均逐任务拥有，即使运输合并也不互相关闭。

ImageBitmapOptions 固定 premultiplyAlpha=none、colorSpaceConversion=none，imageOrientation 按 flipY 选择 flipY/none。原生 Texture.colorSpace 标记颜色意图；Texture.flipY=false，因为翻转已经烘焙到位图，改原生属性不能再次翻转。保留 Texture 默认过滤/mip/wrap，消费者可用原生 API 修改。

## 生命周期

资产提供 texture、前置 resources、disposed、dispose，并登记宿主资源。加载不修改材质或场景、不绘制、不启动宿主或增加循环。应用在材质首次加/移除 map 时更新 material.needsUpdate，并在资产 resources 中登记自己的解除引用钩子。

资产释放先前置钩子，再 texture.dispose，最后关闭原始 bitmap 快照，三阶段异常继续尝试并聚合。重复释放不重试失败项，不关闭后来替换到 texture.image 的外部位图。不要单独调用原生 dispose/close，也不要在拥有者结束后继续借用该纹理；跨宿主共享的额外引用由应用先解除。

signal、宿主或资源 scope 结束立即拒绝 AbortError；不调用 manager.abort 或中止可能合并的运输。迟到字节不再解码，在途解码不能中止，迟到位图关闭且不创建 Texture。迟到解码失败被消费；已结算的清理失败交 onCleanupError 或控制台。进度仅为主文件字节，未知 total/ratio 为 null，进度回调异常拒绝本任务。

## 验证与边界

单测保留真实 Texture，控制 FileLoader 与异步位图解码；验证颜色/方向快照、独立位图、运输/解码/取消竞争、scope 释放、进度、失败清理和原始图像所有权。

浏览器使用项目原创四象限 PNG，验证实际纹理/翻转像素、暂停和移除恢复、同 URL 单次请求独立解码、取消/销毁期间延后交付真实 ImageBitmap，以及三轮 GPU texture/位图关闭计数回到基线。测试只用原生浏览器解码器，没有新增编码依赖。

需要 Window.createImageBitmap，不提供 HTMLImageElement 或 Worker 后备路径。具体图片格式和 EXIF 方向等沿用浏览器解码，不承诺完整格式矩阵、色彩标定、跨域绕过或长期资源/性能指标。独立 KTX2、HDR、视频/画布/数据纹理不在此 API；HDR 使用 environment，KTX2 目前只在模型加载路径支持。

## 来源

- [Texture 官方文档](https://threejs.org/docs/pages/Texture.html)
- [r187 ImageBitmapLoader](https://github.com/mrdoob/three.js/blob/r187/src/loaders/ImageBitmapLoader.js)
- [createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)
- [ImageBitmap.close](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close)
