# 开发文档

## 开始开发

先读[协作入口](../../AGENTS.md)、[项目上下文](../PROJECT_CONTEXT.md)、[需求与验收](../REQUIREMENTS.md)。代码和SDD说明实现，建议不能写成完成。

```sh
pnpm install --frozen-lockfile
pnpm run dev
pnpm run docs:dev
```

目录职责见[包结构](package-layout.md)，模块入口见[代码地图](../CODEBASE_MAP.md)。

## 验证

```sh
pnpm run ready
pnpm run test:package
pnpm run test:browser
pnpm run test:site
```

ready包含文档测试、静态检查、单测和工作区构建。包检查使用实际tarball；浏览器检查真实GPU与输入；站点检查文档与正式示例。结果和限制见[Harness](../HARNESS.md)。

## 维护入口

[新增示例](examples.md) · [维护文档站](docs.md) · [架构](../ARCHITECTURE.md) · [详细设计](../SDD.md) · [Skills](../SKILLS.md) · [贡献](../../CONTRIBUTING.md)

只使用本地验证，不新增或启用CI。提交采用type(scope): emoji 中文描述，不改写既有提交；npm发布需要独立授权。
