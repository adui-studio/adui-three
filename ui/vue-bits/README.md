# Vue Bits 应用组件

[Vue Bits](https://github.com/DavidHDev/vue-bits) 由 David Haz 维护，采用 [MIT + Commons Clause](LICENSE.md)。仅用于本仓库的 examples、website 与 VitePress 网站，不进入 `@adui/three` SDK、独立用法示例或可下载工程。

## 来源与改动

2026-11-22 从[官方 SpotlightCard registry](https://vue-bits.dev/r/SpotlightCard.json)核验并取得组件，原始 `SpotlightCard.vue` UTF-8 内容 SHA256 为 `6f0535eceda0b04e1d5cfba2f7b5b6cf8afc8c3372a6216b5dbb4e044757f20b`；当日上游 main 为 `2c2abc6e78f3e98df22e62e99e04d1be8cbdcb16`。registry 独立于 Git 分发，不把该 SHA 当成两者一致性的证明。

`SpotlightCard.ts` 将原组件的柔和光斑 falloff、径向渐变、边缘遮罩和 Vue 生命周期适配为本项目现有的 TypeScript render 组件；样式拆为 `spotlight-card.css`。保留品牌色与原生链接，移除本网站不用的 ambient、grain、flare、邻近卡片追踪和连续平滑循环。指针事件只在卡片内触发，每帧合并更新，离开视口、页面隐藏和卸载时停止；减少动态效果时使用静止光斑，键盘焦点同样可见。文档的服务端 HTML 始终可读。

这是网站的具体集成，不作为通用组件库、模板或 SDK 对外提供。保留上游完整许可；当前会话无 shadcn MCP 工具，采用官方支持的手动 registry 接入，不修改用户的全局 MCP 配置。

## FR-078 标题、菜单与内容动效

新增 SplitText、GradientText、AnimatedContent、StaggeredMenu 四种官网组件的应用适配，2026-11-22 从同名官方 registry 取得并核验。均使用当前 Vue/GSAP，不新增动画依赖；使用确定性 SSR 标记、有限动效和原生 dialog 焦点/取消处理，移除本网站不用的循环、复杂噪点和商业站点分支。所有组件仅用于三处网站，不进入 SDK 或下载工程。

原始 SFC 内容的 UTF-8 SHA256：

| 组件                                                           | SHA256                                                           | 应用适配                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| [SplitText](https://vue-bits.dev/r/SplitText.json)             | bd33e7ff5f1a4efe9557713dfbe9d7077cb837695da14dec366473d19ad1a4fc | rise/stagger 转为 SSR 分字节点；减少动态效果回滚      |
| [GradientText](https://vue-bits.dev/r/GradientText.json)       | 14634425224d7dab5a0bb07eb2ca203229bd6ac962724bac870118f947a1f5d3 | 重复调色板保留，改为有限 CSS sweep                    |
| [AnimatedContent](https://vue-bits.dev/r/AnimatedContent.json) | ad925c27d8ced43cb43201e0cf324866ea9ae05185d028d77d7cde42f64e3659 | 一次显现；移除 scrub/消失与滤镜分支                   |
| [StaggeredMenu](https://vue-bits.dev/r/StaggeredMenu.json)     | 0614f705967900c2be11beb82012c8e18469ad899dc484dc74f07873bd122f6e | 保留分层/标签错峰，改为原生 dialog、Escape 与焦点归还 |

细线网格和扫描线为原创 CSS，仅作有限时长装饰；不冒充 Vue Bits GridScan，也不创建额外 GPU 上下文。菜单与场景时钟独立，清理时不触及 SceneApp。
