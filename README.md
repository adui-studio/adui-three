# Vite+ Monorepo Starter

A starter for creating a Vite+ monorepo.

## adui-three 项目初始化

本仓库准备重新封装 Three.js，主 npm 包名确定为 `@adui/three`。目前仍为 Vite+ / TypeScript 起步模板，主包尚未创建，暂不能按产品库安装使用。下方保留模板开发命令。

从 [AGENTS.md](AGENTS.md) 进入工程约定，查看 [需求与待决策事项](docs/REQUIREMENTS.md)、[架构](docs/ARCHITECTURE.md)、[设计草案](docs/SDD.md)、[当前状态](docs/PROJECT_CONTEXT.md) 和 [旧版审查](docs/LEGACY_REVIEW.md)。

初始化参考：[agent-engineering-kit 中文初始化指令 V1.1](https://github.com/adui-dev/agent-engineering-kit/blob/main/prompts/project-initialization.zh-CN.md)。本仓库按实际模板与旧版源码增量适配。

环境、安装与验证详情见 [Harness](docs/HARNESS.md)。先运行 `pnpm install --frozen-lockfile`；文档检查使用 `pnpm run docs:test` 和 `pnpm run docs:check`，完整门禁使用 `pnpm run ready`。包名和架构演进记录见 [ADR-0001](docs/adr/0001-package-boundaries.md)。

贡献流程、Issue/PR 模板及 emoji 提交格式见 [贡献指南](CONTRIBUTING.md)；按任务加载的本地技能见 [Skills 索引](docs/SKILLS.md)。

## Development

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run -r test
```

- Build the monorepo:

```bash
vp run -r build
```

- Run the development server:

```bash
vp run dev
```
