# ADR-0044 方向光实时阴影

- 状态：Accepted
- 日期：2026-11-18
- 关联需求：FR-057
- 替代关系：新增 lighting 可选入口；复用 ADR-0043 绘制结束清理

## 参考与范围

用户以 Three.js Editor 为视觉参考。Editor 同时包含普通实时渲染和 Realistic 路径追踪；本轮实现 WebGL2 原生方向光阴影，提供可调柔和边缘和偏移，不宣称与未指定场景的Editor像素一致，也不把实时PCF/VSM称作路径追踪。模型/地面、灯光方向、PBR材质、曝光和环境填充会共同决定视觉效果。

采用r187的PCFShadowMap或VSMShadowMap；PCFSoftShadowMap在本地r187源码已移除并回退到PCF，不沿用旧Skill示例。attachShadowLight拥有新DirectionalLight、target和它生成的shadow.map/mapPass，借用renderer与显式caster/receiver根，默认mapSize2048、bias=-.0001、normalBias=.02、radius=2、blurSamples=8、shadowIntensity=1、白色强度3。

## 边界规划与输入

bounds为世界Box3快照，包含需要投影的物体与接收区域。取中心、半径和5%padding，沿归一方向（默认5,10,5）放置灯光，八个角转换至光相机空间，设置正交left/right/bottom/top与正near/far。只覆盖显式bounds，不每帧自动扩大；移动/动画后用fit重新规划，静态光可autoUpdate=false并用requestUpdate在下次绘制刷新。

mapSize为128..4096的二次幂，且不超过renderer.capabilities.maxTextureSize；blurSamples为1..32整数，偏移/强度/半径有限，方向非零，bounds非空非退化。bias允许有符号；normalBias/radius/intensity非负，shadowIntensity在[0,1]。当前要求无变换、自动矩阵的场景。大范围应按场景单位选择bounds与偏移，不以提高mapSize替代视锥规划。

## 所有权与清理

每renderer一个受管理阴影租约；caster/receiver Mesh也不能被另一个受管理阴影占用，同一请求两种标记可重合。根只遍历现有Mesh，新增节点须重建请求或由应用设置原生标记。借用几何体、材质和对象不销毁，保留原castShadow/receiveShadow值；结束仅按值恢复未被消费者改变的标记。全局shadowMap enabled/type/autoUpdate也按值恢复，其他原生灯光会受当前全局type影响，调用方需统一策略。

setEnabled切换light.castShadow并保留贴图/照明，dispose移除整盏自有灯光/target。宿主与可选scope登记。绘制中结束时节点移除、标记/全局设置恢复和map清理统一延后至原生pass结束，见ADR-0043；租约在此时释放，避免在阴影递归遍历中重建或移除子节点。清理全部尝试后聚合错误，重复dispose无操作。

原生PCF目标包含颜色和深度纹理，VSM还分配模糊目标；使用原生RenderTarget释放其拥有的深度和颜色，renderer内部blur shader/缓存仍归renderer，不能把贴图释放称作renderer所有缓存归零。公开light可调整原生强度、偏移/模糊等，类型/分辨率变化推荐dispose后重建；不转移自有map或替换light.shadow。

## 验证与来源

真实矩阵单测逐一投影八角确认在视锥内，另覆盖输入、scope、独占、恢复与延后释放。双实例 /?demo=effects 提供实体/地面、原生PCF/VSM、法线偏移/柔和度及开关；浏览器检查实际像素差异、原生回调销毁和多轮纹理回到基线。实测结果与限制见 [Harness](../HARNESS.md)。

- [Three.js Editor](https://threejs.org/editor/)
- [Editor 实时与路径追踪视图源码](https://github.com/mrdoob/three.js/blob/master/editor/js/Viewport.js)
- [LightShadow 官方文档](https://threejs.org/docs/pages/LightShadow.html)
- [WebGLRenderer 阴影接口](https://threejs.org/docs/pages/WebGLRenderer.html)
- [DirectionalLightShadow](https://threejs.org/docs/pages/DirectionalLightShadow.html)
