# ADR-0059 三处技术界面与文档导航

- 状态：Accepted
- 日期：2026-11-22
- 需求：FR-078

## 决策

用户要求 website 与 examples、VitePress 统一为正式科技风格，使用更多 Vue Bits，并保留原回归场景。新增 SplitText、GradientText、AnimatedContent、StaggeredMenu 四种官方 registry 组件的应用适配；来源、原始哈希、修改与完整许可见 [组件记录](../../ui/vue-bits/README.md)。不引入第二套动画库或SFC编译器，不把这些组件放入SDK/独立工程。

共享技术样式采用深色、冰紫、细线网格与编号开放排版，文档保留浅色外观。动效有限；原生dialog实现分层菜单的焦点圈定、Escape、关闭和归还，减少动态效果实时回滚。入场与菜单只修改界面opacity/transform，渐变文字采用有限CSS背景位移；不动画画布或其布局祖先，不新增GPU上下文。网格/扫描线为原创CSS，不冒充第三方组件。

website保留12个原入口、原场景文件、测试选择器及回归控件。Vue只管理额外顶栏与菜单，bootstrap先选择原模块，原模块继续拥有宿主。界面清理按pagehide/HMR处理，不代替SceneApp清理。

首屏入场由Vue Bits组件独占，旧页面编排只管理文档标题和滚动分组。有限UI动效在自然GSAP结束之外设实际时长加150ms的局部结束边界，必须把真实样式推进终态；卸载、关闭及偏好变化取消该边界。不修改全局ticker、SceneApp或模型/相机时钟，冻结RAF的浏览器专项验证文字最终可读。

## 文档导航与预览故障

复现当前API页面后，HTTP的HTML引用了新app/theme脚本；文件实际在磁盘上，但旧预览进程返回404。客户端未启动，侧栏无法展开，主题按钮也无响应。新本地预览按每个GET/HEAD读取当前dist文件，不保留启动时资源索引，返回no-store；路径必须留在dist，目录映射index.html，未知脚本不回退成HTML。新增文件/内容更新/404行为有真实HTTP回归。

VitePress1.6.4仍提供路由、搜索、文章、移动抽屉和页脚。DocDirectory从原目录配置生成原生details/summary和链接，直接进入时当前组SSR展开，支持筛选；原目录树隐藏以避免重复入口。无JS时仍可展开和全文导航，当前组按路由更新。没有升级VitePress或修改安装源码。

## 验证

覆盖脚本无404、直接进入、刷新、键盘、手机、无JS目录，菜单焦点与实时动效偏好，三种宽度及TS/JS复制下载。website菜单必须列出12入口且返回核心后仅有原2个canvas。执行ready、站点、包消费和浏览器回归；截图只证明UI，不代表原生设备/性能矩阵。结果与首次失败见[Harness](../HARNESS.md)。
