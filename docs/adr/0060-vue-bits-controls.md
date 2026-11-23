# ADR-0060 Vue Bits 优先的网站控件

- 状态：Accepted
- 日期：2026-11-23
- 需求：FR-079

## 决策

用户要求所有UI优先采用Vue Bits，没有对应组件才自写。核验项目MCP的218项清单和官方源码，不以模糊命中代替功能匹配；组件映射、视觉/交互子集和语义缺口维护于[选型清单](../development/ui-components.md)。保留许可和文件哈希，不将应用适配称为未经修改的官方SFC。

website和examples的控制器持有原生DOM、事件和数值，应用适配借用而不替换这些节点。GlideSelect通过浮层和滑动高亮提交原select的input/change；WakeSlider保留原range键盘/触摸入口；RubberSegment保留按钮/链接与ARIA。浮层、观察器、监听和有限动效由挂载作用域拥有，不进入SDK，不引入motion-v等新运行依赖。

BranchedMenu复用trunk/branch/reach公式，以details和链接提供SSR/无JS导航。其他视觉子集有明确范围：StarBorder以CSS轮廓光迹避免逐按钮Canvas，GlassSurface采用fallback表面，输入保留浏览器原语；不声称包含上游所有分支。桥接器发现动态控件并按节点去重，移除或卸载时释放，不接管宿主/模型生命周期。

## 缺口与验证

简单标题和内容显现改为同一视觉签名的原生有限CSS：650ms、分字25ms错峰，基态始终可读；prefers-reduced-motion直接移除动效。GSAP仍用于交互时间线，旧滚动入口加IO与局部终态边界。终态保护暂停/推进/kill具体UI动画，隐藏/离开结束；不变更全局ticker。GlassSurface只采用静态fallback，实时画布旁不启用大面积backdrop blur。来源适配说明随最终实现更新，不把这些优化当成已确认的底层调度根因。

源码阅读、SSG/搜索、GPU统计、SDK回归画布和浏览器文件/颜色协议没有满足现有需求的对应组件，保留已有实现，通用控件统一接入。CodeSlots是验证码输入，ModelViewer不能替代本SDK回归宿主。

用户指定两份项目配置。首次Windows引号错误，改Node CLI后发现npx被pnpm devEngines拒绝；pnpm首次缓存下载超过握手预算，就绪后MCP握手、registry、搜索、完整目录与view成功，固定实际CLI4.23.0。view只给摘要，源码由官方registry核验；不假称会话已热加载原生工具。

验证真实指针/键盘、禁用/值/事件、浮层去重清理、动态重建、减少动态效果、无JS目录、源码下载和三种宽度；执行ready、站点与浏览器回归。真实结果和首次失败见[Harness](../HARNESS.md)，无CI、SDK API或发布变更。
