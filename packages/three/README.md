# @adui/three

以生命周期为中心的 Three.js 场景宿主。当前为本地 MVP，版本 `0.0.0`，尚未发布 npm。采用 ESM，开发依赖固定 Three.js / @types/three `0.187.0`，peer 范围为 `>=0.187.0 <0.188.0`。

## 最小示例

在当前工作区通过 `workspace:*` 引用；容器需有明确尺寸。下面使用公开入口，应用自行组合原生 Three.js 对象。

```ts
import { ThreeApp } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import { BoxGeometry, Mesh, MeshNormalMaterial } from "three";

const container = document.querySelector<HTMLElement>("#scene")!;
const app = new ThreeApp(container);
const geometry = app.resources.track(new BoxGeometry());
const material = app.resources.track(new MeshNormalMaterial());
const cube = new Mesh(geometry, material);
app.scene.add(cube);

const { controls } = attachOrbitControls(app);
controls.enableDamping = true;
const unsubscribe = app.onUpdate(({ delta }) => {
  cube.rotation.y += delta;
});
app.start();

// 示例页面离开时清理；框架中请使用对应卸载钩子。
window.addEventListener(
  "pagehide",
  () => {
    unsubscribe();
    app.dispose();
  },
  { once: true },
);
```

## API

| API                                   | 契约                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `new ThreeApp(container, options?)`   | 同步创建自有 scene / PerspectiveCamera / WebGLRenderer，初始 ready，不自动运行                                   |
| `scene`, `camera`, `renderer`         | 只读对象引用，允许修改原生对象属性；不要替换引用或额外启动渲染循环                                               |
| `start(): void`                       | ready/stopped → running；重复调用无额外 RAF；disposed 后抛错                                                     |
| `stop(): void`                        | 取消循环，转 stopped；重复调用及 disposed 后调用安全                                                             |
| `onUpdate(callback): () => void`      | 同步帧回调，按注册顺序执行，返回幂等取消函数；同一函数可独立订阅多次                                             |
| `onAfterRender(callback): () => void` | 全部更新与成功渲染后同步执行；订阅、取消与生命周期规则同 onUpdate，适合 DOM 投影                                 |
| `resize(): void`                      | 同步读取容器 clientWidth/clientHeight 和 DPR，变化时才调整投影与绘制缓冲                                         |
| `size`, `state`, `signal`             | 尺寸快照、状态与销毁时 abort 的只读 signal                                                                       |
| `resources.track(resource)`           | 接管可 dispose 对象，返回原对象；同一 scope 内去重，不递归遍历                                                   |
| `resources.untrack(resource)`         | 解除登记，不释放，归还调用方所有权                                                                               |
| `dispose(): void`                     | 标记结束、取消 RAF、abort、清订阅/监听/observer、自有资源逆序释放、detach scene、释放 renderer/context 与 canvas |
| `attachOrbitControls(app)`            | 可选子入口；返回原生 controls 和幂等 dispose；自动随 app 释放，共享主循环                                        |

`ThreeAppOptions`：camera 的 fov/near/far/position 默认为 `50/0.1/1000/[3,2,5]` 并朝向原点；renderer 接受除 canvas/context 外的 WebGLRenderer 参数，默认 antialias=true；maxPixelRatio 默认 2；maxDelta 默认 0.1 秒。范围参数必须为有效正数，fov < 180，far > near，position 为三个有限数值。

`FrameInfo` 提供以秒计的 delta 和累计有效帧时间 elapsed；每次启动或自动恢复的首帧 delta=0，其余 delta 上限为 maxDelta。停止、隐藏文档、容器零尺寸期间不累计时间。页面隐藏或容器零尺寸时保留 running 状态，但不安排 RAF；恢复后自动继续。

新增订阅从下一帧执行；帧内取消立即生效；回调内 stop/dispose 阻止本帧 render。回调内 stop/start 会终止旧帧并只保留一个新循环。同步更新或 render 报错时先停止，再将异常交回浏览器，不吞错。

onAfterRender 在所有 onUpdate 完成并且 renderer.render 成功后执行，不依赖它与更新回调的注册先后。每个阶段开始时拍摄订阅快照；在该阶段内新增订阅下一帧执行，在更新阶段新增的渲染完成订阅可于本帧执行。stop/dispose/重启使本帧剩余回调失效；渲染失败跳过整个完成阶段，完成回调报错同样停止循环并抛出。手动调用 renderer.render 不会触发宿主订阅。

## 资源与边界

仅登记确实拥有的资源；借用或跨实例共享的 geometry/material/texture 不交给某个 app 独占管理。登记 Mesh 不自动登记 geometry/material/texture；纹理也不会随材质自动释放。多 app 共享资源时由外部所有者在最后一个使用者结束后统一释放。`ResourceScope` 可单独导入使用。

销毁幂等；清理过程中某项失败仍执行剩余清理，最终抛 AggregateError，不会在第二次 dispose 重试失败项。scope 销毁后 track 抛错。通用异步业务应检查 `app.signal.aborted` 并清理迟到资源；下述 glTF 加载器已封装这一契约。

要求现代浏览器、WebGL 2、ResizeObserver、matchMedia；仅构造实例时访问 DOM，Node 下可安全导入包，SSR 不能构造 renderer。容器建议不设 padding；尺寸基于 clientWidth/clientHeight，CSS transform 不改变绘制分辨率。运行中的 DPR 变化通过媒体查询和 window resize 检测。自有 canvas 的样式和生命周期由宿主管理，不接管外部 canvas。

`development` 条件导出指向随包包含的 src，便于 Vite 开发时 HMR；默认 import 导出指向 dist，类型来自 dist 声明。不提供 CJS、WebXR、WebGPU、composer、共享模型缓存或框架适配。

## GLTF / GLB 加载

```ts
import { loadGLTF } from "@adui/three/loaders";

const controller = new AbortController();
try {
  const model = await loadGLTF(app, "/models/example.glb", {
    signal: controller.signal,
    onProgress: ({ loaded, total, ratio }) => {
      // total / ratio 可能为 null；这里只是主文件字节，不包含所有依赖和解码。
      console.log({ loaded, total, ratio });
    },
  });
  // 默认已加入 app.scene；保留原始材质、坐标和尺寸。
  console.log(model.scene, model.gltf.animations);
  // 移除模型时调用 model.dispose()，也会自动随 app.dispose() 释放。
} catch (error) {
  if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
}
// 加载中取消使用 controller.abort()；加载成功后 signal 不再控制模型存活。
```

`LoadGLTFOptions` 提供 signal、addToScene（默认 true）、onProgress、closeImageBitmaps（默认 true）、onCleanupError、draco、meshoptDecoder 和 ktx2。addToScene=false 时保持 detached，但仍随 app 释放。URL 直接交给 GLTFLoader，可包含查询参数、data/blob URL，不按扩展名截取。失败保持原始错误；取消统一为 AbortError。

取消会立即拒绝 Promise 并阻止挂载，底层网络/解码可继续；迟到成功会被清理，迟到失败会被消费，不影响其他相同 URL 任务。任务在开始时登记进 app.resources，因此单独销毁该 scope 也会取消。正常完成后撤销取消监听，后续使用 `model.dispose()` 管理存活。

模型句柄提供 scene、完整 gltf、resources、disposed 和幂等 dispose。resources 是模型扩展 ResourceScope；dispose 先标记模型结束，调用扩展清理，再 detach 并释放所有返回 scenes 的自有节点、geometry、material、texture 和 skeleton 快照。扩展失败仍继续释放资产，最终聚合错误。只销毁 model.resources 不会移除模型；可用于清理与模型绑定的动画或自定义句柄。快照不接管之后加入的外部对象或新材质；共享克隆的资源存活期由调用方协调。loadGLTF 本身不创建 Mixer，动画需显式接入下节子入口。

默认只对加载开始、完成和释放时都未启用 Three.js 全局 Cache 的图像 backing 执行 close；纹理本身仍 dispose。缓存图像归缓存所有者管理。若外部共享 ImageBitmap，设置 closeImageBitmaps=false；不要在进行中的加载间切换全局 Cache 开关。本库不修改 Cache 或 abort 共享的底层请求。

清理失败继续释放其他资源并抛 AggregateError。若 Promise 已因取消/回调异常拒绝，迟到清理失败通过 onCleanupError(error) 报告；未传时写 console.error。原生解析失败中未返回的局部资源无法由本 API 完整回收；持有 disposed gltf 仍可保留 CPU 数据，应用应释放不再需要的引用。

当前支持普通及显式配置 Draco/Meshopt/KTX2 的 glTF 2.0 / GLB；未接入外部插件/loader、自动居中或资产缓存。演示使用原创 PNG 与 KTX2 纹理样例，提供加载、取消、移除和失败反馈。

## 压缩模型

```ts
import { loadGLTF } from "@adui/three/loaders";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const compressed = await loadGLTF(app, "/models/draco.glb", {
  draco: { decoderPath: "/decoders/draco/", workerLimit: 1 },
});
const meshopt = await loadGLTF(app, "/models/meshopt.glb", { meshoptDecoder: MeshoptDecoder });
```

draco 选项的 `DracoOptions.decoderPath` 必填：非空且以 / 结尾的目录，或 `{ js, wasm }` 两个非空 URL 字符串，需与所用 Three.js 版本一致。workerLimit 默认 1，必须为正整数。Vite 可直接使用 r187 URL 对，避免依赖固定输出文件名：

```ts
import js from "three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url";
import wasm from "three/addons/libs/draco/gltf/draco_decoder.wasm?url";

const model = await loadGLTF(app, "/models/draco.glb", {
  draco: { decoderPath: { js, wasm } },
});
```

库没有默认 CDN，也不附带解码器二进制；应用负责托管、许可证和部署策略。没有配置 Draco 时不创建实例；配置后仅在实际需要时由原生 loader 请求文件，不预加载。URL 对使用 WebAssembly；纯 JS 回退、Worker/Blob/WASM 部署限制与目标浏览器需自行验证。

Draco 实例由单次任务拥有，普通成功/失败后释放。signal、宿主销毁或进度回调异常是逻辑取消，底层加载/解码可以继续，此时等原生 loadAsync 结束再释放 Worker，迟到模型仍清理。每任务独立初始化有额外成本，workerLimit 不是全局限流。解码器清理错误也通过 onCleanupError 报告（未传则 console.error），不撤销已交付模型或替换原始失败。

meshoptDecoder 接受与原生 setMeshoptDecoder 相同的模块类型，保持借用，不调用 useWorkers 或清理其 Workers；应用管理其共享存活期。模块可按需动态导入。缺失解码器、文件 404 与解码失败会正常拒绝，可随后重新加载。当前浏览器样例实测 KHR_draco_mesh_compression 和 EXT_meshopt_compression。

## 相机取景

```ts
import { computeObjectFrame, fitObject } from "@adui/three/camera";

const plan = computeObjectFrame(app.camera, model.scene, { padding: 1.2 });
const frame = fitObject(app, model.scene, { padding: 1.2 });
// 已有 OrbitControls 时，传 controls: orbitHandle.controls，复用同一控件。
console.log(plan.bounds, frame.center, frame.position, frame.near, frame.far);
```

computeObjectFrame 更新目标及祖先/后代世界矩阵，按世界 AABB 的包围球计算中心、半径与相机位置，不改变相机姿态或裁剪面。返回 `ObjectFrame` 的 bounds/center/position 是独立快照；隐藏后代也纳入边界，原生实例/批处理边界需由应用保持有效。空/零/非有限边界和超出数值精度的取景拒绝。

`ObjectFrameOptions`：padding 默认 1.2、有限且 >=1；minimumDistance 默认 0、有限非负；direction 可指定从中心指向相机的非零世界向量，默认保持当前视线方向。计算同时考虑垂直 FOV、aspect 对应的水平 FOV 和 zoom。包围球方案会留空白，不自动改变模型位置/尺寸，不保证最紧凑构图，也不覆盖着色器位移。

fitObject 使用当前 app.camera 和尺寸立即应用；支持宿主 ready/stopped/running，零尺寸、宿主或 resource scope 销毁后拒绝。支持未挂父节点、无缩放、自动矩阵且无 view/filmOffset 的透视相机。默认 adjustClipping=true，设置推荐 near/far；它们针对当前目标，其他物体可能被裁剪。设 false 时保留现有裁剪面，并先检查能否容纳整个取景球。

传入 `FitObjectOptions.controls` 时必须属于当前相机。遵守 minDistance，maxDistance 或 cursor/目标半径约束无法容纳时写入前拒绝；不修改这些限制。控件角度限制仍生效，返回 position 反映最终位置。通过公开 update(0) 先消耗残余惯性，再同步相机/target；临时关闭的 damping/autoRotate 标志始终恢复。原生 change 回调会执行，回调中销毁宿主阻止后续取景写入；同相机重入拒绝。消费者回调抛错时，不承诺回滚原生更新已产生的变动。

两个函数不创建循环、资源句柄、订阅或自动播放/启动，也不直接 render。暂停时应用若希望立即显示，可显式 render 一次并更新标签；演示使用这一方式。旋转、动画、resize 或模型替换后，按需重新调用取景。相机过渡、正交/父级/偏轴相机留后续，详见 [ADR-0007](../../docs/adr/0007-camera-framing.md)。

## KTX2 纹理模型

```ts
import { loadGLTF } from "@adui/three/loaders";

const model = await loadGLTF(app, "/models/ktx2.glb", {
  ktx2: { transcoderPath: "/decoders/basis/", workerLimit: 1 },
});
```

`KTX2Options.transcoderPath` 必填，接受以 / 结尾的非空目录，目录内需有 basis_transcoder.js 和 basis_transcoder.wasm；也支持 `{js,wasm}` 显式 URL 对。版本与应用的 Three.js 一致。workerLimit 默认 1，须为 1–32 整数，是每任务上限。Vite 示例：

```ts
import js from "three/addons/libs/basis/basis_transcoder.js?url";
import wasm from "three/addons/libs/basis/basis_transcoder.wasm?url";

const model = await loadGLTF(app, "/models/ktx2.gltf", {
  ktx2: { transcoderPath: { js, wasm } },
});
```

库按当前 app.renderer 检测转码格式；支持的设备使用 GPU 压缩纹理，否则原生转码器可回退 RGBA，不能一概承诺节省显存。色彩空间、UV 和 mip 沿用资产与原生加载器。没有默认 CDN 或预加载，普通模型无 Basis 请求；应用负责本地 JS/WASM、Worker/Blob/WebAssembly 部署策略与许可。主包不附带二进制。

任务拥有 KTX2Loader；取消/宿主销毁后，等原生加载及已开始转码结束再清理 Worker/Blob URL，迟到模型不挂载。解析输入会复制，防止同 URL 合并/缓存请求在不同任务间共享纹理或转移原缓冲；有相应 CPU/内存成本。正常纹理交给模型快照，失败且未移交的 KTX2 纹理由适配层释放；不改全局 Cache。多个并行实例可能保留原生性能提示，当前没有共享转码池。

KTX2 文件/解析失败会拒绝并清理结果，避免原生吞掉纹理错误后返回缺贴图模型；清理错误仍通过 onCleanupError 报告。已开始的原生请求/Worker 永不完成时，不能保证按时结束清理。具体契约见 [ADR-0006](../../docs/adr/0006-ktx2-lifecycle.md)。实测 ETC1S/BasisLZ 的 GLTF/GLB、真实压缩上传及禁用压缩扩展时的 RGBA 回退；独立 KTX2 纹理 API、UASTC/HDR/数组/立方纹理和完整 GPU 格式矩阵仍留后续。

## 模型动画

```ts
import { attachGLTFAnimations } from "@adui/three/animation";

const model = await loadGLTF(app, "/models/animated.glb");
const animations = attachGLTFAnimations(app, model);
animations.play("Lift", { loop: "repeat", timeScale: 1 });
// animations.pause(); animations.resume();
// animations.play("Slide", { loop: "once", clampWhenFinished: true });
// animations.stop(); // 恢复 Mixer 绑定属性原值，并清除当前片段。
// animations.dispose(); // 只清理动画，模型仍可使用。
```

返回 `GLTFAnimationsHandle`，包含 mixer、clips、action、state、disposed 和 play/pause/resume/stop/dispose。构造时不自动播放或启动宿主；clips 是原生片段引用的只读数组快照，空列表也可创建。play 按非负整数索引或唯一完整名称选择，未知/歧义名称、越界、非正有限 duration、无效 tracks 拒绝并保留原播放；原生 clip.validate 可能输出诊断。播放期间不要修改片段数据。

play 选项：loop="repeat"（默认）或 "once"；clampWhenFinished=true（默认）；timeScale=1（正有限倍速）。重复播放同一片段也从零开始；切换立即停止旧 action，不做淡入淡出。调用时采样首帧，后续由宿主 onUpdate(delta) 驱动；宿主停止/隐藏/零尺寸期间不前进，恢复首帧 delta=0。pause/resume 保持姿态、时间和配置的速度，不改变宿主或 mixer.timeScale；idle/finished 时无操作。

state 为 idle/playing/paused/finished/disposed，描述控制器状态；once 结束进入 finished，clamp=true 保留末姿态，false 按原生 binding 规则恢复未被其他 action 使用的属性。stop 恢复绑定属性、清空 action 和 Mixer 时间；停止、暂停时可再次 play。销毁后 play/pause/resume 抛错，stop/dispose 幂等。

句柄同时登记 app.resources 与 model.resources，任意所有者结束都会取消订阅、停止 action 并 uncacheRoot，不释放模型资产。原句柄缓存清理完成前，同一根对象不能再创建句柄。原生 loop/finished 事件中调用控制方法会在本次 Mixer 更新返回后执行；dispose 先失效并丢弃排队命令，延后清缓存。若事件中移除模型，GPU 资产可能先释放，CPU 采样结束后再完成缓存清理；不会重新挂载模型。

mixer/action 可查询及配置参数；采样、action 调度和缓存由句柄管理，不要再手动 update/play/stop/uncache 或为同一属性添加竞争写入者。业务注册的原生事件监听自行移除；持有句柄/mixer 引用仍可保留 CPU 模型。本入口不引入 GLTFLoader 运行时代码，不提供 seek、反向、混合、骨骼重定向或状态机。浏览器原创样例只验证节点动画，骨骼/morph 与复杂资产仍需专门验证。

## 对象拾取

```ts
import { attachPicking } from "@adui/three/interaction";

const picking = attachPicking(app, {
  objects: () => [cube], // 每次拾取重新读取，可返回当前 model.scene。
  recursive: true,
  dragThreshold: 4,
});
const off = picking.on("click", ({ intersection, originalEvent }) => {
  console.log(intersection?.object ?? null, originalEvent.pointerType);
});
picking.on("hover", ({ intersection }) => {
  console.log("当前悬停", intersection?.object ?? null);
});
const nearest = picking.pick(100, 200); // 与 PointerEvent.clientX/clientY 相同的 CSS 坐标。
// picking.raycaster 可配置 layers、near/far、点线阈值。
// off() 取消单次订阅；picking.dispose() 或 app.dispose() 统一清理。
```

`PickingOptions` 必填 objects getter；recursive 默认 true；dragThreshold 默认 4，必须为非负有限数，单位为 CSS 像素。返回 `PickingHandle`：raycaster、disposed、pick、on、dispose。只报告最近交点，保留原生 Intersection（包括实际子对象和 instanceId）；不把命中改成注册的根对象，不提供冒泡/阻止传播协议。

按画布 getBoundingClientRect 换算 NDC，不乘 DPR；支持页面偏移、滚动和轴向 CSS 缩放，不支持 CSS 旋转/倾斜。零尺寸、非有限坐标、画布外返回 null。拾取前更新相机与目标世界矩阵；ready/stopped 状态也可使用。目标或祖先 visible=false 的交点会被过滤，其余沿用原生 CPU raycast、材质面朝向和 raycaster layers 规则；不等同 GPU 可见像素，不解析透明贴图、遮挡的非目标对象或 shader 顶点位移。

click 在主指针左键/单指按下和抬起命中同一个对象时同步触发，两次都为空也触发 null。期间任意移动超过阈值即取消，回到原处也不恢复；离开、取消、失焦、第二指针介入会取消本次点击。不调用 preventDefault、指针捕获或独立 RAF，可与 OrbitControls 共存。触摸滚动策略由应用/控制器设置。

hover 仅在无按钮的主鼠标/笔 pointermove 导致最近对象改变时触发，pointerleave/pointercancel 触发 null；触摸没有悬停。静止指针下物体运动、目标替换不会主动刷新，下一次指针事件重新判断；失焦重置内部状态，销毁不额外派发事件。业务选择状态、光标和高亮由应用管理。

on 返回幂等取消函数，同一回调可独立订阅多次；派发中新订阅下一次生效，取消或销毁立即生效，回调异常交给浏览器。手动或宿主/scope 销毁移除监听，不释放借用目标。销毁后 pick/on 抛错，dispose 幂等。包导入没有 DOM 副作用。

## DOM 标签

标签是屏幕空间的 HTML 投影，不改变目标对象或模型场景树。先在容器中建立与画布重合的覆盖层：

```html
<div id="scene" style="position: relative; height: 400px;">
  <div id="labels" style="position: absolute; inset: 0; z-index: 1; pointer-events: none;"></div>
</div>
```

```ts
import { ThreeApp } from "@adui/three";
import { attachDOMLabels } from "@adui/three/labels";
import { Object3D } from "three";

const app = new ThreeApp(document.querySelector<HTMLElement>("#scene")!);
const target = new Object3D();
app.scene.add(target);
const labels = attachDOMLabels(app, document.querySelector<HTMLElement>("#labels")!);
const element = document.createElement("span");
element.textContent = "设备 A"; // 样式和内容由应用设置。
const label = labels.add({ object: target, element, offset: [0, 1, 0] });
app.start();

// label.offset.set(0, 2, 0); label.visible = false;
// 停止期间修改位置/相机/visible 后，调用 labels.update()。
// label.dispose() 单个移除；labels.clear() 清空后仍可添加。
// labels.dispose() 或 app.dispose() 清理整个标签层。
```

overlay 必须与 canvas 属于同一 document，设置 position 为 relative/absolute 等定位方式，且无 border、padding 或滚动条。应用负责 overlay 的布局和移除；库仅创建并移除其中的自有根层与包装节点，不改写 overlay、标签内容的样式，不删除借用目标。可在同一场景创建多个独立标签层，不共享 DOM 元素。

`DOMLabelOptions`：object、element 必填；offset 是目标局部坐标，默认 [0,0,0]；anchor 为标签自身的归一化锚点，默认 [0.5,1]（底部居中），各值必须位于 [0,1]；interactive 默认 false。添加时元素须未挂载、未被其他标签占用且来自 canvas document；不会克隆、解析 HTML 或挂载框架组件。移除后元素脱离包装节点，可复用；应用自行解除内容监听、卸载 Vue/React 组件和释放其他业务引用。

`DOMLabelHandle` 提供只读 object/element/offset 引用、可变 Vector3 offset、visible、disposed 与幂等 dispose。`DOMLabelsHandle` 提供 add、update、clear、disposed、dispose。运行时每次成功渲染后更新位置；ResizeObserver 在 ready/stopped 状态也响应尺寸变化，无独立 RAF。销毁后 add/update 抛错，clear/dispose 可重复调用；清理异常继续执行其余步骤并聚合抛出。

投影使用 CSS 坐标，不乘 DPR，支持偏移、滚动和正向轴向缩放；不支持 CSS 旋转、倾斜或镜像。零尺寸、锚点在相机背后/近远面外/视野外、目标脱离 app.scene、目标或祖先隐藏、目标与 camera layers 不相交时隐藏标签。visible=false 只控制该标签，恢复显示需更新。标签没有深度遮挡、透视缩放、距离排序、自动避让或 CSS3D；重叠按 DOM 顺序绘制，标签内容可能被覆盖层边缘裁剪。

默认包装节点 pointer-events:none，让指针进入下方画布；interactive=true 使用 auto，内容可用原生按钮、键盘及 DOM 事件。内容显式设置 pointer-events 可覆盖继承值，应用需协调 CSS；非交互内容不应包含可聚焦控件。库不代管光标、业务事件，也不阻止标签事件向 DOM 祖先冒泡。

## 开发与验证

根目录运行 `pnpm run dev` 打开双实例演示，`pnpm run ready` 执行静态检查、文档和单元测试及构建，`pnpm run test:browser` 验证构建后演示的实际 WebGL 行为。首次浏览器测试前运行 `pnpm exec playwright install chromium`。完整契约和验证范围见仓库 docs/SDD.md 与 docs/HARNESS.md；npm 安装包不包含仓库工程文档。
