# 代码地图

## 已存在文件

| 入口                                                                                                                                                                                      | 职责                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [package.json](../package.json) / [pnpm-workspace.yaml](../pnpm-workspace.yaml)                                                                                                           | 根脚本、apps/* 与 packages/* 工作区和依赖 catalog |
| [vite.config.ts](../vite.config.ts) / [tsconfig.json](../tsconfig.json)                                                                                                                   | 格式、Lint、类型和任务配置                        |
| [主包定义](../packages/three/package.json) / [API 文档](../packages/three/README.md)                                                                                                      | 包名、peer、导出和使用契约                        |
| [index.ts](../packages/three/src/index.ts) / [three-app.ts](../packages/three/src/three-app.ts)                                                                                           | 核心公开入口、实例生命周期与尺寸监听              |
| [frame-loop.ts](../packages/three/src/frame-loop.ts) / [resources.ts](../packages/three/src/resources.ts)                                                                                 | 统一调度和显式资源归属                            |
| [controls.ts](../packages/three/src/controls.ts)                                                                                                                                          | 可选 OrbitControls 子入口                         |
| [interaction.ts](../packages/three/src/interaction.ts)                                                                                                                                    | 可选拾取、点击/悬停与监听清理                     |
| [labels.ts](../packages/three/src/labels.ts)                                                                                                                                              | DOM 投影、独占元素挂载与标签层清理                |
| [animation.ts](../packages/three/src/animation.ts)                                                                                                                                        | 单 Mixer、片段控制、双范围清理与事件重入          |
| [camera.ts](../packages/three/src/camera.ts)                                                                                                                                              | 世界包围球取景、裁剪面和原生控件同步              |
| [loaders.ts](../packages/three/src/loaders.ts) / [gltf-resources.ts](../packages/three/src/gltf-resources.ts)                                                                             | GLTF/GLB 逻辑取消与资源快照                       |
| [ktx2-task.ts](../packages/three/src/ktx2-task.ts)                                                                                                                                        | KTX2 输入隔离、在途解析计数和纹理移交             |
| [打包配置](../packages/three/vite.config.ts)                                                                                                                                              | ESM/声明、多入口和 Three.js 外部化                |
| [演示入口](../apps/website/src/main.ts) / [样式](../apps/website/src/style.css)                                                                                                           | 双实例生命周期与模型加载操作                      |
| [模型生成器](../scripts/generate-model-fixtures.mjs) / [资产说明](../apps/website/public/models/README.md)                                                                                | 原创测试模型及来源                                |
| [Basis 编码工具入口](../scripts/basis-encoder.mjs)                                                                                                                                        | 固定官方提交和哈希的开发工具下载、校验与编码      |
| [文档检查](../scripts/check-docs.mjs) / [检查器测试](../scripts/check-docs.test.mjs)                                                                                                      | 链接、需求、ADR、Skills 与命令验证                |
| [包消费检查](../scripts/check-package.mjs) / [消费样例](../tests/package/consumer.ts.txt) / [声明样例](../tests/package/declarations.ts.txt) / [运行时检查](../tests/package/runtime.mjs) | 工作区外 tarball 安装、入口与严格类型验收         |
| [Playwright 配置](../playwright.config.ts)                                                                                                                                                | 生产构建与 Chromium 回归服务器                    |
| [浏览器耗时报告](../tests/browser/timing-reporter.ts)                                                                                                                                     | 用例、worker 和最慢操作的本地诊断产物             |

## 测试入口

- [帧循环](../packages/three/tests/frame-loop.test.ts)、[资源](../packages/three/tests/resources.test.ts)、[宿主](../packages/three/tests/three-app.test.ts)、[模型](../packages/three/tests/loaders.test.ts)：主包单测。
- [场景](../tests/browser/scene.spec.ts)、[模型](../tests/browser/models.spec.ts)：真实 WebGL、尺寸、异步竞争和图像清理回归。
- [拾取单测](../packages/three/tests/interaction.test.ts) / [浏览器交互](../tests/browser/interaction.spec.ts)：坐标、目标过滤、手势、订阅与销毁，多实例和模型切换。
- [标签单测](../packages/three/tests/labels.test.ts) / [浏览器标签](../tests/browser/labels.spec.ts)：投影与可见性、DOM 所有权、清理、暂停 resize 与指针/键盘交互。
- [动画单测](../packages/three/tests/animation.test.ts) / [浏览器动画](../tests/browser/animation.spec.ts)：真实数值采样、片段/状态、模型移除、事件重入与双实例。
- [压缩浏览器回归](../tests/browser/compression.spec.ts) 配合加载器单测：配置、Worker 生命周期、同 URL 取消、初始化时销毁和错误恢复。[解码许可](../apps/website/public/licenses/README.md) 记录本地分发来源。
- [KTX2 单测](../packages/three/tests/ktx2-task.test.ts) / [浏览器回归](../tests/browser/ktx2.spec.ts)：缓冲隔离、部分失败清理、真实转码、上传/删除、同 URL、初始化销毁和 RGBA 回退。
- [相机单测](../packages/three/tests/camera.test.ts) / [浏览器取景](../tests/browser/camera.spec.ts)：投影、世界变换、控件惯性/限制、同步事件、暂停绘制和大模型。
- [过渡实现](../packages/three/src/camera-transition.ts) / [规划校验](../packages/three/src/camera-frame.ts) / [相机协调](../packages/three/src/camera-runtime.ts)：同相机互斥、宿主 delta 插值和中断清理，通过 camera 入口导出。
- [过渡单测](../packages/three/tests/camera-transition.test.ts) / [浏览器过渡](../tests/browser/camera-transition.spec.ts)：暂停、替换、异常、原生输入与模型/宿主清理。

## 调用链与定位

页面 index.html → main.ts → 主包/controls/loaders/interaction/labels/animation/camera 公开入口 → 调度更新、Mixer、渲染与 DOM 投影，或异步模型/拾取事件及即时取景。应用依赖主库，库不反向引用应用。

ready → 文档测试/校验 → vp check → 主包单测 → 主包和演示 build。test:browser → 生产 build → preview → Chromium。test-results 与 dist 为忽略提交的产物。

test:package → 主包 build → 系统临时目录中 pack/install → Node 运行时和 development 解析 → 库声明/完整应用类型验收。两个 .ts.txt 是样例数据，复制为临时项目的 .ts 后由该项目的 TypeScript 编译，不参加工作区类型解析。成功自动清理临时项目，失败输出诊断目录。

需求/API 看 [REQUIREMENTS](REQUIREMENTS.md) 和 [SDD](SDD.md)；旧能力参考 [LEGACY_REVIEW](LEGACY_REVIEW.md)；运行问题看 [HARNESS](HARNESS.md)。初始化的 utils、计数器和框架品牌素材已清理。

## 规划目录（尚不存在）

扩展包、后端服务、项目自研 Skill 与 CI workflow 尚未创建；不为空设想预建目录。

## 维护

重要模块、入口或职责变化时更新；已存在路径用相对链接，规划保持文字标注。
