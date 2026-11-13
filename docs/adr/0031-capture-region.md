# ADR-0031 画布区域截图

- 状态：Accepted
- 日期：2026-11-13
- 关联需求：FR-043
- 替代关系：扩展 ADR-0021 的复制范围，沿用任务和编码生命周期

## 决策

capture 入口增加 CaptureRegion 类型，CaptureFrameOptions.region 可选；省略时保留完整 drawing buffer 截图。region 的 x/y 从画布左上角起算，单位为实际 drawing-buffer 像素，不是 CSS 像素或 WebGL readPixels 的左下角坐标。x/y 为非负安全整数，width/height 为正安全整数；输出恰为区域宽高，不重采样、不隐式裁边，也不调整相机、renderer、管线、DPR 或宿主时间。

先读取四个数值到私有快照，非法数值在绘制和分配前拒绝。app.render 可完成待同步尺寸，因此范围在该次绘制之后、分配临时画布之前校验；区域须完全包含在最终画布内。绘制使区域越界则 RangeError，保留本次已发生的绘制副作用，不分配编码画布。采用减法比较边界，避免大整数加法溢出。右/下边缘恰好贴边可用。

## 复制和生命周期

使用原生 Canvas 2D 九参数 drawImage，源矩形复制到等尺寸临时画布的原点；完整截图保留原三参数路径。复制和绘制仍处于同一同步任务，没有第二次绘制或 RAF，不包含 DOM 标签。后续画布 resize、选项修改或绘制不改变已复制像素。

沿用截图 pending 所有权、signal、逻辑取消、编码错误/MIME 回退与两维归零清理。每个并发任务独立拥有临时画布；区域任务取消不影响另一任务。原生编码已开始后不能承诺物理停止。Canvas/CORS 限制保持，未加入任意尺寸渲染、缩略图缩放或跨域绕过。

## 演示与验证

演示消费者提供完整画面和中心区域选择；中心区域宽高各取原画布约一半，原尺寸奇数时向下取整且至少一像素，选择值只影响下一次请求。库不选择业务裁剪策略。

五项新增单测覆盖实际复制坐标/快照、非法数值和形状、边界/贴边与所有权、绘制期间尺寸变化/重试、并发取消。浏览器比较原生 PNG 解码后的局部像素与真实后处理输出，验证暂停动画、另一宿主、在途编码遇 resize/选择变化；完整截图、其他编码和清理回归保持。包消费检查公开类型与既有入口，格式/浏览器/硬件矩阵不由这些场景外推。

## 来源

- [HTML Canvas drawImage 标准](https://html.spec.whatwg.org/multipage/canvas.html#dom-context-2d-drawimage)
- [HTML Canvas toBlob 标准](https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-toblob-dev)
