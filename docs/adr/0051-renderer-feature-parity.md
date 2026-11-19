# ADR-0051 渲染扩展统一

- 状态：Accepted
- 日期：2026-11-19
- 需求：FR-067
- 关系：扩展 ADR-0050，替代 ADR-0048 的扩展模块仅 WebGL 阶段边界

## 公开契约

保留原17个入口与 attach / capture 名称，接受共同 SceneApp。ThreeApp.create 通过 renderer.type 选择后端，场景代码及资源协议共用。WebGL 原生 pass/material 的精确返回类型保留；已知 GPU 宿主返回节点类型，动态宿主仍可使用共同控制协议。

attachPostprocessing 和 attachBloom 新增 configure。两种后端以相同选项更新泛光、选择描边及颜色调整。只允许配置最初请求的效果，不隐式添加/释放效果；未列出的效果保留，列出的效果按完整描述与默认值替换，描边颜色缺省保留原色。所有选项先校验、再写入，绘制中排队至退休边界。原生 pass/node 是可选的后端特有访问，不设计两套正式调用流程。

## 私有后端实现

WebGPU 私有初始化在交付宿主前安装节点工厂。普通 WebGL 入口不静态导入 TSL 节点；注册器只包含类型和工厂引用。使用 r187 RenderPipeline、scene pass、BloomNode 与 OutlineNode，顺序与 WebGL 相同：场景、描边、泛光、亮度/对比度、色相/饱和度、输出变换。颜色公式核验原生 ShaderPass，避免变成另一套参数含义。

八种动态特效逐项转为纯 TSL，不使用 glslFn 或 wgslFn。phase 由宿主 delta 控制，保持暂停、seek 和 scope。飞点使用 PointsNodeMaterial 和实例化四边形，位置与进度为自有 instance attributes，尺寸转换保持物理像素；无需依赖 WebGPU point-list 的单像素限制。

阴影共享方向光规划和 basic/pcf/vsm 配置。节点 renderer 只管理 enabled/type，更新请求放在 light.shadow；light.dispose 触发原生节点回收全部 VSM 目标。色调、曝光、HDR/EXR 及截图复用既有逻辑；Room 选择原生节点 PMREMGenerator，不创建另一个 WebGL renderer。

## 生命周期和限制

RenderPipeline.dispose 仅拥有内部 quad material，扩展另外拥有 scene pass、泛光与描边节点并逐个释放。绘制期配置和销毁延迟到退休边界；宿主 destroy 的原生设备清理也等当前绘制结束。绘制异常恢复 renderer 状态和借用 scene 属性，不接管模型/材质资产。

Room 清理失败会释放已产生的输出目标并聚合错误。原生 PMREM 在抛错前分配但未返回的内部目标无法通过公开 API 取得，保持前期已记录限制。截图为同任务提交后复制画布，并非 GPU fence 完成信号；真实原生 WebGPU 的画布/裁剪仍需有适配器的浏览器验收。

WebGL composer 与节点 pass 的抗锯齿、描边核和背景输出变换存在原生差异，不承诺逐像素相同。WebGPU 回退仍是节点渲染器；回退像素通过不代表原生 WebGPU 验收。正交 WebGPU、WebXR、更多设备和浏览器矩阵不包含在本次已完成范围。

## 验证

单测验证原生节点图、参数原子性、管线租约、绘制期释放、异常恢复、飞点 buffer/时钟隔离、阴影更新和 Room 输出清理。浏览器分别验证 WebGL、节点回退与严格原生，包含真实组合像素、八种特效定位、三种阴影、环境、区域截图与反复资源回收。ADUI_REQUIRE_WEBGPU=1 时缺少适配器即失败；默认明确跳过，结果见 [Harness](../HARNESS.md)。

- [Three.js RenderPipeline](https://threejs.org/docs/pages/RenderPipeline.html)
- [Three.js OutlineNode](https://threejs.org/docs/pages/OutlineNode.html)
- [Three.js ShadowNode](https://threejs.org/docs/pages/ShadowNode.html)
- [r187 节点 PMREM](https://github.com/mrdoob/three.js/blob/r187/src/renderers/common/extras/PMREMGenerator.js)
- [r187 PointsNodeMaterial](https://github.com/mrdoob/three.js/blob/r187/src/materials/nodes/PointsNodeMaterial.js)
