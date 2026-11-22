# 界面设计与品牌

## 设计方向

产品名使用 ADui Three，包名保持 `@adui/three`。品牌标志直接使用用户提供的 [Brand Kit](../public/brand/README.md)，紫色 `#5B2B82` 是浅色界面的主要强调色，荧光绿 `#6CFF00` 用于深色图形中的小面积定位点。原始横向标志在深色界面置于白色底托，不变形、重绘或全图反色。

这轮使用本地安装的 ui-ux-pro-max、web-design-guidelines 与 vitepress Skills。设计检索匹配 Minimalism & Swiss Style：网格、留白、明确层级与原生控件。推荐配色是参考，实际主题遵循用户 Brand Kit；Vue 专项检索两次无匹配，因此采用通用无障碍规则与 VitePress 官方接口。vitepress Skill 以 2.0 alpha 为基准，本项目仍使用 1.6.4，仅采用经当前版本核实的 CSS 变量、默认主题插槽与 SSR 扩展方式。

## 三处页面

| 界面      | 视觉与结构                                                     | 交互                                                       |
| --------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| VitePress | 暖白阅读面、品牌首页、深色场景结构图、原生代码区；支持明暗主题 | 保留本地搜索、侧栏、目录、源码链接和静态 HTML              |
| examples  | 几何主题预览、三列目录；运行页采用深色画布和独立控制面板       | 保留渲染器选择、URL/历史、源码、暂停/销毁/重建与初始化取消 |
| website   | 深色 Studio、桌面侧栏、当前场景指示和可见设备诊断              | 保留 12 个验证场景；窄屏改为顶部选择器，不遮挡场景         |

主题预览是原创静态 SVG 几何示意，不冒充实际运行截图。示意图无网络请求、无额外 WebGL 上下文、无自动循环。画布仍显示真实 SDK 场景。

## 维护边界

FR-076 在阅读器增加明确的TypeScript/JavaScript选择、入口/HTML/依赖文件和完整工程下载，保留键盘与模态阅读。代码为独立用法，主包未发布npm的安装前提在下载说明中明确；模型资源随工程提供，原画廊仍负责完整交互演示。

源码阅读器（FR-075）采用独立深色代码工作区，提供明暗切换；14px系统等宽字、1.8行高、原生行号和关键 API 标记。文件标签区与工具区分层，展示真实案例及白名单辅助文件，复制取原文。自动换行和展开阅读均有明确按钮，原生 dialog 支持 Escape 与焦点恢复，窄屏工具栏允许换行。VitePress 保留原生高亮并同步字体、行高和边框。设计决策见[ADR-0056](../adr/0056-example-source-reader.md)。

共享基础令牌和静态几何位于 `ui/tokens.css` 与 `ui/graphics.ts`，只供应用使用，SDK 不依赖它们。各应用保留自己的布局样式。默认字体使用系统字体，不增加外部字体请求；文档主题使用 `vitepress/theme-without-fonts`，避免预加载未使用的 Inter。

文档首页在 `apps/docs/.vitepress/theme/HomePage.ts`，通过默认主题 `home-hero-before` 插槽渲染；组件只生成确定性的 HTML/SVG，不导入浏览器 SDK、不访问 window/document，保持 SSG 和 hydration 一致。站内链接使用 withBase。未升级 VitePress，也未替换文档路由和搜索实现。

## 界面审查

按 [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md) 检查本轮修改：语义链接/按钮、装饰 SVG 隐藏、异步状态可见、输入带标签、键盘跳转入口与焦点、44px 场景操作目标、减少动态效果、长内容换行、原生 select 明暗配色、375/768/1440px 布局。Ctrl/Cmd 点击示例保留浏览器打开新页语义。

原生图形配色不随外壳更改；浏览器和设备兼容范围仍见 [Harness](../HARNESS.md)。布局检查与截图不能代替渲染效果和资源生命周期测试。

## GSAP 与源码阅读

2026-11-20 FR-070 使用 GSAP3.15.1：首屏采用有限时长错峰入场，卡片/下方内容采用 ScrollTrigger 一次显现，不劫持滚动、不设置循环浮动。只修改 UI 的 opacity/transform，不移动画布及其布局祖先。作用域 matchMedia 自动回滚偏好变化，切页、HMR 和卸载归还内联样式。文档入口通过 MotionLayout 在客户端动态导入，静态 HTML 默认可读。

源码区采用 Shiki2.5.0 的 github-dark-default 主题、文件名、TypeScript 标记和 CSS 行号；构建阶段处理真实文件，浏览器不载入 Shiki/WASM。复制写入原代码，反馈支持读屏；权限失败显示手动复制路径，切换主题后不会显示旧操作反馈。根 GSAP 与示例开发依赖通过 catalog 固定，不升级原文档站或 SDK 依赖。
