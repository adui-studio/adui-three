# 后处理

WebGL / WebGPU 共用 attachBloom、attachPostprocessing、configure 与 dispose。内部使用对应的原生 composer 或 TSL 节点图，仍由宿主独占绘制，无额外 renderer 或 RAF。

## 泛光

```ts
import { attachBloom } from "@adui/three/postprocessing";

const bloom = attachBloom(app, { strength: 1, radius: 0.4, threshold: 0.85 });
bloom.configure({ strength: 2, radius: 0.4, threshold: 0.85 });
bloom.configure({ enabled: false });
app.renderOnce(); // 暂停时也能刷新，不推进动画。
// bloom.dispose(); // 释放整条效果链，恢复宿主默认绘制。
```

strength、threshold 为非负有限数，HDR threshold 可以大于1；radius 为[0,1]。默认 strength=1、radius=.4、threshold=.85、enabled=true。初始配置和 configure 均拒绝无效值。

## 描边与颜色滤镜

```ts
import { attachPostprocessing } from "@adui/three/postprocessing";

const effects = attachPostprocessing(app, {
  outline: { selectedObjects: [model.scene], visibleEdgeColor: 0xffdd44 },
  bloom: { strength: 1, threshold: 0.9 },
  colorAdjustment: { brightness: 0, contrast: 0, hue: 0, saturation: 0 },
});
picking.on("click", ({ intersection }) => {
  effects.configure({
    outline: { selectedObjects: intersection ? [intersection.object] : [] },
  });
  if (app.state !== "running") app.renderOnce();
});
// 模型移除前：effects.configure({ outline: { selectedObjects: [] } });
// effects.dispose();
```

至少请求一项效果；configure 只允许更新最初请求的效果。未列出的效果保留，列出的效果作为完整描述替换：省略参数取默认值，outline 的 selectedObjects 默认空数组，省略颜色保留当前颜色。需要保留已调整的数值时再次显式传入。描边对象数组会复制，之后修改原数组不会改变选择。

OutlineOptions 默认 edgeStrength=3、edgeThickness=1、edgeGlow=0、enabled=true；强度与 glow 非负有限，thickness 为[1,4]，颜色为整数 RGB hex，selectedObjects 为原生 Object3D 数组。跨后端要求相同颜色时显式传入 visibleEdgeColor 和 hiddenEdgeColor。edgeGlow 使用各后端原生模糊实现，不保证像素一致。

colorAdjustment 的 brightness/hue 为[-1,1]，contrast/saturation 为[-1,1)，并拒绝浮点上传后变成1的奇异值。默认均0，enabled=true。顺序固定为场景 → 描边 → 泛光 → brightness/contrast → hue/saturation → 一次 tone mapping 与输出颜色变换。色彩参数公式保持一致，色调映射和曝光使用 app.renderer 或 attachRendererSettings 管理。

## 原生访问和类型

普通代码使用 configure。原生访问保留具体类型：WebGL BloomHandle.pass 是 UnrealBloomPass，PostprocessingHandle 的 bloom/outline/colorAdjustment 是对应 passes；已知 GPU 宿主返回 NodeBloomHandle / NodePostprocessingHandle，pass/bloom/outline 为对应 TSL 节点。动态宿主返回联合句柄，其 configure/dispose 协议相同。

直接写原生参数时由应用保证有效；不要自行 dispose 自有 pass/node，也不要将旧 GLSL pass 传入节点 renderer。颜色滤镜在 GPU 侧为私有节点图，通过 configure 更新。

## 生命周期与尺寸

挂接不会启动或停止宿主。一次 renderOnce 或连续帧只经过一条宿主管线。宿主资源作用域拥有句柄；dispose 幂等并解除管线，绘制期间延迟释放 GPU 资源，配置期间先完成校验和快照再交接。销毁会跳过未应用配置，不释放借用的模型、材质、纹理或 renderer。重复挂接失败会回收本次新分配，原管线保持。

节点 RenderPipeline 只释放其 quad material，扩展显式清理 scene pass、BloomNode 和 OutlineNode 的自有目标。节点 pass 自动跟随当前尺寸/DPR，原 WebGL composer 按宿主 resize 通知同步；零尺寸不绘制。WebGL composer 的离屏目标未启用 MSAA，节点 scene pass 跟随原生采样，因此图像边缘可能不同。

绘制失败恢复 renderer 和借用场景状态后抛出，清理失败尝试剩余对象并聚合错误。enabled=false 旁路相应效果并保留已分配资源；完全卸载调用 dispose。背景经过输出管线与默认直接绘制可能存在原生 tone mapping 差异；不承诺两种后端逐像素相同，也不承诺第三方原生调用的重入安全或性能。范围和原生 GPU 验收限制见 [渲染器配置](webgpu.md) 与 [ADR-0051](../adr/0051-renderer-feature-parity.md)。
