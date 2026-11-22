# Vue Bits 应用组件

[Vue Bits](https://github.com/DavidHDev/vue-bits) 由 David Haz 维护，采用 [MIT + Commons Clause](LICENSE.md)。仅用于本仓库的 examples 与 VitePress 网站，不进入 `@adui/three` SDK、独立用法示例或可下载工程。

## 来源与改动

2026-11-22 从[官方 SpotlightCard registry](https://vue-bits.dev/r/SpotlightCard.json)核验并取得组件，原始 `SpotlightCard.vue` UTF-8 内容 SHA256 为 `6f0535eceda0b04e1d5cfba2f7b5b6cf8afc8c3372a6216b5dbb4e044757f20b`；当日上游 main 为 `2c2abc6e78f3e98df22e62e99e04d1be8cbdcb16`。registry 独立于 Git 分发，不把该 SHA 当成两者一致性的证明。

`SpotlightCard.ts` 将原组件的柔和光斑 falloff、径向渐变、边缘遮罩和 Vue 生命周期适配为本项目现有的 TypeScript render 组件；样式拆为 `spotlight-card.css`。保留品牌色与原生链接，移除本网站不用的 ambient、grain、flare、邻近卡片追踪和连续平滑循环。指针事件只在卡片内触发，每帧合并更新，离开视口、页面隐藏和卸载时停止；减少动态效果时使用静止光斑，键盘焦点同样可见。文档的服务端 HTML 始终可读。

这是网站的具体集成，不作为通用组件库、模板或 SDK 对外提供。保留上游完整许可；当前会话无 shadcn MCP 工具，采用官方支持的手动 registry 接入，不修改用户的全局 MCP 配置。
