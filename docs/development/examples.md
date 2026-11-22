# 维护正式示例

## 组成

catalog.ts分别登记画廊模块与独立用法。cases模块导出mount(context)，返回Promise<SceneApp>，shared.ts仅用于画廊；ExampleContext.renderer选择后端，9主题保留URL、历史和回归控件。对外源码在recipes，必须独立编写、直接使用公开SDK，包含初始化/操作/结束，不引用cases、shared.ts或工作区模块。

异步示例使用 context.signal 取消尚未完成的初始化；挂载后由宿主 signal 管理任务。画廊先取消旧初始化并结束旧实例，并以请求版本防止迟到模块覆盖页面；模型和动画继续使用SDK资源生命周期。

## 新增主题

1. 在examples/src/cases编写模块，只使用公开包入口。
2. 几何/材质分别登记，额外监听绑定app.signal。
3. 独立编写recipes主题TS，在catalog登记其?example-source；扩展scripts/example-recipes.mjs的显式主题清单。
4. 执行pnpm run examples:generate生成JS及HTML，文档以code-group展示双语言和HTML；需要资产时加入完整工程清单。
5. 执行ready、test:recipes及站点验证，按Harness补齐浏览器与包消费；不依赖人工判断“可以复制”。

## 生命周期

不要另建RAF。工具栏只调宿主start/stop/renderOnce/destroy；动画暂停与宿主暂停需区分。

DOM标签的元素、样式、表单和事件归示例，标签句柄只管理投影与挂载；框架根若加入需自己卸载。

## 源码阅读

?example-source 由构建插件读取recipes和完整工程清单，以Expressive Code生成TS/JS、HTML、JSON和README的高亮。source-viewer语言切换后复制当前原文，ZIP与显示文件相同；源码先于GPU创建交付。生成器检查JS漂移，打包器附上实际SDK及原创模型，外部验证使用临时安装的真实包，不使用仓库别名。完整交付见[ADR-0057](../adr/0057-copyable-examples.md)。
