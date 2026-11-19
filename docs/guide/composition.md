# 模块组合

核心只提供宿主和资源管理，按场景需要导入可选子入口。

| 需求       | 组合                                         |
| ---------- | -------------------------------------------- |
| 模型预览   | 核心 + controls + loaders + camera           |
| 模型动作   | loaders + animation，单模型单Mixer           |
| 场景标记   | labels + interaction + effects               |
| 泛光与描边 | postprocessing，唯一composer和OutputPass     |
| 角色控制   | collision + navigation，先结束旧控制器再切换 |
| Editor光影 | rendering + lighting + 可选environment       |
| 重复物体   | geometry实例化，原几何/材质由应用拥有        |

正式渲染器选择的可用模块与 WebGL 专属限制见 [WebGPU API](../api/webgpu.md)，回退仍使用节点 renderer，不能直接复用 GLSL 效果。

## 显式配置

抗锯齿、反向深度是renderer创建参数；色调、曝光通过颜色句柄设置。阴影需要投射对象、接收区域和灯光；Room生成与绑定分离。普通宿主不强制采用整套Editor预设。

## 原生对象

句柄公开controls、mesh、points、material或pass供扩展，原生写入仍需遵守参数和所有权。不要提前释放借用资产、替换自有GPU目标或建立竞争循环。

[公开入口](../api/index.md) · [正式示例](../examples/index.md)
