# 后处理

## 泛光后处理

```ts
import { ACESFilmicToneMapping } from "three";
import { attachBloom } from "@adui/three/postprocessing";

app.renderer.toneMapping = ACESFilmicToneMapping; // 由应用决定颜色策略。
const bloom = attachBloom(app, { strength: 1, radius: 0.4, threshold: 0.85 });
// bloom.pass.strength = 2; bloom.pass.enabled = false;
// 暂停时修改参数后可调用 app.render()；不会推进动画。
// bloom.dispose(); // 释放整个效果链；宿主恢复默认绘制。
```

BloomOptions 的默认值如上，另有 enabled=true。初始 strength、threshold 为非负有限数（HDR 阈值可大于 1），radius 范围 [0,1]，无效值在分配前拒绝。BloomHandle 提供原生 UnrealBloomPass pass、disposed 和幂等 dispose；可直接配置原生参数和 enabled，直接属性修改由应用保证有效。不要手动 dispose 自有 pass 或为它创建循环。

固定 RenderPass → UnrealBloomPass → OutputPass，由宿主独占 RenderPipeline 绘制；不额外 render、RAF 或自动启停。不改 renderer.toneMapping、exposure 或 outputColorSpace；亮度和发光材质由应用配置。单次 app.render 也经过效果链并更新标签。尺寸/DPR 跟随宿主，零尺寸保留已有目标，恢复同步。

内部持有 HalfFloat 目标、composer 和 passes，句柄登记 app.resources；手动或宿主/scope 释放解除管线并清理全部自有对象，不释放场景资产或 renderer。重复挂接失败回收新分配，不覆盖当前管线。渲染回调中 dispose 会立即禁用后续 passes，并延迟到当前原生调用返回后释放 GPU 资源；不会重新挂接。绘制错误恢复借用 renderer 的 target/autoClear/toneMapping/清屏状态并抛出，清理失败继续处理剩余资源并聚合错误。

pass.enabled=false 仅旁路泛光，保留基础/输出 pass 及 GPU 资源，完全卸载需 dispose。需要支持对应浮点颜色目标的设备，不自动降级；离屏目标未启用 MSAA，原生 renderer.antialias 不会自动传递。当前为全屏亮度阈值泛光，不提供选择性泛光、自由 pass 编排或 GPU 性能承诺；选择描边见下一节。

## 选择描边与组合效果

```ts
import { attachPostprocessing } from "@adui/three/postprocessing";

const effects = attachPostprocessing(app, {
  bloom: { strength: 1, threshold: 0.9 }, // 可省略
  outline: { selectedObjects: [model.scene], visibleEdgeColor: 0xffdd44 },
});
picking.on("click", ({ intersection }) => {
  effects.outline!.selectedObjects = intersection ? [intersection.object] : [];
  if (app.state !== "running") app.render();
});
// 模型移除前：effects.outline!.selectedObjects = [];
// effects.dispose(); // 同时释放所有效果。
```

PostprocessingOptions 至少指定 bloom 或 outline，只分配指定的 pass。PostprocessingHandle 提供可选原生 bloom/outline、disposed、dispose，整个效果链共用独占管线和 scope。顺序固定为 RenderPass → OutlinePass（若有）→ UnrealBloomPass（若有）→ OutputPass；描边可参与泛光，不做独立模块自动合并。attachBloom 继续兼容。

OutlineOptions：selectedObjects=[]，按数组快照借用对象；edgeStrength=3、edgeThickness=1、edgeGlow=0、enabled=true。强度/光晕非负有限，粗细在 r187 核范围 [1,4]；可选 visibleEdgeColor/hiddenEdgeColor 为 0..0xffffff 整数，否则沿用原生颜色。返回 pass 可调整选择、enabled 和参数，应用保证直接修改值有效，不手动 dispose 自有 pass。

消费者移除模型时清空选择，模块释放也清空 selectedObjects，不接管场景资源。原生描边失败时恢复绘制前场景 background、overrideMaterial 和 visible 快照，成功时保留应用有意变动；有选择时多一次遍历及 Map 成本。resize/render 中重入拒绝，操作中释放延后到原生调用返回。resize 失败停止宿主并保持待同步状态，下次 resize 或绘制前重试，不用半更新目标继续绘制；其余颜色、浮点目标、MSAA 和资源边界同泛光。

沿用原生组/网格选择，不提供单个 instanceId 描边、透明图案级遮罩或完整骨骼/morph 验收。pulsePeriod 默认 0，直接开启原生脉冲使用墙钟，不受宿主 delta 暂停保证。原生 pass 可能保留 CPU 引用，应用应解除不再需要的引用。

## 颜色滤镜

既有 postprocessing 入口增加 colorAdjustment，可单独使用或与泛光/描边组合：

```ts
import { attachPostprocessing } from "@adui/three/postprocessing";

const effects = attachPostprocessing(app, {
  bloom: { strength: 0.6, threshold: 1 },
  colorAdjustment: { brightness: 0, contrast: 0.15, hue: 0, saturation: -1 },
});
// 灰度恢复：effects.colorAdjustment!.hueSaturation.uniforms.saturation!.value = 0;
```

复用官方 BrightnessContrastShader / HueSaturationShader，两个ShaderPass放在描边/泛光之后、唯一OutputPass之前，在线性空间调整。brightness/hue默认0，范围[-1,1]；contrast/saturation默认0，范围[-1,1)，Float32量化后也必须小于1，避免原生shader除零；enabled默认true。句柄colorAdjustment暴露brightnessContrast/hueSaturation原生pass，动态uniforms需保持合法范围；可切换pass.enabled旁路，释放仍由整个后处理句柄负责。每条链独立uniforms，无第二composer或循环。
