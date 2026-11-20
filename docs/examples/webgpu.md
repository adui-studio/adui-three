# 渲染器与输出

所有主题均可通过工具栏选择渲染器，本主题额外演示泛光、描边、环境和截图。运行 `pnpm run dev`，在画廊选择 WebGPU，或访问 /play/?example=webgpu。通过主入口 ThreeApp.create 的 renderer.type:webgpu 配置创建；初始化默认允许原生回退，页面显示真实后端；模型、动画、控件、拾取、泛光、描边、波纹、实时阴影、Room 环境和截图沿用同一套公开模块。切换或重建会取消尚未完成的初始化并结束旧宿主。

节点扩展已实现并补做 NVIDIA Ampere 原生浏览器专项；回退和原生结果分开记录，不代表完整设备矩阵。效果与限制见 [API](../api/webgpu.md)。

## 示例源码

点击“使用正交相机”，或访问 `/play/?example=webgpu&projection=orthographic&renderer=webgpu`，使用 OrthographicThreeApp.create 重建同一套场景。正交使用 fitOrthographicObject，透视继续 fitObject；渲染器、组合效果和截图的公开接口保持一致。本次正交的原生设备范围以 Harness 为准。

<<< ../../examples/src/cases/webgpu.ts
