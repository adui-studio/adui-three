# WebGPU 与统一扩展

运行 `pnpm run dev`，在画廊选择 WebGPU，或访问 /play/?example=webgpu。通过主入口 ThreeApp.create 的 renderer.type:webgpu 配置创建；初始化默认允许原生回退，页面显示真实后端；模型、动画、控件、拾取、泛光、描边、波纹、实时阴影、Room 环境和截图沿用同一套公开模块。切换或重建会取消尚未完成的初始化并结束旧宿主。

节点扩展已实现，WebGPU 原生路径需在有适配器的设备验收；回退成功不能视为 WebGPU GPU 验证。效果与限制见 [API](../api/webgpu.md)。

## 示例源码

<<< ../../examples/src/cases/webgpu.ts
