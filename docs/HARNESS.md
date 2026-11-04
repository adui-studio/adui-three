# 开发与验证 Harness

## 环境与安装

Node.js >=22.18.0，pnpm 12.16.1，Vite+ 1.4.0。工作区只含主包与演示，无后端服务或秘密环境变量要求；模型 fixtures 由项目本地生成。

```sh
pnpm install --frozen-lockfile
```

首次安装需要网络或缓存。锁文件失败应定位原因，不通过随意升级或重建锁文件隐藏问题。

## 命令

| 命令                        | 范围                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| `pnpm run dev`              | 先构建主包声明，再启动演示；development 条件指向主包 src，支持 HMR |
| `pnpm run docs:test`        | 文档检查器的正确输入与失败路径回归                                 |
| `pnpm run docs:check`       | 文档、链接、命令、需求追踪、ADR 和 Skills 基本结构                 |
| `pnpm exec vp check`        | 格式、Lint 与类型检查                                              |
| `pnpm exec vp run -r test`  | 主包的 36 项单元测试                                               |
| `pnpm exec vp run -r build` | 主包 ESM/声明与 website 类型检查、生产构建                         |
| `pnpm run ready`            | 文档测试/校验、静态检查、主包单测和全部构建                        |
| `pnpm run test:browser`     | 构建演示并执行 3 项真实 Chromium 多步骤回归                        |
| `pnpm run fixtures:models`  | 重建原创 GLTF/GLB 与失败样例，并格式化 .gltf                       |

首次浏览器回归需执行 `pnpm exec playwright install chromium`。测试使用 Playwright 1.64.1 / Chromium / SwiftShader，DPR=3 验证宿主上限 2；preview 使用 127.0.0.1:4173，端口需空闲，测试结束自动收尾。截图和失败 trace 位于忽略提交的 test-results。

## 文档校验边界

[检查器](../scripts/check-docs.mjs) 仅使用 Node 内置模块。扫描根 README/AGENTS/CONTRIBUTING、docs、.github 和 .agents/skills 的 Markdown，跳过代码围栏。README 检查存在、非空和链接，不强制初始化时期的标题。

静态校验包括核心章节、相对文件/Markdown 锚点、需求编号/状态/验收/SDD 追踪、ADR 索引、Skills 的 name/description 基础元数据和根脚本引用。支持行内与 YAML 多行 description，不是完整 YAML 解析器。导入的 Skills 保留上游格式，但仍检查其元数据与引用。

[13 项检查器测试](../scripts/check-docs.test.mjs) 覆盖正确基线、坏链接、重复需求、缺失验收/追踪、非法状态、ADR 索引、Skill 元数据和命令引用。互联网链接、Mermaid 渲染、需求语义和许可证不靠静态检查宣称正确。私钥头扫描不等同完整安全审计。

## 验证记录

2026-11-05 模型阶段：13 项文档检查器测试、36 项主包单测和 3 项浏览器回归通过，ESM/类型与生产演示构建成功。浏览器验证双实例、resize、DPR、反复重建、GLTF/GLB 解码、同 URL 逻辑取消隔离、迟到 ImageBitmap 清理、宿主销毁和失败恢复。模型为项目原创资产。

同日初始化清理：删除 13 个未引用的模板文件，工作区仅保留主包与演示；冻结锁文件安装成功。ready 退出码 0：13 项文档测试、36 项主包单测通过，52 个文件格式与 20 个源文件 Lint/类型检查通过，主包和演示构建成功。

清理后浏览器首轮两项模型回归通过，场景回归因多次页面操作耗时增加触发 30 秒总时限，trace 未显示断言失败。未修改超时或断言，执行 `pnpm run test:browser tests/browser/scene.spec.ts` 单独重跑通过（用例约 17.9 秒）。不将首轮命令描述为全量成功。

旧 utils 源码与模板素材已删除；其被忽略的本地 dist/node_modules 目录递归清理被自动审批审查以 blocked by policy 拒绝，不属于工作区包或待提交文件。

## 限制与诊断

主包单测替换 renderer 和平台，不能代替真实 WebGL 验收；浏览器只实测 Chromium/软件 WebGL，完整硬件矩阵、长期资源与性能基准尚未完成。模型取消不保证运输/解码停止，原生解析失败中未返回的局部资源仍有边界，详见包 README 和 SDD。

现有 TypeScript 7 API 实验提示及演示大 chunk 提示仍存在；不通过提高阈值隐藏提示。先定位失败属于文档、环境还是代码，修复后按影响重验，记录实际命令和结果。

当前没有远程 CI、发布自动化或 commit hook。后续 CI 应复用 ready 与适用浏览器门禁，不宣称已验证远程运行。

## 维护

环境、命令、测试、构建、文档规则或验证范围变化时更新；只保留有用的近期证据，不累积初始化阶段的模板测试日志。
