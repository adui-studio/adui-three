# 文档示例截图

native-webgpu.jpg 来自本项目 [点云与流光示例](../../../examples/src/cases/effects.ts) 的实际浏览器画面。2026-11-19 在连接的 Chrome / NVIDIA Ampere 上使用严格 WebGPU 模式捕获，页面显示 WebGPURenderer / WebGPU。

画面由项目代码和原生几何生成，不含业务模型、私有资产或个人浏览器内容。截图是说明性图像，动画相位与设备图像差异不作为逐像素基准。复现入口为 /play/?example=effects&renderer=webgpu-strict。

## 新版正式示例

[examples-effects.png](examples-effects.png) 来自 FR-069 重设计后点云与流光页面的实际 Playwright 画面，使用用户 Brand Kit、深色舞台与独立场景控制面板。2026-11-19 在本地 Chromium/SwiftShader 上通过 WebGL 渲染并捕获；它用于界面展示，不标记为原生 WebGPU 证据。原 native-webgpu.jpg 保留为重设计之前的原生验收历史图，不代表当前外壳。
