# ADR-0047 包结构、正式示例与 VitePress

- 状态：Accepted
- 日期：2026-11-18
- 关联需求：FR-063、NFR-001、NFR-002
- 替代关系：扩展ADR-0002的内部目录和工程文档组织，不改变公开入口

## 决策

SDK的17个公开入口保留src根级路径，内部实现按core/camera/geometry/loaders/animation/controls/navigation/textures/shared分组。类型、相对导入和单测同步，不新增深层exports，不改Three.js/BVH版本或运行时契约。

正式示例在examples私有工作区，按主题导出mount(context)，只消费公开包名。8个主题为场景、模型动画、相机、复杂DOM标签、点云流光、阴影环境、角色导航及实例。画廊提供按需加载、源码查看、启停/销毁重建，以请求版本隔离迟到模块。apps/website保留回归playground，既有入口不删除。

原创模型/图片/环境及许可记录集中到fixtures，生成脚本和单测引用同步；两个Vite应用通过publicDir保留相同浏览器资产路径。fixtures不进入SDK分发。

## 正式文档

根README是仓库入口，包README是可分发最小用法。原API契约迁入docs/api的17个主题，引用同步，保留生命周期边界。指南在docs/guide，示例说明在docs/examples并包含真实源码，开发入口在docs/development；现有需求、SDD、上下文和ADR继续为规范来源。

apps/docs使用稳定VitePress1.6.4，内容源为docs，包含全部ADR与本地搜索。关闭Markdown原始HTML，避免泛型被当作Vue组件。源码链接转GitHub，文档链接保持站内；保留死链检查。

## 构建

VitePress的Vite5.4.21通过父依赖override隔离，SDK与示例继续Vite+。仅允许所需精确esbuild0.21.5的安装校验脚本。

docs在examples构建后执行；prepare-docs检查绝对目标和生成标记，只替换docs/public/play，将Vite产物嵌入/play/。不改写源examples/fixtures，生成目录忽略提交，SSR不执行SDK。文档开发中的示例是构建快照，示例HMR用独立dev。

根dev指向正式示例，dev:playground保留旧消费者，docs:dev/build/preview为文档命令。无部署域名、npm发布或CI变更。

## 验证

结构变化运行SDK单测、真实tarball/严格类型消费和既有浏览器回归。站点检查覆盖导航、搜索、源码、8个示例、标签交互和切换重建。文档检查覆盖新目录与源码包含的坏引用。结果见Harness，不以静态构建替代GPU验收。

- [VitePress 1.6](https://vuejs.github.io/vitepress/v1/guide/getting-started)
- [源码包含](https://vuejs.github.io/vitepress/v1/guide/markdown)
- [pnpm覆盖](https://pnpm.io/settings#overrides)
