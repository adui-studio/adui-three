# 渲染配置与统计

## 渲染统计与监视

```ts
import { captureRenderStats, attachRenderMonitor } from "@adui/three/rendering";

const stats = captureRenderStats(app); // 不绘制、不重置原生计数。
console.log(stats.drawCalls, stats.geometries, stats.estimatedBytes);
const monitor = attachRenderMonitor(app, {
  sampleInterval: 0.5, // 秒；0表示每次成功完成绘制都通知。
  onSample: ({ fps, frameIntervalMs, stats }) => {
    // 同步通知；只按需更新界面，避免逐帧日志。
    console.log({ fps, frameIntervalMs, drawCalls: stats.drawCalls });
  },
});
app.start();
// 暂停后需要当前值时：monitor.read()；不会触发绘制或 onSample。
// monitor.dispose()；也会随宿主或 options.scope 结束。
// 销毁后 monitor.snapshot 仍保留最后一份纯数据，read() 拒绝。
```

RenderStats 为冻结快照，包含 rendererType/backend/state、独立 CSS viewport、原生 autoReset，以及 drawCalls、triangles、lines、points、geometries、textures、programs、estimatedBytes。缺失或无效指标为 null，不伪造为0。节点 drawCalls 与 WebGL render.calls 映射为同一字段；节点 render.calls 是累计 render 次数，不能当作 draw calls。

原生计数遵循当前 renderer 的重置窗口；多 pass 可能只保留最后一次调用，节点还有自身统计节奏，不能把这些数值当整帧 pass 汇总。API 不调用 info.reset、不改 autoReset、不包裹 renderer.render。资源字节仅复制原生 tracked-resource 估算，WebGL 未提供时为 null，不等于显卡占用或泄漏证明。

RenderMonitorSample 提供 draws（含 renderOnce 的宿主完成次数）、capturedAt（画布窗口 performance 时间原点的毫秒）、fps、frameIntervalMs 和 stats。FPS 使用墙钟观测窗口，不用被 maxDelta 截断的模拟步长；不是屏幕呈现帧率或 CPU/GPU 执行耗时。首帧、暂停、手动绘制、隐藏/零尺寸显式读取重建窗口，未形成窗口时为 null。

snapshot 在每次成功完成绘制后更新，onSample 默认0.5秒通知一次；暂停时不会新增 RAF 或定时器，snapshot 保留最近观测，需要当前状态可调用 read。同步回调异常沿宿主完成回调策略传播，回调中可安全 dispose；销毁仅解除自己的订阅，保留最后快照。设计见 [ADR-0055](../adr/0055-render-statistics.md)，正式示例及 website 双实例可展开“渲染统计”。

## Editor 效果配置基准

WebGL / WebGPU 共用 attachRendererSettings、配置及释放方式。两种原生 renderer 均在绘制结束后交接 tone mapping 与 exposure；Room 使用对应的 PMREM 实现。

可选 rendering 入口采用 [r187 Editor 配置](https://github.com/mrdoob/three.js/blob/r187/editor/js/Config.js) 的 Neutral/曝光1/PCF/抗锯齿，以及其 Renderer 面板的反向深度选项；WebGL 的反向深度仍需设备支持 EXT_clip_control。显式应用，不改变普通 ThreeApp 的默认配置：

```ts
import { ThreeApp } from "@adui/three";
import { createEditorRenderPreset, attachRendererSettings } from "@adui/three/rendering";
import { createRoomEnvironment, attachEnvironment } from "@adui/three/environment";

const preset = createEditorRenderPreset();
const app = await ThreeApp.create(container, { renderer: { type: "webgpu", ...preset.renderer } });
const colors = attachRendererSettings(app, preset.color);
// 阴影按上节 attachShadowLight 配置 caster/receiver，type 使用 preset.shadows.type。
colors.configure({ toneMapping: "agx", exposure: 1.5 });

const room = createRoomEnvironment(app); // 显式 GPU 生成，默认 sigma=.04、size=256
const binding = attachEnvironment(app, room); // 只绑定光照；background:true 可同时作背景
app.renderOnce();
// binding.dispose() 只解绑；room.dispose() 先解绑再释放自有 cube target。
// colors.dispose() 恢复仍匹配的原生色调/曝光；以上对象也随宿主自动清理。
```

toneMapping 支持 none、linear、reinhard、cineon、aces-filmic、agx、neutral；曝光有限且在0..10。none 遵循原生行为，曝光不参与输出。颜色句柄每 renderer 独占，可选 scope；configure 部分更新，settings 返回独立的已应用快照。绘制中配置等管线临时状态恢复后应用；销毁跳过待应用更新并按值恢复。attach 在绘制期拒绝，避免保存 RenderPass 的临时状态。原生同值改写意图无法辨别；直接调用 renderer.render 需自行协调。

Room 复用 Three.js 原生 RoomEnvironment/PMREMGenerator，返回 EnvironmentAsset<Texture>，保留 HDR/EXR 的 EnvironmentAsset<DataTexture> 类型。sigma 允许0..1，size仅256/512/1024。生成不绑定、不启动宿主，禁止宿主绘制内调用；同一资产只能绑定到所属宿主。资产拥有返回的 WebGLCubeRenderTarget，纹理不可单独释放；临时 Room 与生成器在准备结束释放。状态恢复和已返回资源会清理；原生生成异常前未返回的部分分配不可由公开接口取得，不能承诺完全无残留。

lighting 现支持 basic/pcf/vsm 三种原生阴影；柔和边缘和接触效果还取决于场景尺度、灯光/材质与偏移。抗锯齿是 renderer 创建配置，不自动为离屏后处理添加 MSAA。本地 /?demo=editor 对照真实原生颜色和 Room，阴影场景共用同一 helper；没有实现 Editor 的全部功能、路径追踪或 WebGPU。
