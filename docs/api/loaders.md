# 模型加载

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
