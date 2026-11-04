# 代码地图

## 已存在文件

| 入口                                                                                                          | 职责                                              |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [package.json](../package.json) / [pnpm-workspace.yaml](../pnpm-workspace.yaml)                               | 根脚本、apps/* 与 packages/* 工作区和依赖 catalog |
| [vite.config.ts](../vite.config.ts) / [tsconfig.json](../tsconfig.json)                                       | 格式、Lint、类型和任务配置                        |
| [主包定义](../packages/three/package.json) / [API 文档](../packages/three/README.md)                          | 包名、peer、导出和使用契约                        |
| [index.ts](../packages/three/src/index.ts) / [three-app.ts](../packages/three/src/three-app.ts)               | 核心公开入口、实例生命周期与尺寸监听              |
| [frame-loop.ts](../packages/three/src/frame-loop.ts) / [resources.ts](../packages/three/src/resources.ts)     | 统一调度和显式资源归属                            |
| [controls.ts](../packages/three/src/controls.ts)                                                              | 可选 OrbitControls 子入口                         |
| [loaders.ts](../packages/three/src/loaders.ts) / [gltf-resources.ts](../packages/three/src/gltf-resources.ts) | GLTF/GLB 逻辑取消与资源快照                       |
| [打包配置](../packages/three/vite.config.ts)                                                                  | ESM/声明、多入口和 Three.js 外部化                |
| [演示入口](../apps/website/src/main.ts) / [样式](../apps/website/src/style.css)                               | 双实例生命周期与模型加载操作                      |
| [模型生成器](../scripts/generate-model-fixtures.mjs) / [资产说明](../apps/website/public/models/README.md)    | 原创测试模型及来源                                |
| [文档检查](../scripts/check-docs.mjs) / [检查器测试](../scripts/check-docs.test.mjs)                          | 链接、需求、ADR、Skills 与命令验证                |
| [Playwright 配置](../playwright.config.ts)                                                                    | 生产构建与 Chromium 回归服务器                    |

## 测试入口

- [帧循环](../packages/three/tests/frame-loop.test.ts)、[资源](../packages/three/tests/resources.test.ts)、[宿主](../packages/three/tests/three-app.test.ts)、[模型](../packages/three/tests/loaders.test.ts)：主包单测。
- [场景](../tests/browser/scene.spec.ts)、[模型](../tests/browser/models.spec.ts)：真实 WebGL、尺寸、异步竞争和图像清理回归。

## 调用链与定位

页面 index.html → main.ts → 主包/controls/loaders 公开入口 → 调度更新/渲染或异步模型任务。应用依赖主库，库不反向引用应用。

ready → 文档测试/校验 → vp check → 主包单测 → 主包和演示 build。test:browser → 生产 build → preview → Chromium。test-results 与 dist 为忽略提交的产物。

需求/API 看 [REQUIREMENTS](REQUIREMENTS.md) 和 [SDD](SDD.md)；旧能力参考 [LEGACY_REVIEW](LEGACY_REVIEW.md)；运行问题看 [HARNESS](HARNESS.md)。初始化的 utils、计数器和框架品牌素材已清理。

## 规划目录（尚不存在）

扩展包、后端服务、项目自研 Skill 与 CI workflow 尚未创建；不为空设想预建目录。

## 维护

重要模块、入口或职责变化时更新；已存在路径用相对链接，规划保持文字标注。
