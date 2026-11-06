# adui-three 协作入口

## 项目事实与导航

目标：重新封装 Three.js，主 npm 包名为 `@adui/three`。主包核心 MVP、普通/Draco/Meshopt/KTX2 模型加载与动画、拾取、DOM 标签、相机取景、渲染管线及可选泛光已实现，website 为双实例演示，尚未发布 npm。以代码说明实现，以需求说明目标，不把建议写成已完成。

- [需求与验收](docs/REQUIREMENTS.md)：已确认范围、建议 MVP、待决策事项。
- [架构](docs/ARCHITECTURE.md) / [详细设计](docs/SDD.md)：当前结构与建议方案。
- [长期上下文](docs/PROJECT_CONTEXT.md) / [代码地图](docs/CODEBASE_MAP.md)：接手入口。
- [旧版审查](docs/LEGACY_REVIEW.md)：来源、复用线索和风险。
- [Skills](docs/SKILLS.md) / [Harness](docs/HARNESS.md)：工作流与真实命令。
- [ADR](docs/adr/0001-package-boundaries.md)：主包名称和边界方案。
- [核心 MVP 决策](docs/adr/0002-core-mvp.md)：版本、生命周期与包导出。
- [模型生命周期决策](docs/adr/0003-gltf-lifecycle.md)：逻辑取消、迟到清理与资源快照。
- [相机过渡决策](docs/adr/0008-camera-transition.md)：宿主驱动插值、取消和控件配置恢复。
- [动画生命周期决策](docs/adr/0004-animation-lifecycle.md)：模型扩展 scope、单 Mixer 与原生事件重入。
- [压缩解码决策](docs/adr/0005-compressed-models.md)：显式解码配置、任务所有权和本地资产。
- [KTX2 生命周期决策](docs/adr/0006-ktx2-lifecycle.md)：能力检测、输入隔离、在途转码与纹理清理。
- [相机取景决策](docs/adr/0007-camera-framing.md)：世界边界、透视视锥、控件约束与即时应用。
- [渲染管线决策](docs/adr/0009-render-pipeline.md)：独占绘制替换、尺寸通知与单次绘制。
- [泛光生命周期决策](docs/adr/0010-bloom-lifecycle.md)：可选效果链、自有目标与渲染期销毁。
- [组合效果决策](docs/adr/0011-effect-composition.md)：选择描边、固定顺序与场景异常恢复。
- [HDR 环境决策](docs/adr/0012-hdr-environment.md)：加载与绑定分离、取消及原生环境缓存清理。
- [变换手柄决策](docs/adr/0013-transform-controls.md)：模型借用、轨道输入协调与 helper 快照清理。
- [图片纹理决策](docs/adr/0014-image-textures.md)：颜色/方向、逻辑取消与独立位图所有权。
- [贡献指南](CONTRIBUTING.md)：Issue/PR 模板及 emoji 提交规范。

- [动画定位决策](docs/adr/0015-animation-seek.md)：按秒采样、暂停及既有事件队列边界。
- [独立 KTX2 决策](docs/adr/0016-standalone-ktx2.md)：二维压缩纹理、任务隔离与转码清理。
- [动画渐变决策](docs/adr/0017-animation-crossfade.md)：当前权重交接、中断与原生动作清理。
- [模型实例决策](docs/adr/0018-gltf-instances.md)：节点/动画独立、共享资产租约与跨宿主清理。
- [上下文丢失决策](docs/adr/0019-context-loss.md)：结束失效宿主、保留诊断并显式重建。
- [蒙皮拾取决策](docs/adr/0020-skinned-picking.md)：按需更新边界、骨骼矩阵与拾取重入保护。
- [截图决策](docs/adr/0021-frame-capture.md)：同任务复制、独立编码、取消和临时画布清理。
- [实例化决策](docs/adr/0022-managed-instancing.md)：借用几何体/材质、实例数据上传和专属 buffer 清理。
- [动画循环决策](docs/adr/0023-animation-loops.md)：有限次数、往返阶段及原生终点采样归一化。
- [路径运动决策](docs/adr/0024-path-motion.md)：局部曲线采样、变换写入与宿主/模型作用域清理。
- [动画通知决策](docs/adr/0025-animation-notifications.md)：采样后的循环/完成通知、订阅和控制命令排队。
- [正交宿主决策](docs/adr/0026-orthographic-host.md)：具体相机类型、共用生命周期和视锥尺寸策略。

## 工作流程与约束

1. 读取相关文档与代码，定位需求编号，明确本次实现和验证范围。
2. 内部规则优先级：用户明确要求 → 适用 AGENTS → 正式需求 → 设计与架构 → 项目 Skills → 第三方 Skills → 一般实践；不覆盖平台约束。冲突需说明。
3. 保留用户未提交变更；最小修改，不擅自迁移模板、升级依赖、提交推送或发布 npm。
   用户明确不做任何 CI：不新增或启用 CI 工作流，不修改 GitHub Actions 组织或仓库设置；仅使用本地验证命令。
4. `apps/website` 是演示消费者；库不得反向依赖应用、业务 Store、`@/` 别名或固定 DOM 选择器。新库代码使用 TypeScript 和显式类型；复用现有 Vite+ 工具链。
5. 核心使用 Three.js 0.187.0，peer 为 >=0.187.0 <0.188.0，ESM + 声明，WebGL 2；浏览器完整支持矩阵仍待确认。新增/修改 API 先核验对应官方文档，不默认采用 Skill 或旧项目版本。
6. 核心渲染循环、资源所有权、多实例、异步完成与销毁竞争是重点设计项；不可直接整包复制旧实现。具体契约仍以 SDD 状态为准。
7. 不读取或写入真实密钥；不把模型解密密钥、业务路径、私有模型和第三方未核验源码带入通用库。
8. 根据 [Harness](docs/HARNESS.md) 运行适用检查；报告真实结果、失败与限制。GPU 行为不能用构建成功代替验收。
9. 同步规则：需求改 REQUIREMENTS，接口改 SDD，边界改 ARCHITECTURE/ADR，阶段改 PROJECT_CONTEXT，重要目录改 CODEBASE_MAP，流程改 SKILLS/HARNESS。
10. 文档变化执行 `pnpm run docs:test` 和 `pnpm run docs:check`；代码变化另运行 `pnpm run ready`。影响宿主、渲染、控制器或演示时执行 `pnpm run test:browser`；包导出、依赖或打包改动执行 `pnpm run test:package`。交付说明改动、原因、验证、未决事项。
11. Git commit、PR 标题和 squash 消息采用 `type(scope): emoji 中文描述`，如 `feat(core): ✨ 增加场景生命周期`；提交描述和正文使用中文，type/scope、API 名称和规范 footer 标识可保留英文。每条描述以一个匹配意图的 Unicode gitmoji 开头，详情见贡献指南。不改写已有提交。

## Skills 与维护

按 [Skills 索引](docs/SKILLS.md) 按需发现、加载 `.agents/skills` 中用户安装的技能；不假设会话提供的全局技能已安装到仓库，不自动安装第三方技能。提交任务用 git-commit 执行，gitmoji 辅助消息；Issue 任务沿用仓库模板并先查重。技能里的自动执行描述不扩大用户授权，实际工具以环境提供的为准。当前无项目自研 Skill。

更新时机：协作规则、约束、导航或开发流程变化时更新本文件；不在这里复制具体模块设计。
