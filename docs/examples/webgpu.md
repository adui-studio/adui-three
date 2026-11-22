# 渲染器与输出

所有主题均可通过工具栏选择渲染器，本主题额外演示泛光、描边、环境和截图。运行 `pnpm run dev`，在画廊选择 WebGPU，或访问 /play/?example=webgpu。通过主入口 ThreeApp.create 的 renderer.type:webgpu 配置创建；初始化默认允许原生回退，页面显示真实后端；模型、动画、控件、拾取、泛光、描边、波纹、实时阴影、Room 环境和截图沿用同一套公开模块。切换或重建会取消尚未完成的初始化并结束旧宿主。

节点扩展已实现并补做 NVIDIA Ampere 原生浏览器专项；回退和原生结果分开记录，不代表完整设备矩阵。效果与限制见 [API](../api/webgpu.md)。

## 独立用法

以下代码为面向使用者编写的完整用法，不依赖画廊的 shared.ts 或 ExampleContext。画廊保留更多交互，下面聚焦本主题的最小完整接入。

源文件：[TypeScript](../../examples/recipes/webgpu.ts) · [JavaScript](../../examples/recipes/webgpu.js)。

主包尚未发布 npm：在运行页源码区下载 TypeScript 或 JavaScript 完整工程，已包含本地 SDK 包与所需资源。解压后运行 `pnpm install`、`pnpm run dev`。已安装当前 SDK 和 three@0.187.0 的 Vite 项目可直接复制入口和对应 HTML。

::: code-group

<<< ../../examples/recipes/webgpu.ts [TypeScript]

<<< ../../examples/recipes/webgpu.js [JavaScript]

:::

## HTML 容器与入口

保存为 index.html，与 main.ts 或 main.js 放在同一目录。

::: code-group

<<< ../../examples/recipes/index-ts.html [TypeScript 入口]

<<< ../../examples/recipes/index-js.html [JavaScript 入口]

:::
