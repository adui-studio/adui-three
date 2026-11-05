# 开发与验证 Harness

## 环境与安装

Node.js >=22.18.0，pnpm 12.16.1，Vite+ 1.4.0。工作区只含主包与演示，无后端服务或秘密环境变量要求；模型 fixtures 由项目本地生成。

```sh
pnpm install --frozen-lockfile
```

首次安装需要网络或缓存。锁文件失败应定位原因，不通过随意升级或重建锁文件隐藏问题。

## 命令

| 命令                        | 范围                                                               |
| --------------------------- | ------------------------------------------------------------------ |
| `pnpm run dev`              | 先构建主包声明，再启动演示；development 条件指向主包 src，支持 HMR |
| `pnpm run docs:test`        | 文档检查器的正确输入与失败路径回归                                 |
| `pnpm run docs:check`       | 文档、链接、命令、需求追踪、ADR 和 Skills 基本结构                 |
| `pnpm exec vp check`        | 格式、Lint 与类型检查                                              |
| `pnpm exec vp run -r test`  | 主包的 105 项单元测试                                              |
| `pnpm exec vp run -r build` | 主包 ESM/声明与 website 类型检查、生产构建                         |
| `pnpm run ready`            | 文档测试/校验、静态检查、主包单测和全部构建                        |
| `pnpm run test:browser`     | 构建演示并执行 21 项真实 Chromium 多步骤回归                       |
| `pnpm run fixtures:models`  | 重建原创 GLTF/GLB 与失败样例，并格式化 .gltf                       |

首次浏览器回归需执行 `pnpm exec playwright install chromium`。测试使用 Playwright 1.64.1 / Chromium / SwiftShader，DPR=3 验证宿主上限 2；preview 使用 127.0.0.1:4173，端口需空闲，测试结束自动收尾。截图和失败 trace 位于忽略提交的 test-results。

首次重建 KTX2 fixtures 会从官方 Basis 仓库固定提交下载 JS/WASM 开发编码工具，校验 SHA256 后放入忽略的 .cache/model-fixtures；缓存就绪后可离线生成。编码工具不属于 npm 或演示分发内容，版本与哈希在 scripts/basis-encoder.mjs 中固定，来源与许可见 ADR-0006 及演示许可记录。演示运行转码器由本地 Three.js 依赖提供。

软件 WebGL 集成测试每例总预算 60 秒，expect 默认仍为 5 秒，动画单次完成断言保留 10 秒。总预算用于多步渲染/布局和 fixture，不是性能指标；具体区别见 [Playwright 超时文档](https://playwright.dev/docs/test-timeouts)。串行执行且不启用自动重试，超时与重跑记录保留。

默认 reporter 另写 `test-results/browser-timings.json`：保留每次尝试的状态、worker 编号、重试编号、总耗时，以及最慢的 10 项 API/expect 操作及可用的源码行。报告只读取 runner 的完成事件，不向浏览器注入探针或改变断言；嵌套操作耗时可能重叠，不能相加当作 CPU/GPU 时间。产物随下次运行清理，需要比较时先复制到被忽略的 playwright-report 目录。CLI 指定其他 reporter 会覆盖默认配置。接口见 [Playwright Reporter](https://playwright.dev/docs/api/class-reporter) 和 [TestStep](https://playwright.dev/docs/api/class-teststep)。

失败 trace 保留操作、DOM 快照、网络与源码，关闭持续截图采集，以减少软件 WebGL 回归中的诊断开销；用例显式截图保留。DOM 快照不记录 WebGL 像素，默认 trace 没有画面时间线；需要完整画面时可用 `pnpm run test:browser --trace=on` 临时覆盖。Playwright 的 retain-on-failure 实际会录制每次运行，只在成功后丢弃，screenshots 默认开启，见 [trace 选项](https://playwright.dev/docs/api/class-testoptions#test-options-trace)。这项配置不改变 DPR、渲染循环、断言、超时或重试。

## 文档校验边界

[检查器](../scripts/check-docs.mjs) 仅使用 Node 内置模块。扫描根 README/AGENTS/CONTRIBUTING、docs、.github 和 .agents/skills 的 Markdown，跳过代码围栏。README 检查存在、非空和链接，不强制初始化时期的标题。

静态校验包括核心章节、相对文件/Markdown 锚点、需求编号/状态/验收/SDD 追踪、ADR 索引、Skills 的 name/description 基础元数据和根脚本引用。支持行内与 YAML 多行 description，不是完整 YAML 解析器。导入的 Skills 保留上游格式，但仍检查其元数据与引用。

[13 项检查器测试](../scripts/check-docs.test.mjs) 覆盖正确基线、坏链接、重复需求、缺失验收/追踪、非法状态、ADR 索引、Skill 元数据和命令引用。互联网链接、Mermaid 渲染、需求语义和许可证不靠静态检查宣称正确。私钥头扫描不等同完整安全审计。

## 验证记录

2026-11-05 模型阶段：13 项文档检查器测试、36 项主包单测和 3 项浏览器回归通过，ESM/类型与生产演示构建成功。浏览器验证双实例、resize、DPR、反复重建、GLTF/GLB 解码、同 URL 逻辑取消隔离、迟到 ImageBitmap 清理、宿主销毁和失败恢复。模型为项目原创资产。

同日初始化清理：删除 13 个未引用的模板文件，工作区仅保留主包与演示；冻结锁文件安装成功。ready 退出码 0：13 项文档测试、36 项主包单测通过，52 个文件格式与 20 个源文件 Lint/类型检查通过，主包和演示构建成功。

清理后浏览器首轮两项模型回归通过，场景回归因多次页面操作耗时增加触发 30 秒总时限，trace 未显示断言失败。未修改超时或断言，执行 `pnpm run test:browser tests/browser/scene.spec.ts` 单独重跑通过（用例约 17.9 秒）。不将首轮命令描述为全量成功。

旧 utils 源码与模板素材已删除；其被忽略的本地 dist/node_modules 目录递归清理被自动审批审查以 blocked by policy 拒绝，不属于工作区包或待提交文件。

## 限制与诊断

2026-11-05 KTX2 阶段：ready 通过 13 项文档测试、105 项主包单测、72 文件格式与 35 源文件 Lint/类型检查，六入口 ESM/声明及演示构建成功。四项新增浏览器用例单独通过（约 10.6 秒），随后全量 21/21 通过（约 58.8 秒），未修改断言等待或启用重试。真实 Worker/Blob URL 计数、压缩纹理上传与模型移除时删除纹理均可观察；同 URL 外部 KTX2 单次请求仍产生两个独立转码 Worker；初始化中销毁未复活，禁用压缩扩展时验证实际 RGBA 上传。桌面棋盘贴图截图已目视检查。

九个模型/纹理文件在暖编码器缓存、禁止 fetch 的条件下重建，SHA256 全部一致；checker.ktx2 头部为 16×16、5 级 mip、BasisLZ。六个公开入口可在无 DOM/禁止网络的 Node 环境导入，默认核心不包含 GLTF/Draco/KTX2 实现。未运行独立 glTF schema validator，未验证 UASTC/HDR/数组/立方纹理、完整硬件格式矩阵或长期 GPU 资源指标。Basis 开发工具首次下载需网络，已固定官方提交及字节哈希；本轮未增加 npm 依赖，运行时转码资源本地托管并附许可记录。

主包目录执行 `npm pack --dry-run --json --ignore-scripts` 成功，清单为 29 个文件、约 36 KB 压缩体积，未包含 WASM、模型或开发编码工具；未实际发布。

2026-11-05 回归采集诊断：使用新增 reporter 重现原配置全量 16/17 通过，标签交互总超时；总耗时 593.1 秒，用例耗时中位数 33.8 秒，最慢关闭上下文 25.3 秒。原始 trace 在单个用例采集数十至上百帧截图。仅关闭 trace 的持续截图，保留 DOM/网络/源码、显式截图、DPR=3/上限 2、原断言与超时、单 worker 和零自动重试，全量 17/17 通过，总耗时 88.2 秒，中位数 4.7 秒，报告中的最慢关闭上下文 0.317 秒，全部运行于 worker 0。补充 reporter 源码行后，再次全量 17/17 通过，总耗时 91.2 秒，中位数 4.1 秒，仍为 worker 0 且所有 retry=0。最终 ready 通过 13 项文档测试、94 项主包单测、66 文件格式与 31 源文件 Lint/类型检查，ESM/声明和演示构建成功。基线及两次对照报告另存于忽略提交的 playwright-report/diagnostics。本机对照支持连续截图采集带来显著开销；尚未定位到 Chromium/驱动内部原因，仍需其他环境与长期运行验证。

2026-11-05 压缩模型阶段：ready 通过 13 项文档测试、94 项主包单测、65 文件格式与 30 源文件 Lint/类型检查，六个 ESM 入口/声明与演示构建成功；冻结锁文件安装成功。五个模型 fixture 重建前后 SHA256 一致，六入口均可在无 DOM、禁止 fetch 的 Node 环境导入，核心入口未包含加载器实现；压缩模型截图已目视检查。演示解码器同源托管并附许可记录，主包不打包二进制。未运行独立 glTF schema validator，不把原生加载成功描述为完整格式校验。

新增三项压缩浏览器用例单独运行通过，覆盖真实 Draco Worker/Meshopt 解码、普通模型无 Draco 请求、缺失/请求失败恢复、同 URL 取消隔离、解码器初始化中销毁、迟到 ImageBitmap 与 Worker 清理。原有两项模型用例单独运行也通过。

本阶段三次全量浏览器结果依次为 15/17、16/17、15/17，通过/失败均保留：首轮压缩迟到清理和场景 resize 未在 5 秒内满足条件，两项保持原断言/超时单独重跑通过；第二轮原拾取用例触发 60 秒总超时。随后仅在拾取用例已完成 B 选中验证后、压缩初始化销毁用例开始前暂停不再参与后续操作的 B 渲染循环，未调整断言、等待时间或重试策略。第三轮三个压缩用例和拾取均通过，原标签交互触发 60 秒总超时，原模型销毁用例未在 5 秒内观测到迟到图片清理；这两项保持源码、断言及超时不变，单独复验均通过（约 1.2/2.4 秒）。时间波动根因未确认；不将分组复验或暂停无关循环描述为完整门禁通过、性能修复或长期稳定性结论。

2026-11-05 动画阶段：ready 通过 13 项文档测试、86 项主包单测、62 文件格式与 29 源文件 Lint/类型检查，六个 ESM 入口/声明及演示构建成功；六入口均可无 DOM 导入，animation 产物不包含 GLTFLoader 实现。fixtures:models 重建 animated.glb 的 SHA256 一致，原有静态 GLTF/GLB 无变更；桌面动画截图已目视检查。

动画单独回归首轮 2 项通过、双实例用例总超时；随后全量 11 项通过、原拾取/标签交互/反复重建共 3 项触发原 30 秒总超时，三项动画本身均通过。trace 显示多次鼠标移动、点击、滚动、布局读取耗时数秒，无已记录的功能断言失败；运行变慢根因未确认。将软件 WebGL 单例总预算配置为 60 秒，保持原断言、expect 等待和串行策略，不启用自动重试。最终全量 `pnpm run test:browser` 14 项通过（约 29.3 秒），并不证明时间波动问题已解决。动画资产只验证节点平移，不将结果外推到复杂骨骼/morph 或性能基准。

2026-11-05 标签阶段：`pnpm run ready` 通过 13 项文档测试、69 项主包单测、58 文件格式与 26 源文件 Lint/类型检查，五个 ESM 入口及声明、生产演示构建成功。五个公开入口均验证可在无 DOM 的 Node 环境导入；新增三项标签浏览器用例单独运行通过，桌面标签与移动端截图已目视检查。

标签阶段首轮全量浏览器为 10 项通过、1 项标签交互总超时；trace 记录鼠标移动/布局调用明显变慢，没有断言失败，未确认根因。未修改源码、断言或超时，完整重跑 `pnpm run test:browser` 后 11 项全部通过（约 2 分钟）。实际覆盖相机跟随、CSS 缩放/DPR、暂停 resize、零尺寸、装饰标签穿透、按钮/键盘、双实例、模型替换及清理；保留首轮超时记录，不将重跑通过当作长期稳定性结论。

2026-11-05 拾取阶段：ready 通过 13 项文档测试、50 项主包单测、55 文件格式与 23 源文件 Lint/类型检查，ESM/声明和演示构建成功。interaction 产物可在无 DOM 的 Node 环境导入。

首轮全量浏览器 4 项通过，原场景长用例在末尾移动端截图触发 30 秒总超时；trace 显示此前功能断言已完成。将它按启停、尺寸、重建和移动端拆为 4 个独立用例，保留原有断言与超时。最终 `pnpm run test:browser` 全量 8 项通过（约 1.9 分钟），包含新增拾取的 CSS 缩放/DPR、双实例、真实 OrbitControls 拖拽过滤、模型目标切换与重建。桌面拾取截图已目视检查。

主包单测替换 renderer 和平台，不能代替真实 WebGL 验收；浏览器只实测 Chromium/软件 WebGL，完整硬件矩阵、长期资源与性能基准尚未完成。模型取消不保证运输/解码停止，原生解析失败中未返回的局部资源仍有边界，详见包 README 和 SDD。

现有 TypeScript 7 API 实验提示及演示大 chunk 提示仍存在；不通过提高阈值隐藏提示。先定位失败属于文档、环境还是代码，修复后按影响重验，记录实际命令和结果。

当前没有远程 CI、发布自动化或 commit hook。后续 CI 应复用 ready 与适用浏览器门禁，不宣称已验证远程运行。

## 维护

环境、命令、测试、构建、文档规则或验证范围变化时更新；只保留有用的近期证据，不累积初始化阶段的模板测试日志。
