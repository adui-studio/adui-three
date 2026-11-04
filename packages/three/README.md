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

| API                                 | 契约                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `new ThreeApp(container, options?)` | 同步创建自有 scene / PerspectiveCamera / WebGLRenderer，初始 ready，不自动运行                                   |
| `scene`, `camera`, `renderer`       | 只读对象引用，允许修改原生对象属性；不要替换引用或额外启动渲染循环                                               |
| `start(): void`                     | ready/stopped → running；重复调用无额外 RAF；disposed 后抛错                                                     |
| `stop(): void`                      | 取消循环，转 stopped；重复调用及 disposed 后调用安全                                                             |
| `onUpdate(callback): () => void`    | 同步帧回调，按注册顺序执行，返回幂等取消函数；同一函数可独立订阅多次                                             |
| `resize(): void`                    | 同步读取容器 clientWidth/clientHeight 和 DPR，变化时才调整投影与绘制缓冲                                         |
| `size`, `state`, `signal`           | 尺寸快照、状态与销毁时 abort 的只读 signal                                                                       |
| `resources.track(resource)`         | 接管可 dispose 对象，返回原对象；同一 scope 内去重，不递归遍历                                                   |
| `resources.untrack(resource)`       | 解除登记，不释放，归还调用方所有权                                                                               |
| `dispose(): void`                   | 标记结束、取消 RAF、abort、清订阅/监听/observer、自有资源逆序释放、detach scene、释放 renderer/context 与 canvas |
| `attachOrbitControls(app)`          | 可选子入口；返回原生 controls 和幂等 dispose；自动随 app 释放，共享主循环                                        |

`ThreeAppOptions`：camera 的 fov/near/far/position 默认为 `50/0.1/1000/[3,2,5]` 并朝向原点；renderer 接受除 canvas/context 外的 WebGLRenderer 参数，默认 antialias=true；maxPixelRatio 默认 2；maxDelta 默认 0.1 秒。范围参数必须为有效正数，fov < 180，far > near，position 为三个有限数值。

`FrameInfo` 提供以秒计的 delta 和累计有效帧时间 elapsed；每次启动或自动恢复的首帧 delta=0，其余 delta 上限为 maxDelta。停止、隐藏文档、容器零尺寸期间不累计时间。页面隐藏或容器零尺寸时保留 running 状态，但不安排 RAF；恢复后自动继续。

新增订阅从下一帧执行；帧内取消立即生效；回调内 stop/dispose 阻止本帧 render。回调内 stop/start 会终止旧帧并只保留一个新循环。同步更新或 render 报错时先停止，再将异常交回浏览器，不吞错。

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

`LoadGLTFOptions` 提供 signal、addToScene（默认 true）、onProgress、closeImageBitmaps（默认 true）、onCleanupError。addToScene=false 时保持 detached，但仍随 app 释放。URL 直接交给 GLTFLoader，可包含查询参数、data/blob URL，不按扩展名截取。失败保持原始错误；取消统一为 AbortError。

取消会立即拒绝 Promise 并阻止挂载，底层网络/解码可继续；迟到成功会被清理，迟到失败会被消费，不影响其他相同 URL 任务。任务在开始时登记进 app.resources，因此单独销毁该 scope 也会取消。正常完成后撤销取消监听，后续使用 `model.dispose()` 管理存活。

模型句柄提供 scene、完整 gltf、disposed 和幂等 dispose。模型加载完成时，快照所有返回 scenes 中自有的节点、geometry、material、texture 和 skeleton，去重后逆序释放；不会接管之后加入的外部对象或新材质。不要将原模型的共享资源借给存活期更长的克隆；需要共享时自行协调所有权。本 API 不创建/停止 AnimationMixer。

默认只对加载开始、完成和释放时都未启用 Three.js 全局 Cache 的图像 backing 执行 close；纹理本身仍 dispose。缓存图像归缓存所有者管理。若外部共享 ImageBitmap，设置 closeImageBitmaps=false；不要在进行中的加载间切换全局 Cache 开关。本库不修改 Cache 或 abort 共享的底层请求。

清理失败继续释放其他资源并抛 AggregateError。若 Promise 已因取消/回调异常拒绝，迟到清理失败通过 onCleanupError(error) 报告；未传时写 console.error。原生解析失败中未返回的局部资源无法由本 API 完整回收；持有 disposed gltf 仍可保留 CPU 数据，应用应释放不再需要的引用。

当前支持无额外解码器配置的 glTF 2.0 / GLB；未接入 Draco、Meshopt、KTX2、外部插件/loader、自动居中或资产缓存。演示使用项目原创的内嵌 PNG 纹理样例，提供加载、取消、移除和失败反馈。

## 开发与验证

根目录运行 `pnpm run dev` 打开双实例演示，`pnpm run ready` 执行静态检查、文档和单元测试及构建，`pnpm run test:browser` 验证构建后演示的实际 WebGL 行为。首次浏览器测试前运行 `pnpm exec playwright install chromium`。完整契约和验证范围见仓库 docs/SDD.md 与 docs/HARNESS.md；npm 安装包不包含仓库工程文档。
