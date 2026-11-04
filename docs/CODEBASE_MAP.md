# 代码地图

## 已存在文件

| 入口                                                                                                                                                                                                 | 职责与当前事实                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [package.json](../package.json)                                                                                                                                                                      | private 根包，dev、ready 和文档检查入口                         |
| [pnpm-workspace.yaml](../pnpm-workspace.yaml)                                                                                                                                                        | apps/_、packages/_、tools/* 工作区声明与版本 catalog            |
| [pnpm-lock.yaml](../pnpm-lock.yaml)                                                                                                                                                                  | 现有依赖锁文件                                                  |
| [vite.config.ts](../vite.config.ts)                                                                                                                                                                  | 根格式化、Lint/type check、任务缓存配置                         |
| [tsconfig.json](../tsconfig.json)                                                                                                                                                                    | 根 TypeScript 配置                                              |
| [apps/website/package.json](../apps/website/package.json)                                                                                                                                            | dev/build/preview；尚无主库依赖                                 |
| [apps/website/index.html](../apps/website/index.html)                                                                                                                                                | 页面入口                                                        |
| [apps/website/src/main.ts](../apps/website/src/main.ts)                                                                                                                                              | 模板页面，导入样式、图片与计数器                                |
| [apps/website/src/counter.ts](../apps/website/src/counter.ts)                                                                                                                                        | 模板计数器                                                      |
| [packages/utils/package.json](../packages/utils/package.json)                                                                                                                                        | utils 模板包及打包/测试命令                                     |
| [packages/utils/src/index.ts](../packages/utils/src/index.ts)                                                                                                                                        | fn 问候字符串，占位示例                                         |
| [packages/utils/tests/index.test.ts](../packages/utils/tests/index.test.ts)                                                                                                                          | 模板单元测试                                                    |
| [packages/utils/vite.config.ts](../packages/utils/vite.config.ts)                                                                                                                                    | pack/dts 配置                                                   |
| [scripts/check-docs.mjs](../scripts/check-docs.mjs)                                                                                                                                                  | 无额外依赖的文档静态检查                                        |
| [scripts/check-docs.test.mjs](../scripts/check-docs.test.mjs)                                                                                                                                        | 使用临时 fixture 验证检查器失败路径                             |
| [AGENTS.md](../AGENTS.md)                                                                                                                                                                            | 文档导航与工作规则                                              |
| [CONTRIBUTING.md](../CONTRIBUTING.md)                                                                                                                                                                | 贡献、验证、Issue/PR 与 emoji 提交规范                          |
| [feature_request.yml](../.github/ISSUE_TEMPLATE/feature_request.yml) / [chore_request.yml](../.github/ISSUE_TEMPLATE/chore_request.yml) / [bug_report.yml](../.github/ISSUE_TEMPLATE/bug_report.yml) | GitHub Issue Forms；文件名兼容新增 Skills                       |
| [PR 模板](../.github/pull_request_template.md)                                                                                                                                                       | PR 描述、关联、兼容与验证                                       |
| [skills-lock.json](../skills-lock.json) / [Skills 索引](SKILLS.md)                                                                                                                                   | 用户安装 Skills 的来源记录和发现入口；本地定义在 .agents/skills |

## 调用链与定位

当前页面：index.html → main.ts → counter.ts；模板包测试 → utils/src/index.ts。两包暂无业务调用链。ready → 文档测试与校验 → vp check → 工作区 test → build。

需求/API 变动先看 [REQUIREMENTS](REQUIREMENTS.md) 和 [SDD](SDD.md)；旧能力定位看 [LEGACY_REVIEW](LEGACY_REVIEW.md)；工具链问题看 [HARNESS](HARNESS.md)。

## 规划目录（尚不存在）

建议 packages/three 承载 `@adui/three`，不把该路径当成实际代码链接。未来功能优先放主包内部模块；截图所列扩展包未创建。没有 tools/、项目自研 Skill、CI workflow、API 服务、数据库、应用路由或状态仓库；只有对应工作区 glob 并不意味着目录存在。

## 维护

新增重要包、入口、脚本或职责变化时更新；实际文件用可校验相对链接，规划目录保持文字标注。
