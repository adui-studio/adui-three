# ADR-0057 独立 TS/JS 用法与完整工程

- 状态：Accepted
- 日期：2026-11-22
- 需求：FR-076

## 决策

examples/recipes 的9份 TypeScript 是专门面向使用者编写的独立用法，直接调用公开 SDK，拥有完整场景、DOM操作和结束逻辑，不读取 cases、shared.ts、ExampleContext、业务别名或 Vite 环境变量。画廊 cases 保留交互回归职责，两者明确区分。

JavaScript 用锁定 Vite+ 的 transformWithOxc 去除 TS 类型，并经既有 vp fmt 格式化；JS和两份HTML模板检查入库。examples:generate 更新，examples:check 比较预期文本，ready 包含该检查，防止语言版本漂移。VitePress和阅读器均使用相同的独立入口文件，HTML、依赖清单和说明也可复制。

主包仍未发布 npm。prepare-example-projects 在主包构建后使用 pnpm pack 打包当前 SDK，为9主题×2语言生成18份完整 ZIP：入口、HTML、package.json、README、许可、vendor SDK tarball、TS配置，以及模型主题的原创GLB。package.json 引用相对 file:vendor 路径，无 workspace 或私有业务路径；工具固定 Vite8.3.8，Three0.187.0，TS版本7.0.2，仅影响独立工程，不升级仓库工具链。首次安装仍需要网络或依赖缓存。

源码阅读器显示 TS/JS选择、文件标签和完整工程下载；高亮、转换、压缩均在构建时运行，下载资源由现有 Vite/VitePress 静态站点托管，SDK 不反向依赖应用。开发模式以受限文件名提供 ZIP，生成目录忽略提交。

源码与场景模块分别加载，源码响应不再成为场景mount的前置条件；请求版本和创建signal隔离迟到结果。源码失败只在阅读器反馈，不结束可用场景；源码未准备好时禁用复制/展开，语言与主题偏好可预选。GPU创建失败也不阻止独立源码抵达。Vite+任务未传npm_execpath时，从已安装的pnpm/Corepack公开CLI解析，不使用shell拼接命令。

## 验证

test:recipes 解压真实 ZIP 到新建系统临时目录，安装其中固定依赖与实际SDK包，9份TS严格编译，18工程分别由临时项目的 Vite 子进程构建，再用浏览器校验像素、页面错误和缺失文件。统一的外部安装避免重复下载，但没有工作区别名或源码解析。子进程退出释放原生编译模块，随后校验路径再清理；失败保留诊断。ZIP浏览器下载与复制入口逐字一致性另有站点测试。

核验 [Vite JavaScript API](https://vite.dev/guide/api-javascript.html)、[Vite 入门](https://vite.dev/guide/)和[fflate ZIP](https://github.com/101arrowz/fflate)。结果与设备范围见[Harness](../HARNESS.md)。
