# 长期上下文

## 目标与当前阶段

更新日期：2026-11-04。用户要重做旧版 CustomThree，并先参考工程初始化指令生成相关文件；主 npm 包名已确认 `@adui/three`。当前处于工程初始化和设计准备阶段，主库功能尚未开发。

## 已实现

- 保留已有 Vite+ / TypeScript / pnpm Monorepo 模板及代码；根包 private，website 为原生 TS 页面，utils 为示例包。
- 建立 [AGENTS](../AGENTS.md)、[需求](REQUIREMENTS.md)、[架构](ARCHITECTURE.md)、[SDD](SDD.md)、[代码地图](CODEBASE_MAP.md)、[Skills 索引](SKILLS.md)、[Harness](HARNESS.md)。
- 对本机旧版只读审查，记录在 [LEGACY_REVIEW](LEGACY_REVIEW.md)，没有复制或修改旧项目。
- 新增文档检查与检查器回归测试，接入 ready；未新增生产依赖。

## 验证状态

依赖已通过 `pnpm install --frozen-lockfile` 安装。文档校验、检查器测试及现有工具链结果统一记录于 [Harness 验证记录](HARNESS.md)，避免重复维护结果。没有运行旧项目、新版 WebGL 画面、浏览器兼容或 GPU 泄漏验证；当前没有新版实现可供这些验收。

## 已确认与建议

已确认：重做封装、工程文档优先、主包 npm 名称。建议：单一主包起步，宿主加组合模块，先处理生命周期、调度、resize、资源归属，再扩展模型等能力。具体包目录、MVP/API、Three.js 版本与发布格式尚待决策，见 [ADR-0001](adr/0001-package-boundaries.md)。截图中的扩展包名只是未来演进参考。

## 下一阶段与风险

1. 选择首个演示场景和 MVP，决定核心必需与可选能力。
2. 核验 Three.js 官方 API、版本、类型与 peer 范围，补正式生命周期验收编号。
3. 将 SDD 草案收敛成公开类型与资源所有权契约，再创建主包和最小演示。

当前无阻塞本轮文档工作的未知项。会影响下一阶段的事项包括浏览器范围、WebGL/WebGPU、API 风格、包导出与发布权限。主要技术债为模板占位信息（utils 作者/仓库/描述、页面示例）和缺少产品测试；不在初始化中擅自发布或全量改造。旧版路径仅为本机参考，第三方源码迁入前必须核验许可证。

## 维护

里程碑、重要决策、阻塞或下一阶段计划变化时更新；以代码和实际命令结果描述完成度，不把历史聊天作为唯一事实来源。
