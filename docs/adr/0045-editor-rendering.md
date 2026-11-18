# ADR-0045 Editor 渲染基准与 Room 环境

- 状态：Accepted
- 日期：2026-11-18
- 关联需求：FR-059、FR-060；扩展 FR-057
- 替代关系：新增 rendering 可选入口；复用 environment 与绘制结束边界

## 依据与范围

用户指定 Three.js Editor 作为效果配置基准。2026-11-18 核验在线 Config.js 与 r187 配置：WebGL、antialias=true、shadows=true、PCFShadowMap、NeutralToneMapping、exposure=1。r187 Renderer 面板另外以 reversedDepthBuffer=true 创建 renderer；实际支持取决于原生 EXT_clip_control。清空 Editor 时也恢复 Neutral/1/PCF。七种色调为 No/Linear/Reinhard/Cineon/ACESFilmic/AgX/Neutral，曝光范围 0..10。用户浏览器 localStorage 会改变 Editor 的当前配置，因此本契约采用干净配置，而非猜测用户画面。

createEditorRenderPreset 返回独立的 renderer/color/shadows 数值配置；renderer 创建选项交给 ThreeApp，颜色通过 attachRendererSettings，阴影通过 attachShadowLight。保留普通 ThreeApp 的既有默认值，显式采用预设。Basic 补入 lighting，继续使用原生 Basic/PCF/VSM。抗锯齿是 renderer 创建参数；离屏 composer 并不会因此自动获得 MSAA，不宣称两种输出链边缘完全相同。

## 颜色配置生命周期

rendering 入口不依赖 composer、灯光或 Room。每 renderer 独占受管理色调/曝光；设置句柄可 configure 部分值，settings 返回最后已应用的独立快照。不启动或绘制宿主。曝光非有限或超出 0..10、未知映射在写入前失败。No 模式遵循原生语义，不受曝光调节。

依靠同一 render-retirement 私有模块识别宿主绘制。attach 必须在绘制外，避免快照 RenderPass 临时 NoToneMapping；configure 在绘制中按命令顺序合并，等 composer 的 finally 恢复后再应用。dispose 立即结束句柄，跳过排队配置，恢复与释放租约延后到绘制结束。宿主和可选 scope 均拥有句柄，原生配置按值恢复；后续相同值的写入意图无法辨别。直接调用 renderer.render 不在宿主管理边界内，调用方需自行协调。

## Room 环境资产

Editor 的可选 Room 使用原生 RoomEnvironment 和 PMREMGenerator.fromScene(room,0.04)。createRoomEnvironment 在同一宿主 renderer 上同步生成，默认 sigma=.04、size=256；sigma 范围 0..1，size 限 256/512/1024，避免隐式取整及无界 GPU 分配。显式执行 GPU 工作，但不绑定环境或启动场景；禁止绘制中生成，以免递归使用 native renderer。

沿用 EnvironmentAsset 泛型所有权、独占 attachEnvironment 和 resources：HDREnvironment 仍是 EnvironmentAsset<DataTexture>，RoomEnvironmentAsset 使用 Texture 接口。r187 返回拥有 PMREM cube texture 的 WebGLCubeRenderTarget，并非旧 CubeUV atlas；生成器 dispose 不会释放返回目标。临时原生 Room/生成器始终尝试释放；返回 cube target 由资产拥有，结束先解除绑定，再在当前宿主绘制结束后释放。跨宿主绑定拒绝，消费者不单独 dispose 纹理。

生成前记录 render target/face/mip、autoClear 四开关、XR、tone/exposure、clear color/alpha；成功与失败均尝试恢复。生成中宿主结束则拒绝交付并清理已返回目标；绘制结束清理回调异常也不能丢失已返回目标引用。原生 fromScene 抛错前分配但未返回的内部输出不可通过公开接口取得，无法保证这部分 GPU 资源全回收；不以 mock 单测外推消除此边界。

## 验证与限制

单测检查映射、输入、命令合并、作用域、条件恢复、临时资源与异常状态回滚。/?demo=editor 两侧共享场景构造和阴影封装，左侧使用配置/环境 API，右侧直接写原生颜色配置与生成 PMREM；仅对照色调、曝光和 Room，不将同一阴影 helper 当作独立算法对照。真实浏览器逐像素比较七种模式（非 1 曝光区分 Linear/No）、Room 反射及多轮纹理/几何基线，另验证原生三种阴影、OutputPass 中变更配置和重建。

本阶段不复制 Editor UI，不加入 WebGPU、Realistic 路径追踪或全局照明。当前真实 GPU 验收仅为 Chromium/软件 WebGL，其他硬件、长期性能和完整浏览器矩阵待验证。

- [在线 Editor Config](https://threejs.org/editor/js/Config.js)
- [r187 Config](https://github.com/mrdoob/three.js/blob/r187/editor/js/Config.js)
- [r187 Renderer 面板](https://github.com/mrdoob/three.js/blob/r187/editor/js/Sidebar.Project.Renderer.js)
- [r187 Viewport Room 配置](https://github.com/mrdoob/three.js/blob/r187/editor/js/Viewport.js)
- [RoomEnvironment](https://threejs.org/docs/pages/RoomEnvironment.html)
- [PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html)
