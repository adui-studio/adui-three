# 网站 UI 组件选型

FR-079明确：优先检索和核对Vue Bits；有对应组件就复用，确认没有满足当前语义的组件后才补项目实现。范围是examples、website和VitePress，SDK接口、场景实现和可复制的独立工程不依赖网站UI。

## 来源与采用范围

2026-11-23通过项目shadcn MCP读取`@vue-bits`完整目录218项，检查候选控件的描述和依赖，并从同一官方registry取得15份源码。模糊搜索不等于功能匹配，例如CodeSlots是验证码输入，不是源码编辑器。SHA256和修改说明见[组件记录](../../ui/vue-bits/README.md)及[来源清单](../../ui/vue-bits/control-sources.json)。

“适配”不是未经修改的官方SFC：Vue界面使用render组件；原回归控制器持有的节点使用应用适配，保留节点、value、disabled、事件和焦点。交互与视觉子集明确区分，不以增加标志或类名作为完整组件接入的证据。

| 页面元素                  | Vue Bits 来源                            | 本项目采用范围                                                                  |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| 标题、渐变、内容入场      | SplitText、GradientText、AnimatedContent | 既有有限动效，SSR可读与实时减少动态效果                                         |
| 总导航和场景目录浮层      | StaggeredMenu                            | 分层错峰；原生dialog焦点圈定与Escape                                            |
| 文档目录                  | BranchedMenu                             | 原trunk/branch/reach路径公式；原生details和链接、SSR当前组                      |
| 场景/渲染器/参数选择      | GlideSelect                              | 弹出、滑动高亮、滚动、禁用、键盘/typeahead；原select提供数值和change接口        |
| 分类、示例、源码语言/文件 | RubberSegment                            | 两条边错峰交接与活动填充；GSAP替代motion-v，保留按钮/链接和ARIA；不提供拖动换项 |
| 场景/路径/相机时间轴      | WakeSlider                               | 归一化/平滑波峰与分段填充；原range提供真实键盘/触摸；无常驻循环                 |
| 操作按钮、主要CTA         | StarBorder                               | 有限hover/focus轮廓光迹和track；CSS offset-path替代逐按钮Canvas                 |
| 切换按钮、主题开关        | SquishSwitch                             | track/thumb颜色、位移和按压形变；由原ARIA状态控制；不提供拖动开关               |
| 复选/单选                 | SpringCheck、JellyRadio                  | 原生勾选/键盘和有限弹性反馈；保留原change                                       |
| 标题说明                  | WarmTooltip                              | cold延迟/warm窗口、定位、焦点、Escape和清理；纯文本title                        |
| 操作反馈                  | StatusMark                               | 原CHECK/CROSS路径、虚线ring和有限运行反馈；文字不变，不伪造进度                 |
| 普通和数字输入            | PromptBar、ScrubField                    | 输入外壳/焦点与原生数值原语，属于视觉子集；不引入AI消息、附件、语音或拖动改值   |
| 控制面、侧栏、工具栏      | GlassSurface                             | 静态fallback光边与表面，关闭实时画布旁的大面积backdrop blur；不启用折射支路     |
| 页内入口、侧栏链接        | FlowingMenu                              | 链接内的有限hover/focus色带；不循环复制文本或替换URL                            |
| 设备负载                  | SloshGauge                               | 液面改为水平只读进度；原progress保留max/value和名称，无惯性假数值               |
| 特性、示例条目            | SpotlightCard                            | 既有聚光/键盘和原生链接，开放编号布局保持                                       |

## 已确认的缺口

| 保留的项目实现                             | 核对结果与理由                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 源码高亮、文件、复制与TS/JS工程下载        | CodeSlots是OTP输入；完整目录没有满足代码高亮、真实文件/语言和归档协议的阅读器。保留Expressive Code，外层通用控件仍统一 |
| 源码阅读dialog与文档搜索                   | 没有对应的通用源码模态阅读器或文档搜索；StaggeredMenu是导航菜单，不能把源码/搜索结果伪装成菜单项                       |
| VitePress文章、目录数据、本地搜索与SSR路由 | 属于文档引擎与内容协议，Vue Bits补界面                                                                                 |
| GPU统计和诊断数据表                        | 没有对应的真实GPU计数表；保留数据/单位和后端边界，不以动画计数伪造统计                                                 |
| SDK画布及12个回归场景                      | ModelViewer不是本SDK生命周期/回退/双实例回归宿主；保留真实SDK场景，界面独立接入                                        |
| 原品牌SVG、场景示意和页面网格布局          | 用户品牌资产与项目内容，不是通用交互控件                                                                               |
| 文件/颜色等浏览器专用输入（若出现）        | 完整目录没有等价浏览器原语；保留原生协议，不冒充GlideSelect                                                            |

## 维护与验证

标题与简单显现最终采用原生有限CSS（650ms、分字25ms错峰），基态可读；复杂交互继续使用已有GSAP。源码分段项的前景和填充分别按阅读器明暗主题设置，滑动过程中也保留对比度。WarmTooltip将仅依赖title命名的图标按钮转存为aria-label，关闭时只移除自身描述ID，保留外部属性变化。

新增控件先查MCP清单、描述、依赖和实际源码，扩展本表或记录具体语义缺口。真实指针/键盘操作选择器，不只调用selectOption；检查滑块原值和bar填充，切换/重建不能重复挂载或残留浮层。原源码、ZIP、双后端与生命周期门禁继续执行。

配置在项目`.codex/config.toml`和`components.json`。shadcn4.23.0的MCP初始化、registry、搜索、完整清单和13次view成功；view只返回摘要/依赖，源码由同一官方registry补取并哈希记录。npx曾被项目pnpm devEngines拒绝，启动改为`pnpm dlx shadcn@4.23.0 mcp`；不表示当前聊天工具清单已热加载，不修改全局MCP配置。
