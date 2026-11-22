# ADR-0058 Vue Bits 示例与文档网站设计

- 状态：Accepted
- 日期：2026-11-22
- 需求：FR-077

## 决策

用户要求使用 [Vue Bits](https://github.com/DavidHDev/vue-bits) 重新设计 examples 与 VitePress。核验官方 registry、MCP 接入与许可；会话没有 shadcn MCP 工具，因此采用官方支持的手动组件源码接入，不修改用户全局 MCP。组件源码和许可已核验后再适配，详见 [来源记录](../../ui/vue-bits/README.md)。

SpotlightCard 使用现有 Vue3.5.45 的 TypeScript render 形式，避免为了单一组件新增 SFC 编译工具或第二套动画依赖。保留上游 falloff、渐变与边缘遮罩，移除不用的连续漂移、噪点和按压分支。卡片内指针事件按 RAF 合并，隐藏/离屏/卸载停止；原生链接与键盘焦点可用，减少动态效果实时改为居中光斑。有限 GSAP 页面入场仍使用原有作用域清理，不动画画布或其布局祖先。

目录由独立 Gallery 管理搜索和分类，URL 的 q/category 可刷新恢复，空结果提供清除入口；SceneApp、异步 source、渲染器选择与原案例均保持既有所有权。场景详情增加横向主题导航，375px 单列画布与控制区。TS/JS 文件、原文复制、dialog 与18份工程继续独立交付。

VitePress1.6.4 保留默认主题、本地搜索和 Markdown 路由。首页和文档眉题使用已有插槽，输出确定性 HTML/SVG；关闭 JS 仍能读首页卡片与指南。明暗主题沿用品牌令牌；原始标志不重绘、变形或反色。原创 torus 示意不引入额外 GPU canvas、网络字体或后台循环。

## 边界与验证

Vue Bits 为 MIT + Commons Clause，许可与来源随网站源码保留；只集成于本仓库网站，不作为可复制 UI 模板、组件包或 SDK 分发。SDK 和独立工程不带该组件，也不增加 Vue/GSAP 运行时依赖。examples 与 docs 显式声明既有 Vue 版本，锁文件不升级依赖。

验证覆盖 URL/空状态、光斑与动态偏好、键盘、无 JS 文档、明暗主题和375/768/1440px布局，并保留原站点、下载、包消费与浏览器回归。布局/截图不是 GPU 性能或原生设备矩阵；真实结果见 [Harness](../HARNESS.md)。

接口依据：[Vue 编译标志](https://vuejs.org/api/compile-time-flags.html)与[VitePress1.6.4主题扩展](https://vuejs.github.io/vitepress/v1/guide/extending-default-theme)。examples 显式 define 三个标志，不引入 SFC 编译器；文档继续使用该版本公开的主题插槽。
