# 示例目录

每页提供独立编写的 TypeScript、自动生成的 JavaScript 以及完整 HTML，来源为 examples/recipes，不依赖画廊内部辅助文件。导航栏“运行示例”打开同一构建的/play/画廊；也可运行 `pnpm run dev`。

运行页展开“查看示例源码”可选择 TypeScript/JavaScript，并切换入口、HTML、package.json和说明，方向键/Home/End浏览文件。提供原文复制、换行、主题及展开阅读，Escape返回。主包尚未发布npm，完整工程下载包含当前SDK的本地tarball和必要资源，解压后pnpm install、pnpm run dev即可；已有SDK的Vite项目可复制入口和HTML，模型主题另需复制随附GLB。画廊交互演示保留更多控制，独立用法聚焦主题接入。

| 主题                            | 说明                 |
| ------------------------------- | -------------------- |
| [渲染器与输出](webgpu.md)       | 异步初始化与实际后端 |
| [场景与生命周期](basic.md)      | 最小宿主、更新与资源 |
| [模型与动画](model.md)          | 本地GLB与动作        |
| [相机与视角](camera.md)         | 取景、过渡、保存恢复 |
| [交互DOM标签](labels.md)        | 卡片、表单与按钮     |
| [点云与流光](effects.md)        | Points与空间效果     |
| [光影与环境](shadows.md)        | 阴影与Room           |
| [第一与第三人称](navigation.md) | 静态BVH与控件        |
| [实例化网格](instances.md)      | 共享资产与实例数据   |

## 正式示例与回归场景

正式示例关注单一主题的接法，画廊负责切换、结束和源码展示。apps/website保留双实例回归界面，使用 `pnpm run dev:playground`；它覆盖失败恢复、重入和GPU清理。

资产来自共享fixtures中的原创数据与许可记录。框架、私有资产和应用状态由消费者接入。
