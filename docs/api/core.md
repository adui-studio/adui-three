# 场景宿主与资源

## API

正式用法为 `await ThreeApp.create(container, { renderer: { type: "webgl" } })`；选择 renderer.type=webgpu，allowFallback=false要求原生设备。创建后配置场景并start，单帧使用renderOnce，卸载await destroy。完整配置见 [渲染器配置](webgpu.md)。

renderer 配置在 DOM/GPU 分配前快照。类型 Omit 不阻止更宽的原生参数变量，运行时同样拒绝非空 canvas/context，null/undefined 字段丢弃且不修改原对象；renderer 本身不能是 null、数组或非对象。其他 getter 各读取一次，其后输入改写不进入 native 构造。两类宿主均只拥有自己创建的 canvas/WebGL 上下文；见 ADR-0002 的补充。

| API                                    | 契约                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ThreeApp.create(container, options?)` | 异步创建自有 scene / PerspectiveCamera / 所选 renderer，交付时 ready，不自动运行                                 |
| `scene`, `camera`, `renderer`          | 只读对象引用，允许修改原生对象属性；不要替换引用或额外启动渲染循环                                               |
| `start(): void`                        | ready/stopped → running；重复调用无额外 RAF；disposed 后抛错                                                     |
| `stop(): void`                         | 取消循环，转 stopped；重复调用及 disposed 后调用安全                                                             |
| `onUpdate(callback): () => void`       | 同步帧回调，按注册顺序执行，返回幂等取消函数；同一函数可独立订阅多次                                             |
| `onAfterRender(callback): () => void`  | 全部更新与成功渲染后同步执行；订阅、取消与生命周期规则同 onUpdate，适合 DOM 投影                                 |
| `resize(): void`                       | 同步读取容器 clientWidth/clientHeight 和 DPR，变化时才调整投影与绘制缓冲                                         |
| `size`, `state`, `signal`              | 尺寸快照、状态与销毁时 abort 的只读 signal                                                                       |
| `resources.track(resource)`            | 接管可 dispose 对象，返回原对象；同一 scope 内去重，不递归遍历                                                   |
| `resources.untrack(resource)`          | 解除登记，不释放，归还调用方所有权                                                                               |
| `destroy(): Promise<void>`             | 标记结束、取消 RAF、abort、清订阅/监听/observer、自有资源逆序释放、detach scene、释放 renderer/context 与 canvas |
| `attachOrbitControls(app)`             | 可选子入口；返回原生 controls 和幂等 dispose；自动随 app 释放，共享主循环                                        |

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
app.renderOnce();
```

OrthographicThreeApp.camera 精确为 OrthographicCamera；默认 ThreeApp.camera 继续为 PerspectiveCamera。两者共享单循环、尺寸/DPR、资源、绘制管线和上下文丢失策略，均不会自动启动。frustumHeight 是未缩放的竖向世界单位跨度，必须正且有限；正交 near 可为 0，far 必须有限且大于 near。默认参数见示例，默认看向原点；renderer/maxPixelRatio/maxDelta 与 ThreeApp 相同。

改变容器尺寸时保留当前 top/bottom、水平中心和 zoom，仅按 CSS 宽高比更新左右边界；DPR 不改变取景。直接修改相机后仍需 updateProjectionMatrix，未变尺寸的 resize 不负责更新修改。零尺寸暂停，投影/缓冲失败可在修复参数后 resize/render 重试。原生 view offset 由应用管理。

通用扩展可用 AnyThreeApp 借用两种宿主；controls、模型/纹理加载、动画、拾取/标签、后处理、截图与实例化入口均接受此类型。camera 的正交即时/平滑取景采用独立命名接口，既有透视接口保持原类型。演示服务 `/?demo=orthographic` 比较深度、缩放、拾取/标签和放大模型后的取景。

正交演示还可开启“组合效果”，点击对象后观察描边，并分别旁路泛光/描边或释放整条链；复用既有 postprocessing，不增加库入口。效果在暂停、resize/零尺寸恢复和宿主重建中保持各自所有权。

## 绘制管线与单次绘制

`render(): boolean` 在同步调用当前 renderer/pipeline 并正常返回时为 true；隐藏、零尺寸或准备中断导致未绘制时为 false。已绘制后完成通知中暂停宿主仍为 true；错误继续抛出。结果不保证第三方管线输出、像素变化或 GPU 完成。既有忽略返回值的调用可保持；自定义覆盖/测试替身需返回布尔值。

`app.renderOnce()` 显式绘制一次：ready/stopped/running 可用，不执行 onUpdate、不启动 RAF、不累计时间；成功后执行 onAfterRender，传入 delta=0 与上次有效 elapsed。隐藏/零尺寸时无操作，销毁后抛错；更新、绘制和完成回调中重入拒绝。绘制/完成错误仍使宿主停止并重新抛出。

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
app.renderOnce();
detach(); // 恢复原生绘制，不释放 pipeline；资源由其所有者管理。
```

同一宿主仅能挂接一个管线；重复挂接先拒绝。挂接立即调用 resize(app.size)，之后在尺寸/DPR 改变或失败待重试时调用，包括暂停和零尺寸。初始化失败释放槽位；resize 错误停止宿主并抛出。返回解除函数幂等，旧函数不影响后来的管线；app.dispose 解除引用，不调用借用管线的 dispose。通过 app.resources 显式登记自有清理句柄。不要为管线创建新 RAF 或覆盖 renderer.render；直接调用原生 renderer.render 仍绕过宿主管线和 onAfterRender。

原生投影/绘制缓冲或管线 resize 失败均停止宿主，分别保留待同步状态；再次同尺寸 resize 或 app.render 前先重试缓冲、再同步管线。零尺寸保留待恢复状态；不回滚已写原生副作用。尺寸处理中（含初次管线通知）禁止递归 resize、render 或重挂接管线，需等待回调结束再显式绘制。

管线方法可通过 getter 提供。挂接时各读取一次，后续调用仍读取当前方法；若读取期间宿主结束或管线解除/被替换，跳过旧方法和未绘制帧的完成通知。方法以管线对象为 this 调用；已发生的 getter 业务副作用仍由应用管理。

## 资源与边界

仅登记确实拥有的资源；借用或跨实例共享的 geometry/material/texture 不交给某个 app 独占管理。登记 Mesh 不自动登记 geometry/material/texture；纹理也不会随材质自动释放。多 app 共享资源时由外部所有者在最后一个使用者结束后统一释放。`ResourceScope` 可单独导入使用。

销毁幂等；清理过程中某项失败仍执行剩余清理，最终抛 AggregateError，不会在第二次 dispose 重试失败项。scope 销毁后 track 抛错。通用异步业务应检查 `app.signal.aborted` 并清理迟到资源；下述 glTF 加载器已封装这一契约。

要求现代浏览器、WebGL 2、ResizeObserver、matchMedia；仅构造实例时访问 DOM，Node 下可安全导入包，SSR 不能构造 renderer。容器建议不设 padding；尺寸基于 clientWidth/clientHeight，CSS transform 不改变绘制分辨率。运行中的 DPR 变化通过媒体查询和 window resize 检测。自有 canvas 的样式和生命周期由宿主管理，不接管外部 canvas。

`development` 条件导出指向随包包含的 src，便于 Vite 开发时 HMR；默认 import 导出指向 dist，类型来自 dist 声明。不提供 CJS、WebXR、URL 模型缓存或框架适配；WebGPU 通过统一工厂按需接入；显式模型实例按下述租约共享资产。

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

## 可选 WebGPU 与共用清理

默认同步构造和 AnyThreeApp 的 WebGL 类型保持。renderer配置与 SceneApp 类型见 [WebGPU](webgpu.md)。所有宿主使用 destroy：同步结束后等待原生 renderer 清理并报告同步/异步失败。原 dispose/render/disposeAsync 保留低层兼容。
