# @adui/three

以生命周期为中心的 Three.js 场景宿主。当前为本地 MVP，版本 `0.0.0`，尚未发布 npm。采用 ESM，开发依赖固定 Three.js / @types/three `0.187.0`，peer 范围为 `>=0.187.0 <0.188.0`。

先从下面的最小示例运行场景，再按需组合子入口：

- 宿主：[生命周期 API](#api)、[正交相机](#正交相机)、[资源归属](#资源与边界)、[绘制管线](#绘制管线与单次绘制)。
- 相机：[自动取景](#相机取景)、[平滑过渡](#相机平滑过渡)、[保存和恢复视角](#保存和恢复视角)。
- 模型：[资产复用](#复用模型资产)、[压缩解码](#压缩模型)、[动画](#模型动画)、[路径运动](#对象路径运动)、[实例化网格](#实例化网格)、[世界边界](#对象世界边界)。
- 交互：[拾取](#对象拾取)、[DOM 标签](#dom-标签)、[变换手柄](#对象变换手柄)、[截图](#截图)。
- 外观：[图片纹理](#独立图片纹理)、[KTX2 纹理](#独立-ktx2-纹理)、[HDR 环境](#hdr-环境)、[EXR 环境](#exr-环境图)、[泛光和描边](#选择描边与组合效果)。

## 最小示例

在当前工作区通过 `workspace:*` 引用；容器需有明确尺寸。下面使用公开入口，应用自行组合原生 Three.js 对象。

应用直接安装 `three@0.187.0`；TypeScript 应用若直接导入 Three.js 对象，另将 `@types/three@0.187.0` 列为自己的开发依赖。库携带的类型依赖供库声明解析使用，pnpm 的隔离布局不会保证应用可以直接访问它。独立 tarball 安装及 NodeNext/Bundler 类型解析由仓库 `pnpm run test:package` 验证。

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

renderer 配置在 DOM/GPU 分配前快照。类型 Omit 不阻止更宽的原生参数变量，运行时同样拒绝非空 canvas/context，null/undefined 字段丢弃且不修改原对象；renderer 本身不能是 null、数组或非对象。其他 getter 各读取一次，其后输入改写不进入 native 构造。两类宿主均只拥有自己创建的 canvas/WebGL 上下文；见 ADR-0002 的补充。

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

## 正交相机

```ts
import { OrthographicThreeApp } from "@adui/three";

const app = new OrthographicThreeApp(container, {
  camera: { frustumHeight: 10, near: 0, far: 1000, position: [0, 0, 10] },
});
app.camera.zoom = 2;
app.camera.updateProjectionMatrix();
app.render();
```

OrthographicThreeApp.camera 精确为 OrthographicCamera；默认 ThreeApp.camera 继续为 PerspectiveCamera。两者共享单循环、尺寸/DPR、资源、绘制管线和上下文丢失策略，均不会自动启动。frustumHeight 是未缩放的竖向世界单位跨度，必须正且有限；正交 near 可为 0，far 必须有限且大于 near。默认参数见示例，默认看向原点；renderer/maxPixelRatio/maxDelta 与 ThreeApp 相同。

改变容器尺寸时保留当前 top/bottom、水平中心和 zoom，仅按 CSS 宽高比更新左右边界；DPR 不改变取景。直接修改相机后仍需 updateProjectionMatrix，未变尺寸的 resize 不负责更新修改。零尺寸暂停，投影/缓冲失败可在修复参数后 resize/render 重试。原生 view offset 由应用管理。

通用扩展可用 AnyThreeApp 借用两种宿主；controls、模型/纹理加载、动画、拾取/标签、后处理、截图与实例化入口均接受此类型。camera 的正交即时/平滑取景采用独立命名接口，既有透视接口保持原类型。演示服务 `/?demo=orthographic` 比较深度、缩放、拾取/标签和放大模型后的取景。

正交演示还可开启“组合效果”，点击对象后观察描边，并分别旁路泛光/描边或释放整条链；复用既有 postprocessing，不增加库入口。效果在暂停、resize/零尺寸恢复和宿主重建中保持各自所有权。

## 绘制管线与单次绘制

`app.render()` 显式绘制一次：ready/stopped/running 可用，不执行 onUpdate、不启动 RAF、不累计时间；成功后执行 onAfterRender，传入 delta=0 与上次有效 elapsed。隐藏/零尺寸时无操作，销毁后抛错；更新、绘制和完成回调中重入拒绝。绘制/完成错误仍使宿主停止并重新抛出。

```ts
import type { RenderPipeline } from "@adui/three";

const pipeline: RenderPipeline = {
  resize: ({ width, height, pixelRatio }) => {
    // 同步自有管线的 CSS 尺寸和封顶 DPR；零尺寸时避免分配零大小渲染目标。
  },
  render: ({ delta }) => {
    // 例如 composer.render(delta)，代替本帧默认绘制。
  },
};
const detach = app.setRenderPipeline(pipeline);
app.render();
detach(); // 恢复原生绘制，不释放 pipeline；资源由其所有者管理。
```

同一宿主仅能挂接一个管线；重复挂接先拒绝。挂接立即调用 resize(app.size)，之后在尺寸/DPR 改变或失败待重试时调用，包括暂停和零尺寸。初始化失败释放槽位；resize 错误停止宿主并抛出。返回解除函数幂等，旧函数不影响后来的管线；app.dispose 解除引用，不调用借用管线的 dispose。通过 app.resources 显式登记自有清理句柄。不要为管线创建新 RAF 或覆盖 renderer.render；直接调用原生 renderer.render 仍绕过宿主管线和 onAfterRender。

原生投影/绘制缓冲或管线 resize 失败均停止宿主，分别保留待同步状态；再次同尺寸 resize 或 app.render 前先重试缓冲、再同步管线。零尺寸保留待恢复状态；不回滚已写原生副作用。尺寸处理中（含初次管线通知）禁止递归 resize、render 或重挂接管线，需等待回调结束再显式绘制。

## 资源与边界

仅登记确实拥有的资源；借用或跨实例共享的 geometry/material/texture 不交给某个 app 独占管理。登记 Mesh 不自动登记 geometry/material/texture；纹理也不会随材质自动释放。多 app 共享资源时由外部所有者在最后一个使用者结束后统一释放。`ResourceScope` 可单独导入使用。

销毁幂等；清理过程中某项失败仍执行剩余清理，最终抛 AggregateError，不会在第二次 dispose 重试失败项。scope 销毁后 track 抛错。通用异步业务应检查 `app.signal.aborted` 并清理迟到资源；下述 glTF 加载器已封装这一契约。

要求现代浏览器、WebGL 2、ResizeObserver、matchMedia；仅构造实例时访问 DOM，Node 下可安全导入包，SSR 不能构造 renderer。容器建议不设 padding；尺寸基于 clientWidth/clientHeight，CSS transform 不改变绘制分辨率。运行中的 DPR 变化通过媒体查询和 window resize 检测。自有 canvas 的样式和生命周期由宿主管理，不接管外部 canvas。

`development` 条件导出指向随包包含的 src，便于 Vite 开发时 HMR；默认 import 导出指向 dist，类型来自 dist 声明。不提供 CJS、WebXR、WebGPU、URL 模型缓存或框架适配；显式模型实例按下述租约共享资产。

## 实例化网格

受管理矩阵/颜色在首次实际上传后只标记 16/3 个 Float32 组件。每属性合并为一个待传包络，可能包含稀疏修改之间的未变槽位；公开 onUpload 确认上传并清范围，同时保留既有回调。检测到外部 needsUpdate 版本变化或回调替换则保守回退完整上传，避免混合原生写入丢失；直接数组修改仍由调用者标记上传。没有每帧监听或额外 draw，详见 ADR-0022 的补充。

```ts
import { createInstancedMesh } from "@adui/three/geometry";
import { BoxGeometry, MeshBasicMaterial, Matrix4, Color } from "three";

const geometry = app.resources.track(new BoxGeometry());
const material = app.resources.track(new MeshBasicMaterial());
const instances = createInstancedMesh(app, { geometry, material, capacity: 100 });
instances.setMatrixAt(0, new Matrix4().makeTranslation(2, 0, 0));
instances.setColorAt(0, new Color(0xff0000));
instances.setCount(1);
app.render();
instances.dispose(); // 不释放借用的 geometry/material
```

capacity 是正整数，count 默认 0 且不能超过容量；支持预填尚未激活的槽位。setMatrixAt 复制有限 Float32 仿射矩阵，量化后行列式必须有限且大于零；不支持零缩放或反射。setColorAt 复制非负有限 Float32 线性 RGB。写入自动标记上传，矩阵/count 更新清空原生包围体；不启动循环或隐式绘制。拾取结果保留原生 instanceId。

handle 拥有节点、实例属性、morphTexture 和扩展 resources，登记宿主 scope 并幂等清理；几何体、材质/纹理和外来子节点由调用方管理。material 数组快照列表，addToScene 可设 false，仍由宿主结束清理。公开 mesh 可作原生配置；直接替换自有 buffer 或绕过 helper 改 count/矩阵时，由调用方负责上传、边界和所有权一致性。演示地址 `/?demo=instances`。

原生事件的异常仍遵循 Three.js 的派发语义：调用方在首次绘制前注册的 mesh dispose 监听若抛错，会阻断后续 renderer 监听，WebGL 实例 buffer 可能不能立即释放；BufferAttribute.dispose 在 WebGL 下不能补救这个路径。把会失败的自有清理登记到 instances.resources，避免从原生 dispose 监听抛错。若已经触发，调用方可移除出错监听后显式 mesh.dispose 让原生清理继续；handle.dispose 本身仍幂等且不会重试已结束的 handle。

## 对象世界边界

需要尺寸或中心时，可直接测量原生对象，无需创建宿主或相机：

```ts
import { computeObjectBounds } from "@adui/three/geometry";
import { Vector3 } from "three";

const bounds = computeObjectBounds(object);
const size = bounds.getSize(new Vector3());
const center = bounds.getCenter(new Vector3());
```

返回独立的世界轴对齐盒快照，单位由应用决定。包含隐藏子树和普通网格当前 CPU 骨骼/形变；刷新原生世界矩阵、蒙皮绑定逆矩阵及实例/批次包围盒缓存。实例/批次沿用保守原生盒，不承诺逐实例形变紧边界、shader 位移或实际可见像素尺寸。手动矩阵模式遵循原生更新开关。

函数不绘制、不推进动画、不上传数据或接管对象资源；按需调用，扫描成本取决于顶点/骨骼/实例数量。空或非有限边界抛 RangeError，零尺寸有效，非法对象抛 TypeError；同根同步重入拒绝，准备失败可能保留已更新的原生矩阵/缓存。

## 截图

```ts
import { captureFrame } from "@adui/three/capture";

const controller = new AbortController();
const image = await captureFrame(app, { type: "image/png", signal: controller.signal });
// 返回 Blob；按 image.type 决定文件后缀。Blob URL 和下载由应用自己管理。
```

type 默认 image/png，可选 image/jpeg / image/webp；quality 可选有限 [0,1]，由浏览器对有损格式解释，未指定时沿用浏览器默认值。若格式不支持可能回退 PNG，以实际 Blob.type 为准。原生编码失败/null、CORS SecurityError 和宿主绘制错误正常拒绝。

先 app.render，再在同一任务将当前实际 drawing buffer 复制到独立 Canvas 2D 后编码；不推进动画、改变宿主启停、相机或渲染配置，不需要 preserveDrawingBuffer。后续帧/resize 不改变已截取的像素；包含当前管线输出，不含 DOM 标签、CSS 背景和其他界面。输出是普通浏览器图像，默认 2D 色彩处理，不是原始 HDR、任意分辨率或 DOM 合成服务。

隐藏、零尺寸、上下文不可用或当前 render target 非默认时拒绝；自定义管线须确实输出画布。不要从宿主更新/绘制/完成阶段调用，单次绘制重入会拒绝。signal、宿主或 app.resources 结束立即逻辑取消，原生编码可能继续，迟到结果丢弃。任务拥有临时画布并清监听/登记、归零尺寸；Blob 交给应用后自行管理引用或 URL。截图有与像素数相关的 CPU/内存成本，没有后台计时器或第二循环。

### 导出局部画面

```ts
import { captureFrame } from "@adui/three/capture";
import type { CaptureRegion } from "@adui/three/capture";

const canvas = app.renderer.domElement;
const region: CaptureRegion = {
  x: 0,
  y: 0,
  width: Math.max(1, Math.floor(canvas.width / 2)),
  height: Math.max(1, Math.floor(canvas.height / 2)),
};
const cropped = await captureFrame(app, { region });
```

region 使用实际 drawing-buffer 像素，原点在画布左上角；x/y 必须是非负安全整数，宽高为正安全整数，不自动转换 CSS/DPR、缩放或裁去越界部分。省略时截取完整画布。区域数值在调用时复制，范围在本次 render 完成后按实际画布检查；越界 RangeError 发生在临时画布分配之前，但本次绘制可能已发生。输出宽高就是区域宽高；其余格式、取消、并发隔离和清理规则与完整截图一致。演示“截图范围”可选完整画面或中心区域。

## WebGL 上下文丢失

`app.contextLost` 初始 false；自有 canvas 收到原生 webglcontextlost 后设为 true 并完整 dispose，标记保留用于诊断。暂停、隐藏或 ready 状态同样结束；旧 canvas 的恢复事件不能复活宿主。普通主动 dispose 不把此属性设为 true。

```ts
app.signal.addEventListener(
  "abort",
  () => {
    if (app.contextLost) {
      // 更新业务提示；由应用选择创建新 ThreeApp、重新加载及恢复业务状态。
    }
  },
  { once: true },
);
```

当前策略是显式重建，避免 r187 已观察到的旧 GPU 对象在原生恢复后清理报错；不会透明替换已公开的 renderer 引用。自有资源、异步取消和清理错误沿用 dispose 契约，借用管线须自行登记所有权。其他宿主的模型实例继续持有共享资产租约，仍可渲染/播放；不保证硬件故障后能重建成功。

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

模型句柄提供 scene、完整 gltf、resources、disposed 和幂等 dispose。resources 是模型扩展 ResourceScope；dispose 先标记模型结束，调用扩展清理，再 detach 并释放局部节点/骨骼与共享资产租约。无实例时立即释放全部原始资产；存在 cloneGLTF 实例时延后到最后一个使用者结束。扩展失败仍继续清理并聚合错误。只销毁 model.resources 不会移除模型；快照不接管之后加入的外部对象或新材质。loadGLTF 本身不创建 Mixer，动画需显式接入子入口。

默认只对加载开始、完成和释放时都未启用 Three.js 全局 Cache 的图像 backing 执行 close；纹理本身仍 dispose。缓存图像归缓存所有者管理。若外部共享 ImageBitmap，设置 closeImageBitmaps=false；不要在进行中的加载间切换全局 Cache 开关。本库不修改 Cache 或 abort 共享的底层请求。

清理失败继续释放其他资源并抛 AggregateError。若 Promise 已因取消/回调异常拒绝，迟到清理失败通过 onCleanupError(error) 报告；未传时写 console.error。原生解析失败中未返回的局部资源无法由本 API 完整回收；持有 disposed gltf 仍可保留 CPU 数据，应用应释放不再需要的引用。

当前支持普通及显式配置 Draco/Meshopt/KTX2 的 glTF 2.0 / GLB；未接入外部插件/loader、自动居中或资产缓存。演示使用原创 PNG 与 KTX2 纹理样例，提供加载、取消、移除和失败反馈。

### 复用模型资产

```ts
import { loadGLTF, cloneGLTF } from "@adui/three/loaders";
import { attachGLTFAnimations } from "@adui/three/animation";

const source = await loadGLTF(app, "/models/animated.glb");
const instance = cloneGLTF(app, source); // 可传另一个 app；addToScene 默认 true。
instance.scene.position.x += 3;
const motion = attachGLTFAnimations(app, instance);
if (motion.clips.length) motion.play(0);
source.dispose(); // 实例继续拥有共享资产租约和自己的动画。
// instance.dispose()；也会随它所属的 app 释放。
```

同步复制调用时的默认 scene/姿态，不下载、不复制 parser 或其他 scenes。返回 GLTFInstance 的 scene、独立 animations、resources、disposed/dispose；可从存活实例继续 cloneGLTF。源句柄结束后不可再使用它克隆。实例不复制源的 Mixer、扩展 scope 或外部事件，不会自动播放、绘制或启动宿主。

节点、骨骼、inverse 矩阵、morph 权重、实例矩阵及轨道数据独立；UUID 轨道重绑到新节点，命名路径遵循原生语义。geometry/material/texture 按引用共享，改动会影响所有使用者，不能提前手动 dispose；共享材质属性动画不保证独立。所有骨骼须在被克隆树内，骨架重定向、插件和自定义 clone/copy 尚未承诺兼容。

局部节点/骨骼在各自句柄结束时释放；共享资产（整份原加载快照，含其他原始 scenes 的资产）到最后一个使用者结束后释放。跨宿主实例不会随源宿主销毁；加载后新增/替换的借用资源继续由外部管理，并须保证全部实例使用期间存活。cloneGLTF 仅接受本库创建的存活句柄；手动 Object3D.clone 的资源生命周期仍需应用自行协调。

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

蒙皮目标在计算前刷新所引用的骨骼世界矩阵（包括目标子树外的骨骼），并按原生 bindMode 更新绑定逆矩阵，再采样当前顶点。暂停后直接改变父级变换或骨骼姿态，也无需先渲染一帧才能正确取景；不修改骨骼 inverse-bind 数据、推进动画或创建骨骼 GPU 纹理。这不包含自定义顶点着色器位移。

两个函数不创建循环、资源句柄、订阅或自动播放/启动，也不直接 render。暂停时应用若希望立即显示，可显式 render 一次并更新标签；演示使用这一方式。旋转、动画、resize 或模型替换后，按需重新调用取景。相机过渡见下节；正交/父级/偏轴相机留后续，详见 [ADR-0007](https://github.com/adui-studio/adui-three/blob/main/docs/adr/0007-camera-framing.md)。

### 正交自动取景

```ts
import { computeOrthographicFrame, fitOrthographicObject } from "@adui/three/camera";

const plan = computeOrthographicFrame(app.camera, object, { padding: 1.2 });
const frame = fitOrthographicObject(app, object, { controls: orbit.controls });
console.log(plan.zoom, frame.distance);
app.render();
```

这里 app 为 OrthographicThreeApp，object 为借用 Object3D，orbit 为可选 OrbitControls 句柄。规划不写相机；应用设置位置/朝向、zoom 和默认推荐裁剪面，不改未缩放视锥、不绘制或启动场景。返回 OrthographicObjectFrame，包含世界边界、包围球、中心、位置、距离、near/far 及 zoom。采用保守包围球以容纳任意朝向，可能比最紧凑取景留白更多。

默认 padding=1.2（>=1）、minimumDistance=0；可指定世界 direction。相机需未挂父级、无缩放、自动矩阵且视锥居中，不支持 view offset；无效/空/退化边界拒绝。蒙皮准备包含子树外骨骼和当前绑定逆矩阵。控件必须属于该相机；不兼容的缩放、距离和目标限制先拒绝，保留调用方配置。adjustClipping=false 保留原生 near/far（near 可为 0），范围不足则拒绝。回调异常释放准备/应用写锁，恢复控件配置，但不回滚原生副作用。尺寸/对象改变后自行重新取景；shader 位移不属于 CPU 边界保证。

## 相机平滑过渡

```ts
import { transitionToObject } from "@adui/three/camera";

const motion = transitionToObject(app, model.scene, {
  controls, // 可选，当前相机的原生 OrbitControls
  duration: 0.8, // 正有限秒数，默认 0.8
});
app.start(); // 由应用决定；库不会自动运行宿主。
const result = await motion.finished;
if (result.status === "failed") console.error(result.error);
// motion.cancel(); 或 motion.dispose(); 幂等，不跳至终点。
```

选项继承 FitObjectOptions，另接受可选 AbortSignal signal，沿用即时取景的相机、边界与控件限制。目标是调用时快照，不跟随动画、变换或删除；模型移除时由应用取消，必要时可登记到 model.resources。duration 以宿主有效 delta 计时，固定 smoothstep；停止、隐藏或零尺寸期间暂停，恢复不补墙钟时间。无独立 RAF、render 或自动启停。

句柄提供只读 state（running/completed/cancelled/failed）、progress（未经缓动的 0..1）及 finished。finished 始终 resolve：completed 含 frame，cancelled 无 frame，failed 含 error；同步非法输入仍抛错，且在打断旧过渡前校验。更新回调异常清理并 resolve failed 后仍向宿主抛出，使宿主停止；清理异常聚合到 failed 结果。已 abort 的 signal 返回 cancelled 句柄。句柄自动登记 app.resources，cancel/dispose 与宿主清理均解除订阅。

无 controls 时插值位置及 quaternion；有 controls 时插值 target、轨道距离和最短方向旋转，原生角度限制继续生效。过渡期间 enabled、enableDamping、autoRotate 临时设 false，公开 update(0) 清惯性；结束仅恢复仍为 false 的属性，外部已改为 true 的值保留。不要同时安排其他相机写入者；在原生同步 change 事件中重入 fitObject/transitionToObject 会拒绝，可安全取消或销毁。

同相机新过渡或有效 fitObject 会取消旧过渡。有 controls 时画布 pointerdown/wheel 捕获阶段取消，不阻止同一事件交给恢复后的控件。外部尺寸、投影、姿态、控件约束或可观察配置变化，在下一次有效更新取消；暂停期间不轮询。取消保留当前姿态；adjustClipping=true 会先扩展裁剪面，只有完成才收紧，取消保留扩展范围。false 保留原裁剪面并检查终点可见范围。路径不避障、不保证中途完整可见；不提供独立暂停、正交/父级相机或自定义缓动。

### 正交平滑取景

```ts
import { transitionOrthographicToObject } from "@adui/three/camera";

const motion = transitionOrthographicToObject(app, object, {
  controls: orbit.controls,
  duration: 0.8,
});
app.start(); // 消费者明确决定运行；宿主暂停时过渡也暂停。
const result = await motion.finished;
if (result.status === "completed") console.log(result.frame.zoom);
```

沿用正交即时规划，按宿主 delta 插值姿态/轨道与 zoom，返回 CameraTransitionHandle<OrthographicObjectFrame>；原句柄/结果默认类型仍为 ObjectFrame。每相机最多一个过渡，无自动启动/绘制或独立时钟，finished 始终 resolve completed/cancelled/failed。支持 cancel/dispose、signal、替换、即时 fit、宿主/scope 结束及带控件的输入取消。

尺寸、视锥/zoom、姿态或控件缩放约束改写在下次更新取消；默认先扩裁剪、完成后收紧，near=0 有效，取消保留当前姿态/zoom。控件配置按值租用/恢复，即时取景先完成旧租约交接。目标改变后自行取消并重新规划，不保证过渡中全部可见或避障。

## 保存和恢复视角

```ts
import { captureCameraView, restoreCameraView } from "@adui/three/camera";

const saved = captureCameraView(app, { controls: orbit.controls });
const json = JSON.stringify(saved); // 消费者自行存储。
const actual = restoreCameraView(app, JSON.parse(json), { controls: orbit.controls });
app.render();
```

CameraView 是 version=1 的透视/正交联合快照，含独立 position/quaternion/up 数组、zoom、near/far，可选轨道 target；透视含 fov，正交含 top/bottom/centerX。没有场景、模型、userData 或 GPU 引用，可在原宿主结束后恢复到同类新宿主。恢复按当前 CSS 比例适配，保持垂直构图，不保存旧 aspect、renderer 或深度模式；类型字段只读不表示运行时冻结。

capture 不写相机、取消过渡或推进时间，零尺寸可用；restore 需要有效视口，完整校验后取消旧过渡，返回实际视图，不绘制或启动。只支持未挂父级、无缩放、自动矩阵且无 view/filmOffset 的相机，拒绝坏版本/数值/镜头范围。

带控件保存会记录 target，并要求无 roll、单位 up；带控件恢复需已有 target、同相机与相同 up。距离、正交缩放和目标限制先校验，原生角度限制可调整最终姿态。控件惯性通过公开 update 消耗，配置与共享写锁在异常后恢复；原生副作用不回滚。演示“保存视角 / 恢复视角”使用内存 JSON，库不访问 localStorage 或业务 Store。

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

KTX2 文件/解析失败会拒绝并清理结果，避免原生吞掉纹理错误后返回缺贴图模型；清理错误仍通过 onCleanupError 报告。已开始的原生请求/Worker 永不完成时，不能保证按时结束清理。具体契约见 [ADR-0006](https://github.com/adui-studio/adui-three/blob/main/docs/adr/0006-ktx2-lifecycle.md)。实测 ETC1S/BasisLZ 的 GLTF/GLB、真实压缩上传及禁用压缩扩展时的 RGBA 回退；独立二维 KTX2 见下文；UASTC/HDR/数组/立方纹理和完整 GPU 格式矩阵仍留后续。

## 模型动画

```ts
import { attachGLTFAnimations } from "@adui/three/animation";

const model = await loadGLTF(app, "/models/animated.glb");
const animations = attachGLTFAnimations(app, model);
animations.play("Lift", { loop: "repeat", timeScale: 1 });
// animations.pause(); animations.resume();
// animations.seek(0.5); // 精确定位到片段第 0.5 秒后暂停。
// animations.play("Slide", { loop: "once", clampWhenFinished: true });
// animations.stop(); // 恢复 Mixer 绑定属性原值，并清除当前片段。
// animations.dispose(); // 只清理动画，模型仍可使用。
```

返回 `GLTFAnimationsHandle`，包含 mixer、clips、action、state、disposed 和 play/crossFadeTo/seek/pause/resume/stop/dispose。构造时不自动播放或启动宿主；clips 是原生片段引用的只读数组快照，空列表也可创建。play 按非负整数索引或唯一完整名称选择，未知/歧义名称、越界、非正有限 duration、无效 tracks 拒绝并保留原播放；原生 clip.validate 可能输出诊断。播放期间不要修改片段数据。

play 选项：loop="repeat"（默认）、"once" 或 "pingpong"；repetitions 为正安全整数或 Infinity（repeat/pingpong 默认 Infinity，once 默认且只接受 1）；clampWhenFinished=true（默认）；timeScale=1（正有限倍速）。重复播放同一片段也从零开始；play 切换立即停止旧 action；需要渐变时使用 crossFadeTo。调用时采样首帧，后续由宿主 onUpdate(delta) 驱动；宿主停止/隐藏/零尺寸期间不前进，恢复首帧 delta=0。pause/resume 保持姿态、时间和配置的速度，不改变宿主或 mixer.timeScale；idle/finished 时无操作。

repetitions 按单向遍历计数：`animations.play("Lift", { loop: "pingpong", repetitions: 2 })` 是一去一回，奇数次保留片段终点、偶数次保留起点。有限 repeat 完成保留片段终点。库在原生迭代返回后归一化 r187 的往返末帧，不读取私有循环计数；不为此推进 Mixer 时间。

往返中 action.time 是原生循环本地时间，反向阶段不直接等于实际采样的片段时间。seek 仍定位到正向片段秒数并暂停，同时重置循环历史，保留次数和模式；它不是整个往返过程的绝对时间轴。crossFadeTo 继承 repetitions；复用仍在播放的目标时继续其原生循环进度，配置的次数是总预算而非追加次数。

state 为 idle/playing/paused/finished/disposed，描述控制器状态；有限次数播放结束进入 finished，clamp=true 保留末姿态，false 按原生 binding 规则恢复未被其他 action 使用的属性。stop 恢复绑定属性、清空 action 和 Mixer 时间；停止、暂停时可再次 play。销毁后 play/seek/pause/resume 抛错，stop/dispose 幂等。

seek(seconds) 仅接受已有选择的 [0,clip.duration] 有限秒数，零 delta 采样后进入 paused，保持 mixer.time、loop/clamp/weight/timeScale，不启动宿主或绘制。可检查已完成动作，精确端点保持到 resume 后依循环规则推进；定位重置过去循环次数及原生淡变/warp。若正在 crossFadeTo，定位会停止其他贡献并以全权重检查当前目标。暂停画面需要应用 app.render。原生事件内的定位依序执行，并在执行前按实际片段重新校验；队列更早的切换/stop 可能使请求失效并抛错。

句柄同时登记 app.resources 与 model.resources，任意所有者结束都会取消订阅、停止 action 并 uncacheRoot，不释放模型资产。原句柄缓存清理完成前，同一根对象不能再创建句柄。原生 loop/finished 事件中调用控制方法会在本次 Mixer 更新返回后执行；dispose 先失效并丢弃排队命令，延后清缓存。若事件中移除模型，GPU 资产可能先释放，CPU 采样结束后再完成缓存清理；不会重新挂载模型。

mixer/action 可查询及配置参数；采样、action 调度和缓存由句柄管理，不要再手动 update/play/stop/uncache 或为同一属性添加竞争写入者。业务注册的原生事件监听自行移除；持有句柄/mixer 引用仍可保留 CPU 模型。本入口不引入 GLTFLoader 运行时代码，不提供反向、任意混合图、骨骼重定向或状态机。浏览器原创样例只验证节点动画，骨骼/morph 与复杂资产仍需专门验证。

### 渐变切换

```ts
animations.play("Lift");
animations.crossFadeTo("Slide", { duration: 0.4, loop: "repeat", timeScale: 1 });
// animations.blending / animations.blendProgress（0..1）
// animations.pause(); animations.resume(); // 冻结/继续整个交接。
```

CrossFadeOptions 的 duration 默认 0.3，正有限 Mixer 秒，其他选项同 play。目标从当前有效权重渐变到 1，其他动作从各自当前权重降到 0；中断重新拍快照，保持瞬时复合姿态。已活动目标保留片段时间，同一当前目标无操作，重播用 play；没有旧动作时正常播放，不从空姿态淡入。结束进度为 1，旧动作在原生采样返回后停止，当前目标保持运行。每片段最多一个 native action，结束只留目标，缓存仍按既有 Mixer 生命周期清理。

暂停/停止宿主均冻结交接，无独立时钟。duration 受 mixer.timeScale 缩放，允许 0 暂停，须非负有限；action timeScale 只改变片段速度。当前只支持普通 blend mode 和 [0,1] 有效权重，不提供 additive、warp 或自定义权重曲线。目标 once 提前结束时继续交接，渐变结束后 state 才为 finished；clamp 行为沿用原生规则。

play/stop 取消渐变，seek 取消其他贡献并定位目标；blendProgress 初始/取消为 0，完成为 1。控制方法仍按原生事件队列依序执行，dispose 立即失效、原生返回后释放全部缓存。不要同时手动控制 native 淡变、action 调度或 Mixer 采样。异常沿用宿主停止/抛出，不承诺回滚已采样姿态；骨骼/morph 等复杂资产仍待验证。

### 动画通知

```ts
const off = animations.on("finished", ({ clip, direction }) => {
  console.log("已完成采样", clip.name, direction);
  animations.play("Slide"); // 在本批通知结束后执行。
});
animations.on("loop", ({ loopDelta }) => console.log("跨越循环", loopDelta));
// off(); // 只解除这一条订阅。
```

on 的事件 payload 由 GLTFAnimationEvents 按事件名推断，公共 union 为 GLTFAnimationEvent；都有借用的 action/clip。通知发生在当前选中动作采样、往返端点归一化和渐变权重交接完成后，早于宿主 GPU 绘制。渐变目标提前结束时延后 finished，离场动作不派发控制器完成；loop 沿用原生合并的 loopDelta，不保证每轮单独通知。

回调同步执行，不等待异步结果；play/crossFadeTo/seek/stop 在本批通知后按序处理。相同函数可独立订阅，派发中解除会跳过尚未执行的回调，新订阅从后续通知生效；销毁跳过后续通知并清订阅。回调抛错则停止本批、丢弃未执行命令并按宿主异常策略传播。stop/seek/pause 不制造 finished，订阅不回放历史完成；不要在回调里直接 update 原生 Mixer。

## 对象路径运动

```ts
import { followPath } from "@adui/three/animation";
import { CatmullRomCurve3, Vector3 } from "three";

const curve = new CatmullRomCurve3([
  new Vector3(-2, 0, 0),
  new Vector3(0, 1, 2),
  new Vector3(2, 0, 0),
]);
const motion = followPath(app, model.scene, {
  curve,
  duration: 4,
  loop: "once",
  orientToPath: true,
  scope: model.resources,
});
// motion.pause(); motion.resume(); motion.cancel();
const result = await motion.finished; // completed / cancelled（含原因）/ failed（含 error）
```

对象需已挂在本宿主 scene 下且使用自动矩阵，库借用它和曲线；创建时立即设置起点，不启动宿主或绘制。每次宿主更新以 delta/duration 推进，loop 默认为 once，可选 repeat/pingpong 无限循环到取消；progress 为当前局部弧长比例，回程递减。duration 是单向遍历秒数。getPointAt 使用原生近似弧长采样，父级非均匀缩放后不保证世界匀速；曲线控制点和弧长配置在运动期间保持不变，开放曲线 repeat 会跳回起点。

orientToPath 默认 false，仅写 position；true 时局部 +Z 沿切线，回程反向，不提供倾斜或平滑转向。暂停保持姿态，resume 不补墙钟时间。finish/cancel/dispose 保留当前姿态并释放宿主、可选 scope 的登记、订阅和 abort 监听，不释放对象或其 GPU 资产。scope 可以是 model.resources，模型结束立即取消且完成后自动解除两处登记。

同一对象的新合法请求替换旧运动；无效/预先 abort 的请求保留旧运动。外部改写所占用的位置/旋转、重新挂接、脱离 scene 或关闭自动矩阵，下次更新以 target-changed 结束；只控制位置时允许外部改旋转，scale 始终由应用管理。自定义曲线回调后重新核对取消/所有者，错误记为 failed 并按宿主帧异常规则抛出。原生字段自定义副作用不承诺事务回滚；不含碰撞、导航网格或相机漫游。独立演示为 `/?demo=path`。

## 对象拾取

```ts
import { attachPicking } from "@adui/three/interaction";

const picking = attachPicking(app, {
  objects: () => [cube], // 每次拾取重新读取，可返回当前 model.scene。
  recursive: true,
  dragThreshold: 4,
  updateSkinnedBounds: true,
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

updateSkinnedBounds 默认 true：在有效拾取时同步递归目标内的骨骼世界矩阵（含兄弟骨骼）、attached bind inverse，并按 mesh 去重刷新蒙皮 sphere 和已有 box。动画改变后或暂停/未先绘制也可查询实际位置。每次会计算参与的蒙皮顶点/骨骼；已自行维护边界或使用碰撞代理时设 false。不会创建未使用的 box，不替代每帧渲染剔除边界维护或推断任意 shader/GPU 位移。

同一句柄在 getter、矩阵/边界或原生 raycast 内同步重入 pick 会抛错；所有者中途结束不会返回失效交点，错误后可再次有效调用。原生矩阵和边界的已写结果不回滚。

按画布 getBoundingClientRect 换算 NDC，不乘 DPR；支持页面偏移、滚动和轴向 CSS 缩放，不支持 CSS 旋转/倾斜。零尺寸、非有限坐标、画布外返回 null。拾取前更新相机与目标世界矩阵；ready/stopped 状态也可使用。目标或祖先 visible=false 的交点会被过滤，其余沿用原生 CPU raycast、材质面朝向和 raycaster layers 规则；不等同 GPU 可见像素，不解析透明贴图、遮挡的非目标对象或 shader 顶点位移。

click 在主指针左键/单指按下和抬起命中同一对象且 instanceId/batchId 相同时同步触发，两次都为空也触发 null。期间任意移动超过阈值即取消，回到原处也不恢复；离开、取消、失焦、第二指针介入会取消本次点击。不调用 preventDefault、指针捕获或独立 RAF，可与 OrbitControls 共存。触摸滚动策略由应用/控制器设置。

hover 仅在无按钮的主鼠标/笔 pointermove 导致最近对象或其 instanceId/batchId 改变时触发，pointerleave/pointercancel 触发 null；触摸没有悬停。静止指针下物体运动、目标替换不会主动刷新，下一次指针事件重新判断；失焦重置内部状态，销毁不额外派发事件。业务选择状态、光标和高亮由应用管理。

on 返回幂等取消函数，同一回调可独立订阅多次；派发中新订阅下一次生效，取消或销毁立即生效，回调异常交给浏览器。手动或宿主/scope 销毁移除监听，不释放借用目标。销毁后 pick/on 抛错，dispose 幂等。包导入没有 DOM 副作用。

## DOM 标签

WebGL 标签深度裁剪读取原生 camera.reversedDepth：普通模式接受 NDC z∈[-1,1]，反向模式接受 z∈[0,1]；x/y 和相机背后检查不变。库不写入相机深度模式。反向模式需由原生 renderer 和 EXT_clip_control 支持，当前仅验证 Chromium/SwiftShader，不外推完整设备或后处理组合矩阵。

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

## 对象变换手柄

```ts
import { attachTransformControls } from "@adui/three/controls";

const gizmo = attachTransformControls(app, {
  object: model.scene, // 必须已加入本场景；可省略后再 gizmo.attach(object)。
  orbitControls: orbit.controls, // 可选，借用同相机/画布控件。
  mode: "translate", // translate / rotate / scale
  space: "world", // world / local
  size: 1, // 正有限数
});
gizmo.controls.addEventListener("change", () => {
  if (!gizmo.disposed && app.state !== "running" && app.state !== "disposed") app.render();
});
// gizmo.controls.setMode("rotate"); gizmo.controls.setTranslationSnap(0.5);
// 模型移除前：gizmo.detach();
// gizmo.dispose(); // 不释放模型；宿主也会自动释放手柄。
```

TransformControlsHandle 提供原生 controls、helper、disposed、attach、detach 和 dispose。单宿主一个库手柄，非法配置、外部目标/控件在写入前拒绝。目标/OrbitControls 借用，手柄拥有原生 helper、监听和初始几何/材质快照，后加节点不接管。改变目标用句柄；不要单独原生 connect/disconnect/dispose 或移动自有 helper。

拖拽期间暂时关闭借用 OrbitControls 的 enabled、damping、autoRotate，通过 update(0) 消耗旧惯性，结束按值恢复配置，保留外部已改为 true 的属性。开始可能有最后一次惯性更新；没有每帧更新订阅。松手、取消/失捕获/失焦、detach/dispose 均释放租约，即使原生 enabled 已改变。取消保留当前对象变换，不实现撤销或编辑器状态；应用避免与动画/相机过渡竞争写入。

库不自动 render/start/RAF。消费者根据 change 决定暂停绘制，并在模型删除前 detach。释放从场景移除 helper、断开事件、去重清理全部初始 GPU 资源，借用模型/控件保持存活；错误继续处理后聚合，touchAction 按值恢复。原生参数与额外事件由应用管理，完整契约见仓库设计文档。

## 独立图片纹理

```ts
import { NoColorSpace } from "three";
import { loadTexture } from "@adui/three/textures";

const controller = new AbortController();
const image = await loadTexture(app, "/image.png", {
  signal: controller.signal,
  flipY: true, // 解码时翻转；glTF 的 UV 通常需要 false。
  // colorSpace: NoColorSpace, // 法线/标量图；颜色图默认 SRGBColorSpace。
});
const previous = material.map;
material.map = image.texture;
material.needsUpdate = true;
image.resources.track({
  dispose() {
    if (material.map === image.texture) {
      material.map = previous;
      material.needsUpdate = true;
    }
  },
});
if (app.state !== "running") app.render();
// image.dispose(); // 先解除材质引用，再清 GPU 和原始位图；宿主也会释放。
```

loadTexture 返回 TextureAsset，提供原生 texture、前置 resources、disposed 和幂等 dispose，不自动修改材质/场景或绘制。colorSpace 默认 SRGBColorSpace，另接受 LinearSRGBColorSpace、NoColorSpace；不会猜测贴图用途。options 另有 onProgress({ loaded,total,ratio }) 和 onCleanupError，未知 total/ratio 为 null。signal/宿主/scope 取消立即拒绝 AbortError，不中止共享运输；迟到字节跳过解码，迟到位图关闭。

每任务独立拥有 ImageBitmap，即使 URL 和下载字节相同也不共享位图；需要画布所属 Window 的 createImageBitmap，具体图片格式沿用浏览器支持。翻转烘焙在 imageOrientation，浏览器不做额外预乘或颜色转换，Texture.flipY=false；后来修改 flipY 无效，需要重新加载。过滤/mip/wrap 等用原生 API 配置。

资产释放按顺序尝试前置钩子、texture.dispose、原始 bitmap.close，错误聚合，重复释放不重试；不关闭后来替换的外部 image。不要单独 dispose/close 原生对象，也不要在资产结束后保留其他材质/场景的借用引用。loadTexture 不处理 KTX2、HDR、视频或画布；HDR 使用 environment，独立 KTX2 使用下节 loadKTX2，KTX2 模型使用 loaders。

## 独立 KTX2 纹理

```ts
import { loadKTX2 } from "@adui/three/textures";

const compressed = await loadKTX2(app, "/checker.ktx2", {
  transcoderPath: { js: "/basis/basis_transcoder.js", wasm: "/basis/basis_transcoder.wasm" },
  workerLimit: 1,
  signal: app.signal,
});
const previous = material.map;
material.map = compressed.texture;
material.needsUpdate = true;
compressed.resources.track({
  dispose() {
    if (material.map === compressed.texture) {
      material.map = previous;
      material.needsUpdate = true;
    }
  },
});
// compressed.dispose(); // 不再需要时清理；宿主也会释放。
```

LoadKTX2Options 必须显式配置匹配 Three.js r187 的转码器目录（以 / 结尾）或 JS/WASM URL 对，不默认 CDN。workerLimit 默认 1，范围 1–32；支持 signal、onProgress 和 onCleanupError，语义同图片加载。KTX2TextureAsset 拥有原生二维 Basis CompressedTexture、resources、disposed 和 dispose。原生 renderer 只用于能力检测，库不修改材质、绘制或启动宿主。

每任务独立转码器，下载字节复制后解析以隔离原生缓存。取消立即拒绝；迟到字节不解析，已经开始的转码等原生完成再释放 Worker/Blob URL 和迟到纹理。资产先运行前置钩子再清 GPU，无 ImageBitmap；不要单独 dispose 原生纹理。多任务有重复初始化成本，workerLimit 不是全局并发限制；原生永不完成时不保证按时清理。

仅接收二维 Basis，原始未压缩、数组或立方结果拒绝并清理；保留文件颜色空间/mip/方向，不能用 flipY 翻转或现场生成压缩 mip。实测 ETC1S/BasisLZ、真实压缩上传及 RGBA 回退；UASTC/HDR、完整硬件格式和长期指标仍待验收。

## HDR 环境

配置读取完成后再次检查宿主、资产/扩展 scope 和绑定独占状态；选项 getter 引发的同步销毁或嵌套绑定会使外层调用在场景写入前失败。getter 自身产生的副作用由调用者负责，不撤销有效嵌套绑定。

```ts
import { loadHDR, attachEnvironment } from "@adui/three/environment";

const controller = new AbortController();
const environment = await loadHDR(app, "/studio.hdr", { signal: controller.signal });
// 加载只创建资产。应用先检查请求版本，决定是否应用。
const binding = attachEnvironment(app, environment, { background: true, intensity: 1 });
if (app.state !== "running") app.render();
// binding.dispose(); // 恢复场景，资产可再次绑定。
// environment.dispose(); // 先解绑，再释放纹理与原生缓存；宿主销毁也会释放。
```

loadHDR 返回 HDREnvironment，提供原生 texture、前置资源 resources、disposed 与幂等 dispose。保留 HDRLoader 的 HalfFloat 和 LinearSRGB，设置 EquirectangularReflectionMapping；不自动改场景、绘制或启停。options 支持 signal、onProgress({ loaded, total, ratio }) 和 onCleanupError；未知总量为 null。取消立即拒绝 AbortError，迟到字节跳过解码，不中止可能与其他请求共享的运输。进度回调异常拒绝本任务；已结算后的清理异常交报告器或控制台。

attachEnvironment 只借用同一宿主的活动 HDREnvironment；background=false、intensity=1，强度为非负有限数。每个宿主一个绑定，替换时先释放旧绑定。EnvironmentBinding 提供 disposed 和幂等 dispose，同时登记宿主/资产 scope；解绑不释放资产，资产释放先解绑再纹理清理。原场景 environment、background 和强度只在当前值仍属于绑定时恢复，保留外部变更。原值借用，需由外部保持存活；相同值改回的 ABA 无法区分。

原生 renderer 自动生成 PMREM 照明/立方背景并在源纹理 dispose 时清理，不需手动生成。生成器共享 scratch 会保留至 renderer.dispose；释放单资产回到预热基线。不要单独 texture.dispose，也不要在释放资产后继续将纹理借用于其他场景/材质。当前仅 Radiance 等距柱状 HDR，不含 EXR、跨宿主资源共享或完整硬件/长期资源承诺。

### EXR 环境图

```ts
import { loadEXR, attachEnvironment } from "@adui/three/environment";

const exr = await loadEXR(app, "/studio.exr", { signal: abort.signal });
const binding = attachEnvironment(app, exr, { background: true });
app.render();
binding.dispose();
exr.dispose();
```

loadEXR 与 loadHDR 共用 LoadHDROptions/HDREnvironment（HDR 表示高动态范围资产）和显式绑定/释放；前者以原生 part=0、半浮点 RGBA 解析 EXR，后者保持 RGBE。保留原生色彩/方向/过滤，设置等距柱状映射，不猜格式、自动曝光、写材质或创建循环。

相同 URL 下载可合并，EXR 解压前独立复制输入；取消是逻辑性的，不能抢占同步解析或承诺运输终止。迟到纹理/错误、所有者结束和重试沿用既有环境契约。绑定与 GPU 缓存先清，再释放源纹理；不要另行 dispose 借用纹理。原创 64×32 FLOAT scanline 样例离线生成，半浮点/照明与 GPU 清理通过验证；其他压缩、多 part、深度 EXR 和硬件矩阵没有逐项验收。

## 开发与验证

根目录运行 `pnpm run dev` 打开双实例演示，`pnpm run ready` 执行静态检查、文档和单元测试及构建，`pnpm run test:browser` 验证构建后演示的实际 WebGL 行为。首次浏览器测试前运行 `pnpm exec playwright install chromium`。完整契约和验证范围见仓库 docs/SDD.md 与 docs/HARNESS.md；npm 安装包不包含仓库工程文档。
