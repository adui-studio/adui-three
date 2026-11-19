# 截图

captureFrame 同时支持 WebGL / WebGPU，包括区域裁剪、编码取消及独立画布释放。WebGL 额外检查 context loss；节点渲染器依赖宿主设备丢失状态，不调用 WebGL getContext。截图在绘制提交后同任务复制画布，原生设备支持仍需实际浏览器验收。

## 截图

本次单次绘制若被中断并返回 false，截图会拒绝且不创建编码画布，避免导出旧缓冲；解除失效管线等操作后可以重试。自定义管线需同步输出到画布。

```ts
import { captureFrame } from "@adui/three/capture";

const controller = new AbortController();
const image = await captureFrame(app, { type: "image/png", signal: controller.signal });
// 返回 Blob；按 image.type 决定文件后缀。Blob URL 和下载由应用自己管理。
```

type 默认 image/png，可选 image/jpeg / image/webp；quality 可选有限 [0,1]，由浏览器对有损格式解释，未指定时沿用浏览器默认值。若格式不支持可能回退 PNG，以实际 Blob.type 为准。原生编码失败/null、CORS SecurityError 和宿主绘制错误正常拒绝。

先 app.render，再在同一任务将当前实际 drawing buffer 复制到独立 Canvas 2D 后编码；不推进动画、改变宿主启停、相机或渲染配置，不需要 preserveDrawingBuffer。后续帧/resize 不改变已截取的像素；包含当前管线输出，不含 DOM 标签、CSS 背景和其他界面。输出是普通浏览器图像，默认 2D 色彩处理，不是原始 HDR、任意分辨率或 DOM 合成服务。

隐藏、零尺寸、上下文不可用或当前 render target 非默认时拒绝；自定义管线须确实输出画布。不要从宿主更新/绘制/完成阶段调用，单次绘制重入会拒绝。signal、宿主或 app.resources 结束立即逻辑取消，原生编码可能继续，迟到结果丢弃。任务拥有临时画布并清监听/登记、归零尺寸；Blob 交给应用后自行管理引用或 URL。截图有与像素数相关的 CPU/内存成本，没有后台计时器或第二循环。

### 导出局部画面

```ts
import { captureFrame } from "@adui/three/capture";
import type { CaptureRegion } from "@adui/three/capture";

const canvas = app.renderer.domElement;
const region: CaptureRegion = {
  x: 0,
  y: 0,
  width: Math.max(1, Math.floor(canvas.width / 2)),
  height: Math.max(1, Math.floor(canvas.height / 2)),
};
const cropped = await captureFrame(app, { region });
```

region 使用实际 drawing-buffer 像素，原点在画布左上角；x/y 必须是非负安全整数，宽高为正安全整数，不自动转换 CSS/DPR、缩放或裁去越界部分。省略时截取完整画布。区域数值在调用时复制，范围在本次 render 完成后按实际画布检查；越界 RangeError 发生在临时画布分配之前，但本次绘制可能已发生。输出宽高就是区域宽高；其余格式、取消、并发隔离和清理规则与完整截图一致。演示“截图范围”可选完整画面或中心区域。
