# ADR-0002 核心 MVP、版本和生命周期契约

- 状态：Accepted
- 日期：2026-11-04
- 关联需求：FR-002、FR-003、FR-005、FR-006、FR-007、FR-008、FR-009、NFR-002
- 替代关系：承接 ADR-0001 的 Proposed 模块方案，不改写原始提案

## 背景与授权

用户在核心 MVP 建议后明确“好的，继续”，本轮推进宿主、循环、resize、资源释放、可选 OrbitControls 和演示。模型、拾取、标签和后处理仍是后续范围。旧版依赖业务 Store 与多个循环，需要建立独立、可验证的核心。

## 候选方案与决策

采用单主包 `packages/three`、`ThreeApp` 宿主与内部 FrameLoop / ResourceScope，保留 utils 原样。采用 ESM 和 ES2022 产物，导出类型声明；可选 controls 使用独立子入口。Three.js 与 @types/three 本轮核验到匹配版本 `0.187.0`，固定开发版本，仅声明同一 minor peer 范围 `>=0.187.0 <0.188.0`；不宣称支持其他 minor。

WebGLRenderer 为首版后端，要求 WebGL 2；WebGPU 的初始化和材质流程不同，留后续专项设计。官方一般建议 renderer.setAnimationLoop，尤其 WebXR；本 MVP 不提供 WebXR，选择内部受控 RAF 以明确 start/stop、零尺寸暂停、错误停止与回调内重启的行为，epoch 拦截旧循环。未来支持 XR 必须替换调度契约并新增决策，不能再并行启动另一循环。

资源采用显式所有权登记，按 scope 去重并逆序清理，不遍历 scene 无差别释放；借入及跨实例共享资源由外部管理。宿主只创建自己的 scene/camera/renderer/canvas，不在第一版加入外部 renderer、通用插件系统或全局资源引用计数。

## 运行时 renderer 配置边界

2026-11-13 补查：Omit 只能限制直接对象字面量，包含公共字段的更宽 WebGLRendererParameters 变量仍可结构化赋值，原运行时展开会将外部 context 传给原生 renderer。宿主必须维护自有上下文的生命周期，因此在创建 DOM/GPU 前复制配置，拒绝非空 canvas/context，并丢弃 null/undefined 的这两个字段；不修改调用方原对象。renderer 本身须为非 null、非数组对象，字段 getter 只读取一次，其他原生选项与默认 antialias 保持。

四项先行失败单测验证两类宿主的拒绝/无分配、配置快照与迟到字段注入、非法配置形状；真实 WebGL 验证四次外部句柄注入被拒绝且原宿主像素/上下文保持，新建宿主仍拥有独立上下文。没有新增外部 renderer 注入接口或私有缓存改写。

## 理由、代价与风险

边界小且可用原生对象扩展，独立控制器入口避免核心强制加载 addon。显式资源登记便于审查，代价是使用者需逐一登记实际拥有的资源。raw scene 与 renderer 可被外部误用，文档明确不要替换内部对象或额外启循环。RAF 方案不适用于 WebXR，浏览器兼容目前只实际验证 Chromium/软件 WebGL。

development 条件导出指向随包包含的 src 以便工作区开发；常规 import 指向 dist。发布权限与 npm 名称可用性未核验，不在本轮发布。浏览器回归使用 Playwright，生产演示通过公开包名及 dist 构建验证，不以 renderer mock 代替画面测试。

## 核验来源与维护

- [npm Three.js 元数据](https://registry.npmjs.org/three/latest)
- [WebGLRenderer 官方文档](https://threejs.org/docs/pages/WebGLRenderer.html)
- [r187 WebGLRenderer 源码](https://github.com/mrdoob/three.js/blob/r187/src/renderers/WebGLRenderer.js)
- [OrbitControls 官方文档](https://threejs.org/docs/pages/OrbitControls.html)

关联实现和验收见 [SDD](../SDD.md)，架构索引见 [ARCHITECTURE](../ARCHITECTURE.md)。版本、后端、调度模式或所有权策略重大变化时新增 ADR；小型 API 改动更新 SDD。
