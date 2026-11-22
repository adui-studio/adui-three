# ADR-0056 示例源码阅读器

- 状态：Accepted
- 日期：2026-11-22
- 需求：FR-075

## 决策

examples 的 Vite 插件使用 Expressive Code 0.44.4 和同版本行号插件，在构建时生成主题、语法颜色、行号及关键 API 标记。复用官方 expressive-code/hast 序列化入口；主浏览器入口只加载 CSS，当前示例按需加载已经转义的 HTML 与原始文本。高亮引擎及其 Shiki4 传递依赖均不进入浏览器或 SDK；VitePress 继续使用既有1.6.4及其高亮链路，不升级为新的文档框架。

源码入口先解析真实路径，仅接受 examples/src/cases 内的 TypeScript。除当前案例外，仅当案例实际引用 ../shared.ts 时加入该白名单辅助文件；辅助文件真实路径必须仍在 examples/src 内。不开启任意导入遍历，不读取包内部、业务源码、用户路径或外部 URL。原文件通过 addWatchFile 参与 HMR；复制保持原始文本，不带行号或高亮标记。

文件切换采用原生按钮和 tablist/tab/tabpanel，支持左右方向键、Home、End 和单一 Tab 入口。切换会清空旧复制反馈；异步复制沿用版本隔离。明暗主题、自动换行仅影响显示，不改原始文本。展开阅读使用原生 dialog，移动同一阅读器节点，保留文件、主题及换行选择，支持 Escape 和关闭后焦点恢复；切换案例、回到画廊及 HMR 会关闭并清理。没有第二套复制实现、额外编辑器、执行沙箱或浏览器高亮计算。

VitePress 以14px等宽字、1.8行高、边框和主题令牌统一代码区视觉；保留原有 Markdown、SSG、搜索和路由。代码展示不能冒充在线编辑运行功能。

## 依据与验证

核验 [Core API](https://expressive-code.com/reference/core-api/)、[配置](https://expressive-code.com/reference/configuration/)、[行号插件](https://expressive-code.com/plugins/line-numbers/)及安装版本公开声明。直接引擎使用默认已解析主题对象，不能照搬框架集成接受的主题名字数组。真实源码、颜色、复制、键盘、换行、明暗及模态阅读回归见 [Harness](../HARNESS.md)。
