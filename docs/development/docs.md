# 维护文档站

## 内容来源

docs是正式内容来源。根README提供项目入口，包README提供分发后的基本用法；详细API集中在docs/api，例子引用examples/recipes的独立TS/JS和HTML。画廊cases属于交互回归，不再直接作为使用者复制入口。

指向应用源码、资产和贡献文件的相对链接在VitePress中转换为GitHub链接；文档链接仍站内跳转。Markdown关闭原始HTML解析，使泛型和数学记号作为文字显示。

## 命令

```sh
pnpm run docs:dev
pnpm run docs:build
pnpm run docs:preview
```

docs:dev先构建SDK与示例再启动5174端口。示例为该次构建快照，源码HMR单独运行pnpm run dev。docs:build输出apps/docs/dist，内含/play/；preview使用4174。未配置部署域名或远程发布。

## 构建边界

稳定VitePress1.6.4及其Vite5.4.21通过父依赖override隔离，SDK和示例继续使用Vite+。pnpm只允许精确esbuild0.21.5的安装校验脚本。

prepare-docs仅替换带生成标记的docs/public/play，操作前检查绝对目标；缓存与生成文件忽略提交，不删除源fixtures或examples。

## 校验

docs:check验证相对文件、锚点、源码包含及需求/ADR追踪；VitePress保留死链接检查。test:site验证导航、搜索、示例和真实WebGL。

## 主题与品牌

默认主题通过插槽扩展首页，阅读页保留 VitePress 导航、本地搜索与目录。共享 UI 令牌、Brand Kit 来源、三处页面结构和无障碍规则见[界面设计与品牌](visual-design.md)。不将 Three.js 或浏览器初始化代码导入服务端渲染的主题组件。
