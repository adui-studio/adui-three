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

## 来源

- [InstancedMesh 官方文档](https://threejs.org/docs/pages/InstancedMesh.html)
- [Object3D 官方文档](https://threejs.org/docs/pages/Object3D.html)
- [r187 InstancedMesh 源码](https://github.com/mrdoob/three.js/blob/r187/src/objects/InstancedMesh.js)
- [r187 WebGLObjects 清理路径](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgl/WebGLObjects.js)
- [r187 BufferAttribute.dispose](https://github.com/mrdoob/three.js/blob/r187/src/core/BufferAttribute.js)
