# Editor 渲染基准

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
