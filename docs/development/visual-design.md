# 界面设计与品牌

## 设计方向

FR-078重新统一三处技术界面：深色为默认，文档保留浅色；使用SplitText、GradientText、AnimatedContent、StaggeredMenu四种Vue Bits适配，编号列表与开放特性行替代卡片堆叠。website新增共享顶栏/分层目录，保留12回归场景及所有原生控件。文档改用可筛选原生目录，SSR展开当前组；预览每请求读取当前构建，修正旧进程对新脚本404造成的交互失效。详见[ADR-0059](../adr/0059-tech-interface-navigation.md)。

产品名 ADui Three，包名保持 @adui/three。品牌标志直接使用用户提供的 [Brand Kit](../public/brand/README.md)，紫色 #5B2B82 是浅色主要强调色，荧光绿 #6CFF00 用于深色图形的小面积定位点。深色文档中的原始横向标志置于白色底托，不重绘、变形或反色。

FR-077 按用户要求引入 [Vue Bits](https://github.com/DavidHDev/vue-bits) SpotlightCard。采用大字阶、细边框、充足留白、深色几何展示与浅色阅读面；卡片光斑提供轻微交互反馈，正文与代码区保持稳定。主页示意为原创静态 SVG，不作为真实运行截图，也不增加 GPU canvas。

使用本地 ui-ux-pro-max、web-design-guidelines 与 vitepress Skills。本环境 python/python3/py 不可用，未执行或声称生成设计系统；直接核对本地样式数据的 Minimalism & Swiss Style、Micro-interactions 条目，以品牌色和网站任务作取舍。保留既有系统字体、Vue3.5.45和VitePress1.6.4；未采用技能基于2.0 alpha的新增接口。

## 页面结构

| 页面           | 结构                                                       | 主要交互                                                        |
| -------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| examples 目录  | 深色场景示意首屏、分类/搜索、两列编号式索引，手机单列      | q/category 保留在 URL，刷新恢复，空状态清除；卡片保留原生链接   |
| examples 场景  | 横向主题导航、独立画布、右侧控制、下方完整源码             | 原渲染器、暂停/单帧/销毁/重建及主题控件；手机控制区接在画布下方 |
| VitePress 首页 | 品牌首屏、几何示意、模块统计、三条起步路径、能力卡片与代码 | 保留明暗切换、搜索、指南/API/运行示例入口                       |
| VitePress 正文 | 文档眉题、分组侧栏、居中阅读列、目录与原生代码组           | 原路由、本地搜索、JS/TS 标签、复制与静态 HTML                   |
| website 工作台 | 共享技术顶栏、编号导航与分层菜单                           | 保留双实例、原生控件和全部12验证场景                            |

## 组件与动效

Vue Bits 适配位于 [ui/vue-bits](../../ui/vue-bits/README.md)。官方 registry 源码、完整许可和修改说明已核验；当前会话没有 shadcn MCP，因此使用官方支持的手动接入。组件用于网站，不进入 SDK、recipes 或下载的完整工程。

SpotlightCard 将光斑渐变、falloff 和边缘遮罩适配为现有 TypeScript render 组件，只在指针/焦点变化时合并绘制，结束后不保留空转 RAF。减少动态效果实时变为居中静态光斑；键盘同样可见。离屏、隐藏和卸载停止任务，事件由作用域 AbortController 清理。

GSAP3.15.1 继续负责有限时长入场与 ScrollTrigger 一次显现，不动画画布及其布局祖先，不增加自动循环装饰。按路由、HMR、页面卸载回收，实时响应减少动态效果。共享基础令牌、原创 SVG 和 Vue Bits 均只供应用使用。

首页仍由 HomePage 通过默认主题插槽渲染；服务端不访问 window/document，不导入 SDK，站内链接经 withBase。组件的指针/observer代码仅在 onMounted 运行，静态页面默认可读。文档眉题使用 doc-before 插槽，未替换搜索或路由。

## 源码阅读与复制

FR-076 的九主题源码为独立公开 API 用法，TS/JS、HTML和依赖齐全，18份 ZIP附当前 SDK及必要模型；不会把站点 Vue Bits 组件混进使用示例。主包尚未发布 npm，下载说明保留安装前提。

FR-075 的 Expressive Code 只在构建时生成高亮、行号和关键 API 标记；浏览器不载入引擎。明暗/换行、文件键盘、原文复制、原生 dialog Escape与焦点恢复继续适用，源码加载不依赖 GPU 创建成功。VitePress 保留原生高亮链路，调整字阶、边框与代码组。

## 界面审查

按 [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)审查语义、焦点、原生链接、输入标签、读屏反馈、44px操作目标、动态偏好、明暗表面、长内容和375/768/1440px布局。搜索的 focus-visible 由带可见外框的 focus-within 容器承接；不靠纯色表达运行状态。

截图与站点测试只作为 UI 证据，GPU/资源生命周期和实际设备范围仍见 [Harness](../HARNESS.md)；设计边界见 [ADR-0058](../adr/0058-vue-bits-site-design.md)。
