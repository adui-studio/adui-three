# 长期上下文

## 目标与当前阶段

更新日期：2026-11-06。重新封装 Three.js，主 npm 包为 @adui/three，版本 0.0.0，尚未发布。最近交付相机视图保存/恢复 77038e6、EXR 环境 cbca791；本轮补强环境绑定准备期的所有者与独占校验。当前功能以代码和 [SDD](SDD.md) 为准，目标以 [需求](REQUIREMENTS.md) 为准。

用户授权持续封装、分步提交推送；提交描述和正文使用中文，格式 type(scope): emoji 中文描述。不得改写已有提交或擅自发布 npm。用户明确“不做任何 CI”：不新增/启用工作流，不调整组织或仓库 Actions 设置。历史工作流已由 e6ea2c2 移除，保留当时的本地输入回归修复。

## 当前实现

- 单主包 packages/three 与演示 apps/website，保留 Vite+/TypeScript/pnpm；初始化 utils、计数器及品牌模板已清理。库不反向依赖应用、Store、私有资产或固定 DOM。
- ESM/ES2022 与声明；Three.js 和 @types/three 开发基准 0.187.0，peer >=0.187.0 <0.188.0。Three.js/addons 外部化，development 指向随包 src。
- 核心 ThreeApp、OrthographicThreeApp、ResourceScope：透视/正交具体相机类型，共用内部 SceneHost 的单 RAF、启停/隐藏/零尺寸、DPR、显式所有权、异步 signal、独占借用 RenderPipeline 与单次 render。正交保留竖向跨度、中心和 zoom；通用模块接受 AnyThreeApp。原生缓冲/投影和管线尺寸失败分别保留待重试状态；尺寸处理中拒绝递归绘制/resize/重挂接。
- controls：OrbitControls；TransformControls 负责 helper/初始 GPU 快照，借用模型与轨道控制，拖拽/取消按值恢复配置，无第二循环。
- loaders：GLTF/GLB 逻辑取消、迟到清理、模型资源快照/扩展 scope，显式 Draco/Meshopt/KTX2。cloneGLTF 复制默认树与独立动画数据，共享资产租约到最后一个使用者结束。任务自有解码器，运输可能继续，运行资源本地托管。
- interaction / labels：原生 Raycaster 点击/悬停、动态目标及事件清理，默认按需刷新蒙皮边界/骨骼矩阵并防 pick 重入；DOM 标签在完成阶段投影，明确元素和模型借用边界。
- 实例交互：hover 和 click 匹配同时比较 object、instanceId、batchId 的快照；同一网格内跨实例会派发 hover，按下后换实例则取消点击，保留原始 Intersection。
- animation：单 Mixer、片段播放/暂停/恢复/停止、原生事件队列和双范围清理，支持有限 repeat/once/pingpong 和规范化往返终点；seek 按秒定位到首个正向阶段后暂停并重置循环历史；crossFadeTo 根据当前权重渐变到目标，支持中断、暂停和清理。on 提供采样完成后的类型化 loop/finished，回调播放命令排队、销毁跳过剩余通知，异常传播宿主帧策略。
- followPath：借用原生三维 Curve 与目标，在父级局部空间采样位置/可选朝向，使用同一宿主更新，支持独立暂停、循环/往返、替换和外部修改取消；可选模型 scope 在结束时自动解除登记。
- camera：透视/正交独立即时取景，正交以保守包围球规划 zoom/距离/裁剪面，共享蒙皮边界准备。transitionToObject/transitionOrthographicToObject 共用宿主 delta 过渡执行器，支持暂停、替换、输入/尺寸/外部配置取消；正交结果含 zoom，准备/应用写锁和控件租约清理统一。
- camera views：captureCameraView/restoreCameraView 提供 version=1 独立数值快照，支持 JSON/同类跨宿主、当前比例适配与可选轨道 target。恢复验证后才取消旧过渡，消费惯性并保留控制配置；不自动存储/绘制/启动。
- postprocessing：HalfFloat composer、基础/可选描边/可选泛光/输出链，借用 renderer，拥有 passes/targets，操作中释放延后清 GPU。正交演示增加原生拾取选择、效果旁路/释放，专项验证实际像素、暂停尺寸及三轮 GPU 目标回到预热基线。
- environment：loadHDR/loadEXR 共用资产加载与独占场景绑定生命周期；EXR 固定原生首 part/半浮点 RGBA，每任务复制输入。复用原生环境转换，按值恢复外部场景状态，资产释放先解绑。
- textures：图片下载字节可共享、ImageBitmap 独立拥有；颜色空间显式，翻转在解码时烘焙，前置引用清理后释放纹理和原始位图。loadKTX2 额外支持二维 Basis，按任务拥有转码器和原生压缩纹理，取消/格式边界见 ADR-0016。
- capture：复用单次绘制并同步复制 canvas，独立编码 PNG/JPEG/WebP Blob，取消和所有者结束清临时画布，消费者拥有 URL/下载。
- geometry：固定容量实例网格，矩阵/颜色复制并标记上传，count/矩阵变化清包围体，拥有专属实例 buffer，借用几何体/材质；独立演示按需绘制。

十二个运行时入口含默认核心与十一个可选子入口。模型、HDR/EXR、PNG 测试资产均原创可重建；Basis 开发编码工具固定官方提交和 SHA256，缓存不进入分发。旧版仅做过只读审查，见 [LEGACY_REVIEW](LEGACY_REVIEW.md)。

## 验证状态

当前 ready 通过：13 项文档检查器测试、413 项主包单测、格式/Lint/类型及全部构建。十二入口 tarball 和四次严格消费通过，environment 的 loadEXR 导出与实际消费类型已验证。EXR/HDR 浏览器专项 6/6 通过，完整 90/90 通过（约 5.5 分钟），零重试。EXR 仅以原创单 part 未压缩 RGB 样例验收，不外推所有编码格式。反向深度数值探针和历史证据见 [Harness](HARNESS.md)，未将数学用例外推为完整硬件兼容。

浏览器环境是 Chromium/SwiftShader，单 worker、零自动重试；完整设备/格式/浏览器矩阵、长期 GPU 泄漏和性能基准尚未完成。保留 TypeScript 7 API 实验性和演示大 chunk 构建提示，不将本地通过称为远端 CI 通过。失败诊断、历史统计和阶段未提交记录统一保留在 Harness，不在接手入口复制过期状态。

## 最近交付

实例化网格以 eba97c8 推送。补查发现原生 dispose 事件若被首次绘制前的消费者监听抛错中断，WebGL 实例 buffer 不保证立即释放；扩展 scope 的错误能独立聚合。以 ADR-0022 和 GPU 故障回归为准，不声称任意原生事件异常都可回收。

| 提交    | 内容                       |
| ------- | -------------------------- |
| 42df84c | 独占绘制管线与单次绘制     |
| 1ab95c0 | 可选 HDR 泛光与资源释放    |
| a1e282b | 选择描边和固定组合效果链   |
| b12714d | HDR 环境加载与显式绑定     |
| 0ccd828 | 对象变换手柄及轨道输入协调 |
| 1e39d12 | 独立图片纹理和位图清理     |
| 4bdb924 | 动画时间定位与暂停采样     |

以上已推送 origin/main。尺寸失败恢复已以 a44c7ad 推送并核对远端；本轮文档校对同步当前公开能力摘要。早前相机、拾取/标签/动画、压缩模型和包消费成果已交付，历史证据见 Harness 与 Git；GitHub SSH 推送可用。

## 接手与后续边界

WebGL 上下文丢失会将 contextLost 设 true 并完整结束该宿主，业务通过 abort 更新状态并显式重建；不自动继续旧 GPU 图或替换 renderer。真实原型发现旧代 GPU 清理的 1282，证据与取舍见 ADR-0019。另一宿主的模型实例仍由其租约持有共享资产。

先读 [AGENTS](../AGENTS.md)、需求、SDD、[架构](ARCHITECTURE.md)、[代码地图](CODEBASE_MAP.md) 和 [Harness](HARNESS.md)。修改范围对应需求编号；API/所有权边界见 ADR-0002 至 ADR-0030，ADR-0001 保留历史 Proposed 提案。Skills 按 [索引](SKILLS.md) 加载，不自动安装或扩大远程授权。

下一步按实际需求补充更多真实模型/硬件场景或更高层动画能力；不预建空包。正交取景采用独立命名函数，既有透视接口类型不扩大；拾取/标签/取景/组合效果已专项验证，不能外推全部模块和设备。共享解码器服务、浏览器范围、更多 Three.js minor、WebGPU/WebXR、框架适配和 npm 发布权限仍待专门评估。后续代码检查 ready，影响宿主/渲染/演示执行 test:browser，导出/打包变化执行 test:package，文档执行 docs:test/docs:check。

## 维护

阶段、真实验证、约束、阻塞或已确认计划变化时更新本文件；历史过程放 Harness，入口只保留当前事实和继续工作所需边界。
