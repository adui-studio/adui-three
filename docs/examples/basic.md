# 场景与生命周期

立方体使用暂停的原生 GSAP 时间线，经 attachGSAPTimeline 交给宿主推进；提供独立暂停、继续、重播和中点定位。宿主暂停后仍可显式定位并 renderOnce，销毁场景释放该时间线。API 见[场景时间线](../api/animation.md#gsap-场景时间线)。

在导航栏“运行示例”进入画廊，或访问 /play/?example=basic。

## 独立用法

以下代码为面向使用者编写的完整用法，不依赖画廊的 shared.ts 或 ExampleContext。画廊保留更多交互，下面聚焦本主题的最小完整接入。

源文件：[TypeScript](../../examples/recipes/basic.ts) · [JavaScript](../../examples/recipes/basic.js)。

主包尚未发布 npm：在运行页源码区下载 TypeScript 或 JavaScript 完整工程，已包含本地 SDK 包与所需资源。解压后运行 `pnpm install`、`pnpm run dev`。已安装当前 SDK 和 three@0.187.0 的 Vite 项目可直接复制入口和对应 HTML。

::: code-group

<<< ../../examples/recipes/basic.ts [TypeScript]

<<< ../../examples/recipes/basic.js [JavaScript]

:::

## HTML 容器与入口

保存为 index.html，与 main.ts 或 main.js 放在同一目录。

::: code-group

<<< ../../examples/recipes/index-ts.html [TypeScript 入口]

<<< ../../examples/recipes/index-js.html [JavaScript 入口]

:::
