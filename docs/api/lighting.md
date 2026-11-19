# 灯光与阴影

WebGL / WebGPU 共用 attachShadowLight 与 basic / pcf / vsm 选项。节点渲染器通过 light.shadow 控制更新，释放 light 时由原生节点清理阴影及 VSM 目标；不写入 WebGL 专属的 renderer.shadowMap.autoUpdate/needsUpdate。

## 方向光实时阴影

lighting 入口的 attachShadowLight 参考 Editor 的实时渲染路线，复用原生 PCF / VSM、DirectionalLight 与正交阴影相机。效果取决于实体与接收面、场景单位、灯光方向、PBR材质和环境填充；当前不包含 Editor Realistic 路径追踪。

```ts
import { attachShadowLight } from "@adui/three/lighting";
import { computeObjectBounds } from "@adui/three/geometry";

const sun = attachShadowLight(app, {
  bounds: computeObjectBounds(shadowArea), // 包括需要覆盖的实体和接收区域
  casters: [model],
  receivers: [floor, model],
  type: "pcf",
  mapSize: 2048,
  normalBias: 0.02,
  bias: -0.0001,
});
// sun.setEnabled(false) 保留照明和贴图；sun.dispose() 移除整盏自有灯光。
// 物体移动后 sun.fit(newBounds)；静态 autoUpdate:false 时用 sun.requestUpdate() 再 render。
```

bounds复制为世界Box3，以八角光空间边界加5%padding收紧视锥，不每帧自动扩大。默认direction=(5,10,5)、type=pcf、mapSize=2048、bias=-.0001、normalBias=.02、radius=2、blurSamples=8、shadowIntensity=1、color=0xffffff、intensity=3、autoUpdate=true，可选scope。mapSize为128..4096二次幂且不超过设备maxTextureSize，blurSamples为1..32整数；shadowIntensity在[0,1]，法线偏移/半径/光强非负有限。r187已移除PCFSoftShadowMap，不将它当作另一种软阴影算法。

句柄light/disposed/enabled、fit(bounds)、setEnabled、requestUpdate、dispose；不会启动/绘制宿主。使用无变换/自动矩阵的场景，bounds非空且具有正尺寸，direction非零有限；不要把分辨率增加当作扩大覆盖范围的替代。PCF适合原生深度比较，VSM提供模糊分布阴影，但可能有光漏，需要调整场景、偏移和半径。

每宿主renderer只允许一个受管理阴影，Mesh标记也不允许被其他受管理阴影占用。借用caster/receiver对象及资产，只设置现有Mesh的原生标记，结束按值恢复；自有灯光、target、map/mapPass随宿主或scope清理。全局shadowMap配置会影响其他原生灯光，应用需统一类型策略；后续原生写入的同值意图无法区分。绘制中结束延后移除节点/还原标记/释放GPU与租约；在绘制返回后再重建。类型/分辨率变化推荐销毁后重建，偏移/半径/强度可通过自有light原生属性调整后requestUpdate，不替换或转移shadow/map。
