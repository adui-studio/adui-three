# 长期上下文

## 目标与当前阶段

更新日期：2026-11-05。核心 MVP 后继续模型阶段，主包已提供 GLTF/GLB 加载、逻辑取消、迟到结果清理和模型资源快照。website 包含双实例生命周期及原创带纹理模型演示，尚未发布 npm。

## 已实现

- 保留 Vite+ / TypeScript / pnpm 工具链；工作区仅含主包和原生 TS 演示，未使用的初始化示例已删除。
- 建立 [AGENTS](../AGENTS.md)、[需求](REQUIREMENTS.md)、[架构](ARCHITECTURE.md)、[SDD](SDD.md)、[代码地图](CODEBASE_MAP.md)、[Skills 索引](SKILLS.md)、[Harness](HARNESS.md)。
- 对本机旧版只读审查，记录在 [LEGACY_REVIEW](LEGACY_REVIEW.md)，没有复制或修改旧项目。
- 初始化阶段新增文档检查与检查器回归测试，接入 ready；当时未新增生产依赖。
- 用户安装 23 个 Skills，索引已更新；补齐 Bug/功能/工程任务 Issue Forms、PR 模板与贡献指南。新提交采用 `type(scope): emoji description`，不改写已有历史。
- 主包位于 packages/three，ESM/ES2022 + 声明，Three.js 0.187.0 与同 minor peer；类型依赖随主包安装，Three.js/addons 打包外部化。演示通过公开入口消费。
- 核心新增 20 项单元用例和 Playwright 浏览器回归；具体执行结果以 Harness 为准。
- 模型阶段新增 16 项单元测试，主包累计 36 项；浏览器累计 3 项多步骤回归，验证同 URL 取消隔离与真实 ImageBitmap 释放。模型 fixtures 原创、可通过脚本重建，无私有或第三方模型。
- 按用户要求重写根 README 为使用说明，删除未引用的初始化 utils 包、计数器和模板素材；工作区和锁文件已同步。旧包的本地忽略缓存目录递归清理被自动审批审查拒绝，源码已删除，不影响工作区识别。

## 验证状态

文档、单测、构建及实际浏览器验证结果统一记录于 [Harness](HARNESS.md)，避免重复维护。未运行旧项目，未完成完整浏览器矩阵、长期 GPU 泄漏和性能基准验证。

## 已确认与建议

已确认并实施：单一主包起步，宿主加内部组合模块；controls、loaders 为按需子入口。原始提案见 [ADR-0001](adr/0001-package-boundaries.md)，核心决策见 [ADR-0002](adr/0002-core-mvp.md)，模型决策见 [ADR-0003](adr/0003-gltf-lifecycle.md)。截图中的扩展包名仍为未来参考。

## 下一阶段与风险

1. 使用双实例演示评审 API 和资源所有权的易用性。
2. 从拾取、DOM 标签或模型压缩/动画支持中选择下一项真实场景，补正式需求和验收。
3. 选定目标浏览器与场景规模，再补兼容矩阵和资源/性能基准。

当前无阻塞本地实现的未知项。后续需确认浏览器范围、更多 Three.js minor、WebGPU/WebXR 与 npm 发布权限。旧版路径为本机参考，第三方源码迁入前需核验许可证。2026-11-05 用户授权提交并推送，GitHub SSH 推送成功，早前的 403 推送阻塞已解除。

## 维护

里程碑、重要决策、阻塞或下一阶段计划变化时更新；以代码和实际命令结果描述完成度，不把历史聊天作为唯一事实来源。
