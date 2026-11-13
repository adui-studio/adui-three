# ADR-0021 独立画面截图

- 状态：Accepted
- 日期：2026-11-06
- 关联需求：FR-033
- 替代关系：复用 ADR-0009 的单次绘制

## 决策

独立 capture 入口导出 captureFrame(app,options):Promise<Blob> 与 CaptureFrameOptions。type 为 PNG/JPEG/WebP，默认 image/png；quality 可选有限 [0,1]；signal 可选。使用宿主实际 drawing buffer 尺寸，先 app.render，再在同一同步任务将 canvas 复制到 detached Canvas 2D，随后 toBlob 编码。输出是普通浏览器图像，不含 DOM 标签、CSS 背景或界面，也不是 HDR/任意尺寸渲染导出。

不用 preserveDrawingBuffer，不改变相机、renderer、管线或宿主运行意图；app.render 不推进动画时间或新增 RAF。复制后的像素与后续渲染/resize 隔离。调用时隐藏、零尺寸、丢失上下文或非默认 render target 拒绝；绘制后再次检查。自定义管线须输出画布；默认 render target 条件不替代验证第三方管线的输出。

## 异步与所有权

每个任务拥有独立临时画布，登记 pending 清理到 app.resources，监听宿主及调用方 abort。取消/宿主或 scope 结束立即拒绝 AbortError；原生编码可能继续，迟到 callback 丢弃。完成、失败或取消均解除登记/监听并归零画布尺寸，尝试全部清理，失败聚合。库不创建 Blob URL 或下载；Blob 交给调用者按需使用和释放引用。

type/quality 在请求开始快照；浏览器不支持请求格式时可能回退 PNG，调用者以实际 Blob.type 命名。原生 null、编码、CORS SecurityError 与宿主绘制/重入错误保留；不提供 CORS 绕过。复制/编码有与实际像素数相关的 CPU/内存成本，原生已开始的编码不承诺物理停止。

## 验证

单测验证顺序/真实尺寸、选项、并发隔离、取消/迟到、宿主/scope 结束、原生异常、清理继续。浏览器解码 PNG 后与暂停的实际泛光输出逐像素比较，验证动画不前进、后续帧/resize 不改变截图、迟到结果与多实例、预览 URL 替换/清空/销毁，以及 JPEG/WebP 实际编码类型。独立 tarball 验证十一入口、无 DOM 导入及严格消费；完整浏览器/格式/色彩兼容矩阵不在本轮承诺内。

## 绘制中断补充

2026-11-13 补充绘制中断：capture 检查 app.render 的布尔结果；若 getter 解除/替换管线等导致本次绘制未调用，拒绝 Capture requires a completed draw，并在创建编码画布前解除 pending/监听。已发生的解除等业务副作用不回滚；宿主仍可重试。先保留取消和可用性检查的既有错误优先级，已取消任务不被该错误覆盖。真实浏览器以两类宿主验证无临时画布分配、未调用失效管线，以及随后原生 PNG 重试解码得到实际绿色几何体；对侧像素不变。

## 来源

- [HTML Canvas toBlob 标准](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-toblob-dev)
- [toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
- [drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage)
