# 纹理

## 独立图片纹理

```ts
import { NoColorSpace } from "three";
import { loadTexture } from "@adui/three/textures";

const controller = new AbortController();
const image = await loadTexture(app, "/image.png", {
  signal: controller.signal,
  flipY: true, // 解码时翻转；glTF 的 UV 通常需要 false。
  // colorSpace: NoColorSpace, // 法线/标量图；颜色图默认 SRGBColorSpace。
});
const previous = material.map;
material.map = image.texture;
material.needsUpdate = true;
image.resources.track({
  dispose() {
    if (material.map === image.texture) {
      material.map = previous;
      material.needsUpdate = true;
    }
  },
});
if (app.state !== "running") app.renderOnce();
// image.dispose(); // 先解除材质引用，再清 GPU 和原始位图；宿主也会释放。
```

loadTexture 返回 TextureAsset，提供原生 texture、前置 resources、disposed 和幂等 dispose，不自动修改材质/场景或绘制。colorSpace 默认 SRGBColorSpace，另接受 LinearSRGBColorSpace、NoColorSpace；不会猜测贴图用途。options 另有 onProgress({ loaded,total,ratio }) 和 onCleanupError，未知 total/ratio 为 null。signal/宿主/scope 取消立即拒绝 AbortError，不中止共享运输；迟到字节跳过解码，迟到位图关闭。

每任务独立拥有 ImageBitmap，即使 URL 和下载字节相同也不共享位图；需要画布所属 Window 的 createImageBitmap，具体图片格式沿用浏览器支持。翻转烘焙在 imageOrientation，浏览器不做额外预乘或颜色转换，Texture.flipY=false；后来修改 flipY 无效，需要重新加载。过滤/mip/wrap 等用原生 API 配置。

资产释放按顺序尝试前置钩子、texture.dispose、原始 bitmap.close，错误聚合，重复释放不重试；不关闭后来替换的外部 image。不要单独 dispose/close 原生对象，也不要在资产结束后保留其他材质/场景的借用引用。loadTexture 不处理 KTX2、HDR、视频或画布；HDR 使用 environment，独立 KTX2 使用下节 loadKTX2，KTX2 模型使用 loaders。

## 独立 KTX2 纹理

```ts
import { loadKTX2 } from "@adui/three/textures";

const compressed = await loadKTX2(app, "/checker.ktx2", {
  transcoderPath: { js: "/basis/basis_transcoder.js", wasm: "/basis/basis_transcoder.wasm" },
  workerLimit: 1,
  signal: app.signal,
});
const previous = material.map;
material.map = compressed.texture;
material.needsUpdate = true;
compressed.resources.track({
  dispose() {
    if (material.map === compressed.texture) {
      material.map = previous;
      material.needsUpdate = true;
    }
  },
});
// compressed.dispose(); // 不再需要时清理；宿主也会释放。
```

LoadKTX2Options 必须显式配置匹配 Three.js r187 的转码器目录（以 / 结尾）或 JS/WASM URL 对，不默认 CDN。workerLimit 默认 1，范围 1–32；支持 signal、onProgress 和 onCleanupError，语义同图片加载。KTX2TextureAsset 拥有原生二维 Basis CompressedTexture、resources、disposed 和 dispose。原生 renderer 只用于能力检测，库不修改材质、绘制或启动宿主。

每任务独立转码器，下载字节复制后解析以隔离原生缓存。取消立即拒绝；迟到字节不解析，已经开始的转码等原生完成再释放 Worker/Blob URL 和迟到纹理。资产先运行前置钩子再清 GPU，无 ImageBitmap；不要单独 dispose 原生纹理。多任务有重复初始化成本，workerLimit 不是全局并发限制；原生永不完成时不保证按时清理。

仅接收二维 Basis，原始未压缩、数组或立方结果拒绝并清理；保留文件颜色空间/mip/方向，不能用 flipY 翻转或现场生成压缩 mip。实测 ETC1S/BasisLZ、真实压缩上传及 RGBA 回退；UASTC/HDR、完整硬件格式和长期指标仍待验收。
