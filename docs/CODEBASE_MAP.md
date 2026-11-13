# 代码地图

## 已存在文件

| 入口                                                                                                                                                                                      | 职责                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| [package.json](../package.json) / [pnpm-workspace.yaml](../pnpm-workspace.yaml)                                                                                                           | 根脚本、apps/* 与 packages/* 工作区和依赖 catalog   |
| [vite.config.ts](../vite.config.ts) / [tsconfig.json](../tsconfig.json)                                                                                                                   | 格式、Lint、类型和任务配置                          |
| [主包定义](../packages/three/package.json) / [API 文档](../packages/three/README.md)                                                                                                      | 包名、peer、导出和使用契约                          |
| [index.ts](../packages/three/src/index.ts) / [three-app.ts](../packages/three/src/three-app.ts)                                                                                           | 核心公开入口、实例生命周期与尺寸监听                |
| [frame-loop.ts](../packages/three/src/frame-loop.ts) / [resources.ts](../packages/three/src/resources.ts)                                                                                 | 统一调度和显式资源归属                              |
| [controls.ts](../packages/three/src/controls.ts)                                                                                                                                          | 可选 OrbitControls 子入口                           |
| [interaction.ts](../packages/three/src/interaction.ts)                                                                                                                                    | 可选拾取、点击/悬停与监听清理                       |
| [labels.ts](../packages/three/src/labels.ts)                                                                                                                                              | DOM 投影、独占元素挂载与标签层清理                  |
| [animation.ts](../packages/three/src/animation.ts)                                                                                                                                        | 单 Mixer、片段控制、双范围清理与事件重入            |
| [camera.ts](../packages/three/src/camera.ts)                                                                                                                                              | 世界包围球取景、裁剪面和原生控件同步                |
| [loaders.ts](../packages/three/src/loaders.ts) / [gltf-resources.ts](../packages/three/src/gltf-resources.ts)                                                                             | GLTF/GLB 逻辑取消与资源快照                         |
| [ktx2-task.ts](../packages/three/src/ktx2-task.ts)                                                                                                                                        | KTX2 输入隔离、在途解析计数和纹理移交               |
| [打包配置](../packages/three/vite.config.ts)                                                                                                                                              | ESM/声明、多入口和 Three.js 外部化                  |
| [演示入口](../apps/website/src/main.ts) / [样式](../apps/website/src/style.css)                                                                                                           | 双实例生命周期、模型/动画、取景/效果/纹理与变换操作 |
| [模型生成器](../scripts/generate-model-fixtures.mjs) / [资产说明](../apps/website/public/models/README.md)                                                                                | 原创测试模型及来源                                  |
| [Basis 编码工具入口](../scripts/basis-encoder.mjs)                                                                                                                                        | 固定官方提交和哈希的开发工具下载、校验与编码        |
| [文档检查](../scripts/check-docs.mjs) / [检查器测试](../scripts/check-docs.test.mjs)                                                                                                      | 链接、需求、ADR、Skills 与命令验证                  |
| [包消费检查](../scripts/check-package.mjs) / [消费样例](../tests/package/consumer.ts.txt) / [声明样例](../tests/package/declarations.ts.txt) / [运行时检查](../tests/package/runtime.mjs) | 工作区外 tarball 安装、入口与严格类型验收           |
| [Playwright 配置](../playwright.config.ts)                                                                                                                                                | 生产构建与 Chromium 回归服务器                      |
| [浏览器耗时报告](../tests/browser/timing-reporter.ts)                                                                                                                                     | 用例、worker 和最慢操作的本地诊断产物               |

## 测试入口

- [泛光实现](../packages/three/src/postprocessing.ts) / [单测](../packages/three/tests/postprocessing.test.ts) / [浏览器回归](../tests/browser/postprocessing.spec.ts)：HDR/描边像素、组合顺序、原生目标清理、场景异常恢复及尺寸与帧内销毁。

- [宿主管线和单次绘制](../packages/three/tests/three-app.test.ts) / [浏览器单次绘制](../tests/browser/render.spec.ts)：独占、尺寸、暂停、错误、重入与完成阶段。

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

- [变换手柄](../packages/three/src/transform-controls.ts) / [原生单测](../packages/three/tests/transform-controls.test.ts) / [浏览器交互](../tests/browser/transform.spec.ts)：controls 入口导出，原生拖拽、轨道控制协调和 helper 资源快照清理。

- [textures.ts](../packages/three/src/textures.ts) / [单测](../packages/three/tests/textures.test.ts) / [真实纹理回归](../tests/browser/textures.spec.ts)：颜色/翻转、独立解码、取消与 GPU/位图清理；[PNG 生成器](../scripts/generate-texture-fixture.mjs) / [原创资产](../apps/website/public/textures/README.md)。

- [动画时间轴回归](../tests/browser/animation-seek.spec.ts)：公开 seek 秒接口、暂停宿主的实际标签姿态、恢复/端点和模型生命周期；复用动画单测与既有原创节点资产。

- [独立 KTX2](../packages/three/src/ktx2-texture.ts) / [单测](../packages/three/tests/ktx2-texture.test.ts) / [浏览器回归](../tests/browser/ktx2-texture.spec.ts)：复用转码适配，原生二维纹理所有权与取消；模型/独立纹理共用 [GPU/Worker 探针](../tests/browser/ktx2-probe.ts)。

- [动画渐变回归](../tests/browser/animation-blend.spec.ts)：真实 GLB、权重交接的标签连续性、暂停/中断、定位/停止与模型/宿主清理；数学用例复用 animation.test.ts。

## 调用链与定位

- [environment.ts](../packages/three/src/environment.ts) / [单测](../packages/three/tests/environment.test.ts) / [浏览器回归](../tests/browser/environment.spec.ts)：HDR 加载、逻辑取消、独占场景绑定和预热 GPU 清理。
- [HDR 生成器](../scripts/generate-environment-fixture.mjs) / [原创环境资产](../apps/website/public/environments/README.md)：无网络 RGBE 数学渐变，支持逐字节重建。

页面 index.html → bootstrap.ts → main.ts / instances.ts → 主包及可选子入口 → 调度更新、Mixer、渲染与 DOM 投影，或异步模型/拾取事件及即时取景。应用依赖主库，库不反向引用应用。

ready → 文档测试/校验 → vp check → 主包单测 → 主包和演示 build。test:browser → 生产 build → preview → Chromium。test-results 与 dist 为忽略提交的产物。

test:package → 主包 build → 系统临时目录中 pack/install → Node 运行时和 development 解析 → 库声明/完整应用类型验收。两个 .ts.txt 是样例数据，复制为临时项目的 .ts 后由该项目的 TypeScript 编译，不参加工作区类型解析。成功自动清理临时项目，失败输出诊断目录。

需求/API 看 [REQUIREMENTS](REQUIREMENTS.md) 和 [SDD](SDD.md)；旧能力参考 [LEGACY_REVIEW](LEGACY_REVIEW.md)；运行问题看 [HARNESS](HARNESS.md)。初始化的 utils、计数器和框架品牌素材已清理。

## 规划目录（尚不存在）

扩展包、后端服务与项目自研 Skill 尚未创建，不为空设想预建目录。用户明确不做任何 CI，不创建 workflow 或调整 Actions 设置。

## 模型实例

generate-model-fixtures.mjs 另生成原创 skin-morph.glb，演示“加载骨骼样例”消费；gltf-clone.spec.ts 同时验证真实骨骼/morph 像素、UUID 轨道与各自骨骼纹理的释放。

模型实例由 [gltf-clone.ts](../packages/three/src/gltf-clone.ts) 复制树/片段、重绑 UUID 并管理局部清理；[gltf-assets.ts](../packages/three/src/gltf-assets.ts) 保存内部弱引用登记和共享资产租约。loaders 公开导出，animation 接受实例。[原生实例测试](../packages/three/tests/gltf-clone.test.ts) 覆盖骨骼/morph/错误/所有权，[浏览器实例回归](../tests/browser/gltf-clone.spec.ts) 验证实际 GPU、跨宿主和反复释放。

## 蒙皮拾取

蒙皮动态拾取在 interaction.ts 内按需准备，interaction.test.ts 验证真实 sphere/box、兄弟骨骼/绑定矩阵和重入；interaction.spec.ts 对 Reach 样例的实际像素执行鼠标查询。

## 上下文丢失

上下文丢失在 three-app.ts 复用完整 dispose，通过 contextLost 诊断；[真实上下文回归](../tests/browser/context.spec.ts) 使用 WEBGL_lose_context 验证旧 canvas 失效、跨宿主实例、HDR/图片/泛光重建及迟到模型。核心事件/清理用例在 three-app.test.ts。

## 截图

截图入口 [capture.ts](../packages/three/src/capture.ts) 复用单次绘制并拥有临时 2D 编码面；[单测](../packages/three/tests/capture.test.ts) 验证取消/清理与并发，[浏览器截图回归](../tests/browser/capture.spec.ts) 验证实际编码像素/格式、快照隔离及消费者 URL 生命周期。十二运行时入口由 package.json/vite.config.ts 和独立消费样例覆盖。

实例化入口 [geometry.ts](../packages/three/src/geometry.ts)、[单测](../packages/three/tests/geometry.test.ts) 与 [浏览器回归](../tests/browser/geometry.spec.ts) 覆盖原生上传、边界和所有权。[bootstrap.ts](../apps/website/src/bootstrap.ts) 根据查询参数选择原双实例演示或 [instances.ts](../apps/website/src/instances.ts) 的独立实例演示；共十二个运行时入口。

[实例清理故障回归](../tests/browser/geometry-disposal.spec.ts) 仅在 Playwright 路由中提供锁定 Three.js 的默认 ESM 分发入口和构建后的库模块，验证扩展 scope 错误与原生事件监听顺序的真实 WebGL 差异；附件记录实际原生模块请求，不向产品暴露测试接口或引入外部 CDN。

[camera-frame.ts](../packages/three/src/camera-frame.ts) 在 precise 世界边界采样前准备蒙皮骨骼和绑定逆矩阵；相机单测覆盖外部骨骼、父级移动、Detached 模式与所有者失效，camera.spec.ts 验证暂停缩放后的实际像素和即时/平滑取景距离。

[动画循环浏览器回归](../tests/browser/animation-loops.spec.ts) 验证有限重复完成、重播/移除/重建和真实骨骼往返后的精确 GPU 像素；animation.ts 在原生迭代结束后归一化有限往返端点，原生 Mixer 数学与事件边界由 animation.test.ts 覆盖。

对象路径运动在 [path-animation.ts](../packages/three/src/path-animation.ts)，由 animation 公开导出；[单测](../packages/three/tests/path-animation.test.ts) 覆盖曲线数学与生命周期。[path.ts](../apps/website/src/path.ts) 经 bootstrap 的 `?demo=path` 独立消费，[浏览器回归](../tests/browser/path.spec.ts) 核对实际像素、拾取、独立运动和 GPU 释放。

[动画通知单测](../packages/three/tests/animation-events.test.ts) 对比原生事件与采样后姿态，覆盖订阅和命令排队；[通知浏览器回归](../tests/browser/animation-events.spec.ts) 验证实际片段串接及模型/宿主清理。实现仍位于 animation.ts，无新增运行时入口。

正交/透视宿主共用 [three-app.ts](../packages/three/src/three-app.ts) 内部 SceneHost；[宿主单测](../packages/three/tests/three-app.test.ts) 包含投影/尺寸/生命周期验证。[orthographic.ts](../apps/website/src/orthographic.ts) 经 bootstrap 的 `?demo=orthographic` 比较两种相机，[浏览器回归](../tests/browser/orthographic.spec.ts) 验证实际像素、原生缩放/拾取/标签及重复 GPU 清理。

正交规划/应用在 [camera-orthographic.ts](../packages/three/src/camera-orthographic.ts)，复用 camera-frame 的内部边界准备；[数学/控制器单测](../packages/three/tests/camera-orthographic.test.ts) 覆盖 zoom/裁剪/约束与写锁。orthographic 演示和对应浏览器回归增加放大后取景、窄屏重算及零尺寸恢复。

正交过渡复用 [camera-transition.ts](../packages/three/src/camera-transition.ts) 的泛型执行器与正交准备；[过渡单测](../packages/three/tests/camera-orthographic-transition.test.ts) 验证 zoom/取消/配置和微小终点。orthographic 演示增加过渡、宿主启停和输入/尺寸/重建操作。

正交效果集成在 orthographic 演示中消费既有 postprocessing：组合泛光/描边、原生旁路和拾取选择；[效果浏览器回归](../tests/browser/orthographic-effects.spec.ts) 核验真实像素、对侧隔离、暂停尺寸、三轮纹理/帧缓冲释放及重建。

视图快照位于 [camera-view.ts](../packages/three/src/camera-view.ts)，[单测](../packages/three/tests/camera-view.test.ts) 覆盖 JSON/镜头/控制器及生命周期；投影演示保存数值 JSON 并跨重建恢复，[浏览器回归](../tests/browser/camera-view.spec.ts) 比较缩放/平移后的相同像素和当前宽高比。

EXR 位于既有 [environment.ts](../packages/three/src/environment.ts)，[专用单测](../packages/three/tests/environment-exr.test.ts) 覆盖解码/输入/生命周期。[生成器](../scripts/generate-exr-fixture.mjs) 由原环境生成命令调用，[浏览器回归](../tests/browser/environment-exr.spec.ts) 检查照明与实际 GPU 目标释放；public/licenses 保留原生 EXR/fflate 声明。

反向深度标签回归见 [labels-depth.spec.ts](../tests/browser/labels-depth.spec.ts)：消费真实库产物和锁定的 Three.js build，按实际 EXT_clip_control 能力验收透视/正交近远裁剪像素；无扩展时显式跳过，不模拟 GPU 模式。

## 维护

重要模块、入口或职责变化时更新；已存在路径用相对链接，规划保持文字标注。
