# ADR-0022 受管理的实例化网格

- 状态：Accepted
- 日期：2026-11-06
- 关联需求：FR-034

## 决策

可选 geometry 入口在原生 InstancedMesh 上提供固定容量的数据操作与宿主所有权。默认 count=0，先填槽位再激活。矩阵按 Float32 实际数据校验仿射、非退化、正行列式；颜色复制线性 RGB。写入自动标记上传，矩阵/count 修改令原生包围体失效，不创建第二帧循环或隐式渲染。

几何体、材质和纹理由调用者保有，handle 只管理实例节点与专属属性/morph 纹理，宿主结束自动清理。原生 InstancedMesh.dispose 先派发节点事件再释放属性；使用公开 Object3D.dispose 和各属性 dispose 分步执行，确保一个步骤抛错仍尝试后续步骤并聚合异常。不遍历外来子节点，不替换原生私有缓存。暴露 mesh 后直接改动自有字段的责任见 SDD。

补充实测边界：BufferAttribute.dispose 只在 WebGPU 处理 GPU 释放，WebGL 实例 buffer/VAO 依赖原生网格 dispose 的 renderer 监听。首次绘制前注册的调用方监听若先抛错，原生派发停止，后续独立属性 dispose 不能补救 WebGL buffer。不得将“全部清理步骤已尝试”写成“任意原生监听异常均保证 GPU 释放”。自有失败清理应登记 handle.resources；已触发时移除故障监听后显式 mesh.dispose 可继续原生清理。保持 handle.dispose 幂等，不使用私有监听列表、全局原型改写或透明事件代理。

## 验证与边界

九项单测使用原生矩阵、包围体和 Raycaster，覆盖容量、量化、颜色、借用、初始化回滚和事件错误清理。独立按需绘制演示有 25 个盒子，两个 Chromium/SwiftShader 用例核对真实 instanced draw 参数、像素/原生 instanceId、移动后边界、零 count 和三轮 buffer 基线。它不是性能基准，不承诺任意硬件、多材质始终一次 draw、动态扩容、每实例材质或任意自定义 shader 边界。主入口不导入 geometry。

## 局部属性上传

2026-11-13 补充：原生 GPU 探针复现 25 个实例中只移动/改色一个，仍上传整份 1600/300 字节数组。受管理写入改为记录已上传属性的组件区间；首次实际上传保持完整数据，之后一项矩阵为 16 个 Float32、颜色为 3 个 Float32。同一属性的待上传区间合并为一个包络，反复编辑不无限积累区间；稀疏修改可能包含中间未变化槽位。

使用公开 onUpload 回调确认实际上传并清待传范围，保留先前回调与原 this。独立弱引用状态仅观察属性版本和自有回调，不读取 renderer 私有缓存。外部 needsUpdate 版本变化或替换 onUpload 回调时，保守回退完整上传；不丢失原生与受管理混合写入。直接改数组仍须调用方按原生要求标记上传；不新增调度或渲染。

四项新增单测验证首次/局部/合并范围、非法输入保持、原生完整上传意图、既有/替换回调与显式范围；真实浏览器核对单项更新分别为 64/12 字节且无编辑绘制不再次上传，保留实际像素/拾取与释放回归。此数据是本地 WebGL 调用量，不是 GPU 执行时间、FPS 或完整硬件性能基准。

## 来源

- [InstancedMesh 官方文档](https://threejs.org/docs/pages/InstancedMesh.html)
- [Object3D 官方文档](https://threejs.org/docs/pages/Object3D.html)
- [r187 InstancedMesh 源码](https://github.com/mrdoob/three.js/blob/r187/src/objects/InstancedMesh.js)
- [r187 WebGLObjects 清理路径](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgl/WebGLObjects.js)
- [r187 BufferAttribute.dispose](https://github.com/mrdoob/three.js/blob/r187/src/core/BufferAttribute.js)
- [BufferAttribute 范围与上传回调](https://threejs.org/docs/pages/BufferAttribute.html)
- [r187 WebGLAttributes 上传](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgl/WebGLAttributes.js)
