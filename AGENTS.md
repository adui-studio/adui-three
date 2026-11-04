# adui-three 协作入口

## 项目事实与导航

目标：重新封装 Three.js，主 npm 包名为 `@adui/three`。当前只有 Vite+ / TypeScript Monorepo 模板，主包尚未创建。以代码说明实现，以需求说明目标，不把建议写成已完成。

- [需求与验收](docs/REQUIREMENTS.md)：已确认范围、建议 MVP、待决策事项。
- [架构](docs/ARCHITECTURE.md) / [详细设计](docs/SDD.md)：当前结构与建议方案。
- [长期上下文](docs/PROJECT_CONTEXT.md) / [代码地图](docs/CODEBASE_MAP.md)：接手入口。
- [旧版审查](docs/LEGACY_REVIEW.md)：来源、复用线索和风险。
- [Skills](docs/SKILLS.md) / [Harness](docs/HARNESS.md)：工作流与真实命令。
- [ADR](docs/adr/0001-package-boundaries.md)：主包名称和边界方案。

## 工作流程与约束

1. 读取相关文档与代码，定位需求编号，明确本次实现和验证范围。
2. 内部规则优先级：用户明确要求 → 适用 AGENTS → 正式需求 → 设计与架构 → 项目 Skills → 第三方 Skills → 一般实践；不覆盖平台约束。冲突需说明。
3. 保留用户未提交变更；最小修改，不擅自迁移模板、升级依赖、提交推送或发布 npm。
4. `apps/website` 是演示消费者；库不得反向依赖应用、业务 Store、`@/` 别名或固定 DOM 选择器。新库代码使用 TypeScript 和显式类型；复用现有 Vite+ 工具链。
5. Three.js 版本、peerDependencies、导出格式和浏览器范围尚待决策。实现前依据届时的官方文档核验 API，不默认沿用旧版本。
6. 核心渲染循环、资源所有权、多实例、异步完成与销毁竞争是重点设计项；不可直接整包复制旧实现。具体契约仍以 SDD 状态为准。
7. 不读取或写入真实密钥；不把模型解密密钥、业务路径、私有模型和第三方未核验源码带入通用库。
8. 根据 [Harness](docs/HARNESS.md) 运行适用检查；报告真实结果、失败与限制。GPU 行为不能用构建成功代替验收。
9. 同步规则：需求改 REQUIREMENTS，接口改 SDD，边界改 ARCHITECTURE/ADR，阶段改 PROJECT_CONTEXT，重要目录改 CODEBASE_MAP，流程改 SKILLS/HARNESS。
10. 文档变化执行 `pnpm run docs:test` 和 `pnpm run docs:check`；代码变化另运行 `pnpm run ready`。交付说明改动、原因、验证、未决事项。

## Skills 与维护

按 [Skills 索引](docs/SKILLS.md) 按需发现、加载技能；不假设会话提供的全局技能已安装到仓库，不自动安装第三方技能。当前无项目自有 Skill。

更新时机：协作规则、约束、导航或开发流程变化时更新本文件；不在这里复制具体模块设计。
