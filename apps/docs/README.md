# VitePress 文档站

## 运行

在仓库根目录运行 `pnpm run docs:dev`、`pnpm run docs:build` 或 `pnpm run docs:preview`。开发端口5174，构建预览端口4174。

## 内容来源

- 正式内容唯一来源为 [docs](../../docs/index.md)，使用指南、API、示例说明和开发记录在同一站点呈现。
- [配置](.vitepress/config.ts)和[主题](.vitepress/theme/index.ts)位于本包。
- 正式 examples 构建由 [prepare-docs.mjs](../../scripts/prepare-docs.mjs)复制到忽略的 ../../docs/public/play；不会提交生成文件或复制 SDK 实现。
- 稳定 VitePress1.6.4所需的Vite5.4.21单独锁定，SDK/示例继续使用现有Vite+工具链。仅允许精确esbuild0.21.5安装脚本。

开发文档站中的示例使用启动时的构建快照；需要示例源码HMR时单独运行 `pnpm run dev`。没有配置发布目标或CI。
