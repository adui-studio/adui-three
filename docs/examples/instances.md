# 实例化网格

在导航栏“运行示例”进入画廊，或访问 /play/?example=instances。

## 独立用法

以下代码为面向使用者编写的完整用法，不依赖画廊的 shared.ts 或 ExampleContext。画廊保留更多交互，下面聚焦本主题的最小完整接入。

源文件：[TypeScript](../../examples/recipes/instances.ts) · [JavaScript](../../examples/recipes/instances.js)。

主包尚未发布 npm：在运行页源码区下载 TypeScript 或 JavaScript 完整工程，已包含本地 SDK 包与所需资源。解压后运行 `pnpm install`、`pnpm run dev`。已安装当前 SDK 和 three@0.187.0 的 Vite 项目可直接复制入口和对应 HTML。

::: code-group

<<< ../../examples/recipes/instances.ts [TypeScript]

<<< ../../examples/recipes/instances.js [JavaScript]

:::

## HTML 容器与入口

保存为 index.html，与 main.ts 或 main.js 放在同一目录。

::: code-group

<<< ../../examples/recipes/index-ts.html [TypeScript 入口]

<<< ../../examples/recipes/index-js.html [JavaScript 入口]

:::
