# ADR-0003 glTF 加载与异步资源所有权

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-010、FR-011、FR-012
- 替代关系：扩展 ADR-0002 的核心生命周期，不替换核心资源登记策略

## 背景与候选方案

核心 MVP 已完成，用户要求继续，下一阶段先落地 GLTF/GLB 加载。旧版模型管理会改写材质，缺乏统一异步生命周期；本轮保持原始模型，并让返回句柄承担明确所有权。

候选：只透传原生 loadAsync、为每次任务调用 LoadingManager.abort、或增加独立逻辑取消与迟到清理。r187 的 FileLoader 以 URL 合并在途请求，即使 manager 不同也可能共享运输；直接 abort 可能影响其他任务。默认选择逻辑取消，网络/解码不承诺停止。

## 决策

- 独立 `@adui/three/loaders` 子入口，Three.js/addons 外部化，不向核心入口强制导入 loader。
- `loadGLTF(app, url, options?)` 返回 Promise<GLTFModel>；默认挂到 app.scene，可关闭挂载；不自动居中、缩放、改材质或启动动画。
- 每次创建独立 manager/loader，不调用 manager.abort、不改全局 Cache。signal 或 app/scope 结束立即拒绝 AbortError，消费底层迟到失败，迟到成功释放而不挂载。
- 挂载前先登记模型句柄，防止原生 childadded 事件中同步销毁宿主后仍返回失效模型。
- 加载成功时拍摄所有返回 scenes 的资源快照，scope 内去重 geometry/material/texture/skeleton/node，避免释放调用方随后添加的借用对象。
- 无缓存模型的 ImageBitmap 默认在纹理释放后 close 并去重；若加载开始/完成或释放时全局缓存启用则保留图像给缓存所有者；外部共享图像可显式 closeImageBitmaps=false。应用不要在任务过程中反复切换全局 Cache 状态。
- 底层主文件进度区分已知/未知总量，不当作完整依赖与解析进度。进度回调抛错仅拒绝本任务；晚到清理异常通过 onCleanupError 报告，未设置时写 console.error。

## 代价与边界

取消后网络和解码可能继续，直到原生 loader 完成；任务暂时保留清理所需引用。不提供首版共享资产缓存、克隆引用计数、外部 loader/插件注入、Draco/KTX2/Meshopt 配置、自动 AnimationMixer 或授权方案。返回模型里的资源由句柄独占管理；借出的共享克隆不能比该所有者存活更久，除非调用方明确协调所有权。

原生 loader 在解析失败前已创建、但未返回给调用方的部分资源不在可清理快照内；本轮不声称解决原生解析器所有失败路径或长期无泄漏。dispose 释放 GPU/图像 backing，持有 gltf 引用的调用方仍可能保留 CPU 对象。

## 验证与来源

单测覆盖竞争、所有权和失败分支；生产浏览器回归通过同 URL 单次真实请求验证独立取消，并观测原生 ImageBitmap.close，验证迟到清理与已挂载模型释放。模型是项目原创的小型 GLTF/GLB，非私有/第三方资产。

- [GLTFLoader 官方文档](https://threejs.org/docs/pages/GLTFLoader.html)
- [r187 FileLoader 合并请求逻辑](https://github.com/mrdoob/three.js/blob/r187/src/loaders/FileLoader.js)
- [r187 ImageBitmapLoader 缓存逻辑](https://github.com/mrdoob/three.js/blob/r187/src/loaders/ImageBitmapLoader.js)
- [LoadingManager 取消限制](https://threejs.org/docs/pages/LoadingManager.html)

详细 API、验收和后续变动同步 [SDD](../SDD.md)、[需求](../REQUIREMENTS.md) 与 [Harness](../HARNESS.md)。
