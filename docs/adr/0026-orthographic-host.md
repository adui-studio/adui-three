# ADR-0026 正交相机宿主

- 状态：Accepted
- 日期：2026-11-06
- 关联需求：FR-038

## 决策

增加 OrthographicThreeApp，与 ThreeApp 共享内部泛型 SceneHost 的完整生命周期、监听、单 RAF、绘制管线、上下文丢失和资源清理。默认 ThreeApp.camera 仍精确为 PerspectiveCamera，新宿主精确为 OrthographicCamera；不使用可由调用者任意指定但与构造参数不一致的泛型构造器，不复制两套调度实现。SceneHost 不作为运行时导出，AnyThreeApp 是 Camera 参数化后的公共借用类型。

正交默认 frustumHeight=10、near=0、far=1000、position=[0,0,10] 并看向原点；其他宿主/renderer 参数一致，不接受外部相机、场景、renderer 或 canvas。构造前验证有限正高度、非负 near、far>near 和三维有限位置，并检查投影可表示且可逆，失败不分配 GPU。

## 尺寸与可选模块

尺寸变化保留当前 top/bottom（含调用方修改的竖向高度/中心）、水平中心和 zoom，根据 CSS width/height 更新 left/right，再更新原生投影和绘制缓冲。DPR 仅影响绘制缓冲。零尺寸不写退化视锥；失败停止宿主并保留待重试尺寸，修复后 resize/render 复用既有恢复路径，不回滚原生副作用。直接修改相机后调用方仍需 updateProjectionMatrix，未变尺寸的 resize 不代替该调用；原生 view offset 由消费者管理。

controls、loaders、interaction、labels、animation、postprocessing、environment、textures、capture、geometry 接受 AnyThreeApp，继续借用原生 Camera。camera 子入口的 computeObjectFrame/fitObject/transitionToObject 在本阶段仍只支持透视相机，其类型和运行时检查不放宽；正交取景/过渡属于独立后续任务。

## 验证与边界

八项宿主单测覆盖默认/配置/分配前校验、修改后缩放与中心保留、零尺寸/双实例、投影/原生缓冲失败恢复、上下文丢失及构造回滚。严格 tarball 消费核对两种具体相机类型、公共借用类型及可选模块，并确认正交宿主不能传入当前透视取景 API。

独立 ?demo=orthographic 比较正交/透视的真实像素，验证改变深度尺寸保持/缩小、原生滚轮、拾取/标签、暂停 resize/零尺寸和三次销毁 GPU buffer 回零；没有将这些测试称为所有可选模块的正交 GPU 验收。原生 r187 API 核验与数学/生命周期验证不能代替完整硬件/浏览器矩阵。

## 来源

- [OrthographicCamera 官方 API](https://threejs.org/docs/pages/OrthographicCamera.html)
- [r187 原生投影实现](https://github.com/mrdoob/three.js/blob/r187/src/cameras/OrthographicCamera.js)
- [OrbitControls 官方 API](https://threejs.org/docs/pages/OrbitControls.html)
