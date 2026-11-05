# Skills 索引

## 当前状态

2026-11-04 用户已将 23 个第三方 Skills 安装在 `.agents/skills`，包含 36 个 Markdown 文件，无可执行脚本或捆绑程序；未创建项目自研 Skill。来源记录见 [skills-lock.json](../skills-lock.json)，其中 computedHash 为安装器记录，本轮未重新计算或验证上游内容未变。

以下状态均为“本地已安装”，不等于功能示例已运行。按任务选择相关 Skill，避免全部加载。元数据和文件链接由文档检查器验证。

## 工程与 GitHub Skills

本组来源均按锁文件记录为 `github/awesome-copilot`。本轮读取提交、emoji、Issue 工作流及 release 的适用范围；README、EditorConfig 等保留为后续按需使用。

| Skill                                                                                                                                             | 用途与项目适配                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [git-commit](../.agents/skills/git-commit/SKILL.md)                                                                                               | 用户要求提交时检查差异、暂存、提交；消息遵循贡献指南                           |
| [gitmoji](../.agents/skills/gitmoji/SKILL.md)                                                                                                     | 选择一个与意图匹配的 emoji；只生成消息，不执行 Git                             |
| [conventional-commit](../.agents/skills/conventional-commit/SKILL.md)                                                                             | 辅助 Conventional Commits；其 XML 和自动提交描述不覆盖项目格式与授权           |
| [github-issues](../.agents/skills/github-issues/SKILL.md)                                                                                         | Issue 管理；使用实际可用的连接器或 CLI，先确认上下文和查重                     |
| [create-github-issue-feature-from-specification](../.agents/skills/create-github-issue-feature-from-specification/SKILL.md)                       | 一份规格对应一个功能 Issue，使用 feature_request.yml                           |
| [create-github-issues-feature-from-implementation-plan](../.agents/skills/create-github-issues-feature-from-implementation-plan/SKILL.md)         | 按实施阶段拆 Issue，使用 feature_request.yml / chore_request.yml               |
| [create-github-issues-for-unmet-specification-requirements](../.agents/skills/create-github-issues-for-unmet-specification-requirements/SKILL.md) | 检查实现后按未满足正式需求拆 Issue，不把待决策草案转成承诺                     |
| [create-readme](../.agents/skills/create-readme/SKILL.md)                                                                                         | 请求创建或大幅完善 README 时使用，增量保留已有事实                             |
| [editorconfig](../.agents/skills/editorconfig/SKILL.md)                                                                                           | 请求统一编辑器配置时使用，与现有 Vite+ 格式规则保持一致                        |
| [github-release](../.agents/skills/github-release/SKILL.md)                                                                                       | 面向单包发布的流程，当前 Monorepo 需先确定目标包和发布方式，不能直接对根包套用 |

## Three.js Skills

本组来源按锁文件记录为 `cloudai-x/threejs-skills`；文档声明面向 r186。本轮使用 threejs-fundamentals 辅助核心设计，并核对 r187 官方 API 后选择 0.187.0；未直接运行或迁入整段 Skill 示例。React/WebGPU 内容不表示项目已选择对应技术。

2026-11-05 模型阶段按需使用 threejs-loaders，另外核验 r187 FileLoader 的全局 URL 合并和 ImageBitmapLoader 缓存；采用独立逻辑取消而不直接套用 manager.abort 示例。未加载其他格式或压缩管线 Skills 来扩大本轮范围。

| Skill                                                                             | 适用任务                                            |
| --------------------------------------------------------------------------------- | --------------------------------------------------- |
| [threejs-fundamentals](../.agents/skills/threejs-fundamentals/SKILL.md)           | 场景、相机、renderer、resize、循环与清理            |
| [threejs-animation](../.agents/skills/threejs-animation/SKILL.md)                 | 关键帧、骨骼、morph、动画混合                       |
| [threejs-geometry](../.agents/skills/threejs-geometry/SKILL.md)                   | BufferGeometry、实例化、点线和几何合并              |
| [threejs-interaction](../.agents/skills/threejs-interaction/SKILL.md)             | 拾取、控制器、拖拽与输入                            |
| [threejs-lighting](../.agents/skills/threejs-lighting/SKILL.md)                   | 光照、阴影和环境照明                                |
| [threejs-loaders](../.agents/skills/threejs-loaders/SKILL.md)                     | 模型、纹理与环境加载、进度、缓存和释放              |
| [threejs-materials](../.agents/skills/threejs-materials/SKILL.md)                 | 材质选择、PBR 参数、混合和深度行为                  |
| [threejs-textures](../.agents/skills/threejs-textures/SKILL.md)                   | 色彩空间、UV、纹理类型与内存                        |
| [threejs-shaders](../.agents/skills/threejs-shaders/SKILL.md)                     | 自定义 GLSL、ShaderMaterial 与 TSL 参考             |
| [threejs-postprocessing](../.agents/skills/threejs-postprocessing/SKILL.md)       | composer、Pass、泛光、描边等后处理                  |
| [threejs-performance](../.agents/skills/threejs-performance/SKILL.md)             | 帧耗时、draw calls、GPU/CPU 与资源统计              |
| [threejs-asset-pipeline](../.agents/skills/threejs-asset-pipeline/SKILL.md)       | 资产检查、压缩和 glTF 优化，操作资产前确认范围      |
| [threejs-react-three-fiber](../.agents/skills/threejs-react-three-fiber/SKILL.md) | 仅在 React 适配任务中使用，当前原生 TS 演示无需加载 |

2026-11-05 拾取阶段使用 threejs-interaction 辅助输入与 raycast 设计，并核验 r187 官方实现及 MDN 坐标/指针契约；只实现拾取子入口，没有引入 TransformControls、拖物体或框选等额外能力。

同日标签阶段复用 threejs-fundamentals 的变换/投影和生命周期线索，另行核验 r187 Vector3 与 CSS2DRenderer 及 MDN DOM 行为；实现独立 DOM 层，不引入框架适配或复制 Skill 示例。

同日动画阶段使用 threejs-animation，核验 r187 Mixer/Action 的同步事件和缓存释放，以及 Khronos glTF 动画数据规范。只实现显式单片段播放与模型清理，没有迁入骨骼克隆、重定向、TSL 或混合示例。

同日压缩阶段使用 threejs-loaders 和 threejs-asset-pipeline，核验 r187 的 URL 对配置、Draco dispose 及 Khronos 扩展；使用锁定的两个开发编码器生成原创样例，没有直接执行泛化 optimize 命令或引入纹理/框架管线。考虑所有权后选择独立任务 Draco，复用实例的性能取舍记录在 ADR-0005。

同日回归诊断使用 threejs-performance 的先测量原则，核验锁定 Playwright 的 trace 与 reporter 行为，收集 API/expect 用时。runner 耗时不能视为 GPU 计时，不据此修改主包生命周期或承诺性能指标。

同日 KTX2 阶段复用 threejs-loaders 与 threejs-asset-pipeline，核验 r187 KTX2/GLTFLoader 的回调、全局任务缓存、吞纹理错误和未初始化 dispose 计数，以及 Khronos KHR_texture_basisu。采用任务自有适配层与解析输入复制；共享实例建议的性能取舍另记 ADR-0006。未安装泛化资产优化工具，原创棋盘由固定提交/字节哈希的官方 Basis WASM 编码器生成，代码缓存不进入仓库或运行时分发。

同日按用户要求使用 git-commit 与 gitmoji 分步提交既有成果，格式遵循贡献指南，未改写历史；随后相机阶段复用 threejs-fundamentals 与 threejs-interaction，核验 r187 的精确 Box3 路径、有效 FOV 和原生控件 update/限制。取景采用即时函数，不复制 Skill 的渲染循环或引入额外动画依赖。

同日用户要求中文提交，使用 git-commit 执行两项中文提交并推送；继续过渡阶段复用 threejs-animation 的 delta 与 quaternion 插值思路，核验官方 Quaternion/Vector3/OrbitControls 及 r187 源码。保持单一宿主调度，不复制独立 RAF 或引入动画依赖。

同日继续交付平滑取景时复用 git-commit/gitmoji，采用中文描述及过渡意图的 💫；后续包消费检查沿用 NFR-002，核验 pnpm pack/install、Node 条件导出与 TypeScript skipLibCheck 官方文档，不安装额外技能或依赖。包结构相关改动增加 test:package 独立门禁，详见 Harness。

## 发现与创建原则

提交任务中，用户的中文描述/正文要求优先于第三方 Skill 的英文祈使语气示例；继续使用 git-commit 执行和 gitmoji 选意图，不改动导入的 Skill 原文。

先按任务读取本索引，复用现有规则；会话提供的主机 Skill 按平台发现与加载，不能写成仓库已安装资产。若后续模型迁移、GPU 验证等流程反复出现，可再提取项目自有 Skill，不与第三方副本混淆。

新 Skill 必须包含 name/description 元数据、触发、输入输出、步骤、限制、失败处理和验证。第三方技能先检查来源、许可证、权限、依赖和脚本；未审阅不得执行。新增后把真实路径、状态与验证记录写入本表，文档检查器会检查已发现 Skill 的基本元数据与索引链接。

本轮权限与兼容评估：本地文件均为 Markdown；git-commit、gitmoji 元数据声明 MIT，其余本地元数据未声明许可证，尚未完成逐项上游许可证核验，不据此复制第三方实现到主库。git-commit 限定 Git shell 操作，部分技能要求 CLI、MCP 或修改远程数据；实际工具名与当前环境可能不同，应先发现工具再使用。发布 Skill 有单包假设，Three.js Skill 有版本假设，均不能替代项目决策。

用户安装技能并允许按任务使用，不代表自动创建远程 Issue/PR、发布版本或执行所有代码块；按当前请求确定动作范围。保留第三方原文与锁文件；Vite+ 格式化排除导入副本，文档校验仍检查其元数据和引用。规范改动优先写在 [贡献指南](../CONTRIBUTING.md) 与 AGENTS 中。

持续封装阶段复用 threejs-postprocessing Skill，核验 r187 的 EffectComposer、WebGLRenderer 与 WebGLOutput 源码；基于宿主实际尺寸路径选择显式 RenderPipeline，保留单一 RAF，不照搬 Skill 的循环。后续按模块使用中文提交并本地验证，不做 CI。

泛光阶段继续复用 threejs-postprocessing，固定 r187 原生三 pass 管线，不使用不匹配宿主尺寸路径的 setEffects。实际 GPU 像素/释放回归和八入口包消费在本地执行；不新增依赖或 CI。

组合效果阶段继续核验 r187 OutlinePass 的核范围、场景可见性切换及原生墙钟脉冲，复用原生效果而不访问私有缓存。新增选择/组合回归，并修正 resize 失败的尺寸去重及宿主重试状态；本地验证后分步中文提交。

HDR 环境阶段继续复用 threejs-loaders，核验 r187 HDRLoader、DataTextureLoader.createDataTexture、Scene 与固定依赖的 WebGLEnvironments。加载前的运输取消建议不直接采纳：同 URL 共享运输只逻辑取消。原生 renderer 自动预过滤，不重复创建 PMREM；GPU 释放以预热基线验证，最终资源归宿主 renderer。

对象变换阶段复用 threejs-interaction，核验 r187 TransformControls 的独立 helper、公开 pointerUp/disconnect 与原生属性事件；不复制 Skill 中第二循环或无条件覆盖 orbit.enabled 的做法。以初始 helper 资源快照去重清理，保留外部资源和可观察的配置修改，真实鼠标与 GPU buffer/program 回归在本地执行。

图片纹理阶段复用 threejs-textures 和 threejs-loaders，核验 r187 Texture/ImageBitmapLoader/WebGLTextures 与 createImageBitmap/close 官方 API。位图方向在解码时处理，不误用 Texture.flipY；保持浏览器不做颜色转换、由 Texture 标记颜色空间。为避免原生 URL 位图缓存混用选项与 close 所有权，独立下载共享字节后逐任务解码。

动画定位阶段复用 threejs-animation，核验 r187 Action.reset/time 与零 delta、Mixer 全局时间/缩放语义。使用既有 sample(0) 而非 Mixer.setTime，保持动作时间与宿主调度分离；原生事件队列重新校验实际选择，浏览器验证真实节点姿态。

## 维护

新增、替换或改变重要工作流时同步本索引与相应定义；不宣称静态元数据校验已经证明技能行为正确。
