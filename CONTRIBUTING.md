# 贡献指南

## 开发与验证

先读 [AGENTS](AGENTS.md)、[需求](docs/REQUIREMENTS.md) 和相关 [SDD](docs/SDD.md)；当前主包已提供核心与模型加载能力，规划功能需明确标注。环境和安装见 [Harness](docs/HARNESS.md)。

- 文档改动：`pnpm run docs:test`、`pnpm run docs:check`。
- 代码或配置改动：`pnpm run ready`。
- 包导出、依赖或打包改动：另执行 `pnpm run test:package`，验证实际 tarball 的独立安装和类型消费；安装可能需要网络，命令不发布 npm。
- 浏览器渲染、交互和 GPU 资源行为需按场景另行验证；记录未运行项目及原因。

[CI](.github/workflows/ci.yml) 自动在 Ubuntu/Windows 的 Node 22.18.0/24 执行 ready 和包消费检查，另在 Ubuntu 运行 Chromium/SwiftShader 浏览器回归。main 推送、PR 和手动触发均可运行，浏览器诊断保留 14 天。配置、平台范围与实际运行记录见 Harness；分支保护及 required checks 未自动设置。

## Issue 与 PR

先搜索已有 Issue，按问题选择 [Bug 报告](.github/ISSUE_TEMPLATE/bug_report.yml)、[功能请求](.github/ISSUE_TEMPLATE/feature_request.yml) 或 [工程任务](.github/ISSUE_TEMPLATE/chore_request.yml)。提案注明待确认；已确认需求关联编号和规格文件。

通过 Skill 从规格生成 Issue 时，按文件、阶段或未满足需求选择拆分方式并查重；通过 API 创建时，将表单字段转成 Markdown 正文，GitHub 不会自动替工具填写模板。未确认的组织 Issue 类型、标签、负责人和项目不预填，也不自动创建。

PR 沿用 [模板](.github/pull_request_template.md)，说明问题与结果、关联需求、兼容影响及实际验证。内容按改动规模填写；小改动保持简洁。仅创建本地模板不产生远程 Issue 或 PR。

模板布局参考 [GitHub Issue Forms 官方语法](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms) 与 [PR 模板文档](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)。进入默认分支后才按 GitHub 的仓库模板机制使用；本地格式检查不能代替线上表单预览。

## 提交规范

采用 Conventional Commits，描述以一个 Unicode gitmoji 开头：

```text
type(scope): emoji 中文描述
```

scope 可省略；标题尽量不超过 72 个字符，无句末句号。提交描述和正文使用中文；type/scope、API 名称及规范 footer 标识可保留英文。type 保留在行首，便于现有 Conventional Commits 工具识别。PR 标题及 squash 合并消息沿用同一格式。已有提交不因语言偏好而改写。

| 场景       | 示例                                    |
| ---------- | --------------------------------------- |
| 新功能     | `feat(core): ✨ 增加场景生命周期`       |
| 修复       | `fix(core): 🐛 防止动画循环重复调度`    |
| 文档       | `docs: 📝 说明资源所有权`               |
| 重构       | `refactor(core): ♻️ 提取帧调度器`       |
| 性能       | `perf(render): ⚡️ 避免重复配置绘制尺寸` |
| 测试       | `test(core): ✅ 验证重复销毁`           |
| 构建       | `build: 📦️ 配置库导出入口`              |
| CI         | `ci: 👷 增加验证工作流`                 |
| 配置与维护 | `chore: 🔧 增加 Issue 与 PR 模板`       |

破坏性变更使用 `type(scope)!: 💥 description`，正文写明迁移方法；必要时补 `BREAKING CHANGE:` footer。关联 Issue 按实际情况使用 `Refs: #编号` 或 `Closes: #编号`，不虚构编号。

提交执行时使用 [git-commit Skill](.agents/skills/git-commit/SKILL.md) 检查差异、暂存和提交；emoji 由 [gitmoji Skill](.agents/skills/gitmoji/SKILL.md) 辅助选择，格式以本指南为准。`conventional-commit` 的 XML 仅是辅助表达，不写进提交标题，也不作为自动提交授权。普通功能改动不重写历史；提交、推送和发布按用户任务授权分别执行。

当前以协作约定约束提交消息，未安装 commitlint 或 Git hooks，不声称已有自动拦截。

## Skills 与维护

按 [Skills 索引](docs/SKILLS.md) 加载与当前任务相关的内容。第三方 Skill 的工具名、版本和权限以当前环境实际能力为准；示例不等于已验证代码。保留用户新增 Skill 的原始内容，更新时同步来源记录和索引。

贡献流程、模板或提交格式变化时同步本指南和 AGENTS；模板的 GitHub 在线表现需在推送后确认。
