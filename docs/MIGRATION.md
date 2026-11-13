# 从 CustomThree 迁移

依据 [旧版只读审查](LEGACY_REVIEW.md) 和当前公开 API 编写。旧业务运行兼容性仍待实测；本指南不表示已经完成旧工程迁移。建议先用一个独立页面迁移单场景，再替换业务页面。

## 接入当前开发包

主包尚未发布 npm。相同 pnpm workspace 内使用 `@adui/three: workspace:*`；独立工程使用本地 tarball。先在本仓库根目录构建并打包：

```sh
pnpm exec vp run --filter @adui/three build
pnpm --dir packages/three pack --pack-destination ../../dist/local-packages
```

产物为根目录 `dist/local-packages/adui-three-0.0.0.tgz`，属于忽略的构建输出。复制到消费工程的 vendor 目录后，在消费工程中安装：

```sh
pnpm add ./vendor/adui-three-0.0.0.tgz
```

消费工程直接依赖 `three@0.187.0`，TypeScript 工程另直接依赖 `@types/three@0.187.0`。旧工程审查时声明 three ^0.181.2 / 类型 ^0.180.0，2026-11-13 复核已安装公共依赖元数据，版本分别为 0.181.2 / 0.180.0；需要单独验证旧 addon、shader 与资产在 0.187.0 下的行为，不能把旧依赖声明当作新版兼容证据。当前 peer 只覆盖 0.187.x；包为 ESM，要求 WebGL 2，宿主构造需要浏览器 DOM。

生产前的包消费、浏览器与兼容边界见 [Harness](HARNESS.md)。上述 pack 只生成本地归档，不执行 npm 发布；0.0.0 是当前开发版本，重复打包会更新同名产物。

后续更新开发包时，可在复制到 vendor 时使用带提交标识的新文件名或目录，再安装该路径并核对锁文件引用，便于区分同为 0.0.0 的不同产物；这不改变包内版本号。

## 模块对照

| 旧模块或职责                        | 当前入口与接法                                         | 迁移边界                                                                    |
| ----------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| CustomThree.js 场景、相机、renderer | `ThreeApp` / `OrthographicThreeApp`                    | 构造参数显式传容器，自有 canvas/context；运行时拒绝外部句柄                 |
| 原 OrbitControls                    | `@adui/three/controls` 的 attachOrbitControls          | 使用返回的原生 controls 配置，不增加第二个更新循环                          |
| CustomModel.js 的 GLTF/GLB          | `@adui/three/loaders` 的 loadGLTF                      | 保留原材质与尺寸；Draco/Meshopt/KTX2 解码显式配置                           |
| 旧模型 clone                        | cloneGLTF                                              | 节点/动画独立，几何体/材质/纹理按租约共享，不能提前释放共享资产             |
| CustomLabel.js 的 DOM 标签          | `@adui/three/labels` 的 attachDOMLabels                | 显式 overlay、目标与 detached element；Vue 组件挂载/卸载属于应用            |
| 原点击、悬停                        | `@adui/three/interaction` 的 attachPicking             | 动态读取目标，返回原生 Intersection；过滤拖拽，不修改全局光标               |
| 原相机取景、相机动画                | `@adui/three/camera` 的 fitObject / transitionToObject | 正交使用独立命名函数；复用宿主 delta，交接控件和过渡                        |
| 原动画播放逻辑                      | `@adui/three/animation` 的 attachGLTFAnimations        | 单模型 Mixer，模型/宿主结束时清理；播放、定位和渐变由句柄控制               |
| CustomBloom.js / CustomOutline.js   | `@adui/three/postprocessing`                           | 同一渲染出口，固定效果顺序；手动释放或由登记的所有者清理                    |
| 原路径曲线运动                      | followPath                                             | 局部曲线采样、运行倍速、独立暂停/定位与可选切线朝向；没有导航网格或碰撞求解 |
| CustomLight.js                      | 原生 Three.js 灯光                                     | 当前没有独立灯光封装；应用管理灯光策略及自有阴影资源                        |
| 原对象尺寸计算                      | `@adui/three/geometry` 的 computeObjectBounds          | 独立世界 Box3，当前 CPU 姿态；实例/批次保留原生保守边界                     |

OBJ/FBX、CSS3D、RGB 偏移、雷达、寻路、碰撞、漫游和框架适配没有在本轮实现。业务解密、鉴权、CORS 与私有路径留在应用及资产服务，不迁入通用主包。完整公开用法见 [包 README](../packages/three/README.md)。

## 先迁移生命周期

1. 从页面或组件取得容器元素，创建一个宿主。容器有明确尺寸；多个场景分别持有自己的宿主和 overlay，不沿用 `.three-container` 等全局选择器。
2. 统一使用 start/stop/onUpdate/onAfterRender。原 CustomThree 与 CustomEffect 的独立 RAF/渲染循环应退出该场景；动画使用按秒的 delta。DOM 投影放在成功绘制后的阶段。
3. 可选模块通过公开子入口挂接。后处理通过借用管线接入，资源由模块/应用拥有，不在更新回调中再调用另一套 composer/render 循环。
4. 页面卸载时同步调用 app.dispose，而不是等待正在加载的模型结束。加载任务逻辑取消，迟到结果由加载器清理；应用仍要接住 Promise 拒绝。
5. 重建时创建新宿主和新句柄。旧对象的 scene/camera/renderer 引用不交给新实例继续使用；上下文丢失也遵循显式重建策略。

更新和手动绘制分别使用：

```ts
app.onUpdate(({ delta }) => {
  object.rotation.y += delta * 0.3;
});
app.start();
app.stop();
const drawn: boolean = app.render(); // 不推进动画；false 表示本次未调用绘制。
```

`render()` 已从 void 返回调整为 boolean。忽略返回值的调用可保持；自定义覆盖/测试替身需要返回布尔值。截图会拒绝未发生绘制的结果。true 表示同步调用 renderer/pipeline 正常返回，第三方管线仍须正确输出画布。

onUpdate/onAfterRender 返回独立解除函数。仅服务某个模型的自定义回调应随 model.resources 解除；库提供的模型动画和路径句柄已有对应所有者清理。

## 再迁移模型与资源

loadGLTF 返回 GLTFModel，默认挂到本宿主场景；调用 model.dispose 即可结束其扩展并释放其拥有的资产。取消正在加载的模型使用独立 AbortController，页面卸载使用 app.dispose；同 URL 任务的逻辑取消彼此隔离，不承诺物理中止共享下载。

不要继续在宿主销毁时遍历整棵 scene 并释放所有 geometry/material/texture。自行创建的资源显式登记，自外部传入的共享资源由原所有者管理；加载器已有快照与租约，不再把模型子树中的共享资产逐项重复登记。ResourceScope 只释放登记项，不隐式遍历 Mesh。

cloneGLTF 共享几何体、材质和纹理；修改共享材质会影响其他使用者。需要独立材质时，由应用显式克隆并把新增材质登记到合适的 scope，不提前释放仍由其他实例使用的资源。旧版默认改写 alphaMap/metalness/roughness 的策略应逐项确认后由应用显式应用。

模型挂载后按需组合动画、取景和标签。标签应跟随模型一起结束时，可以登记其句柄：

```ts
const label = labels.add({ object: model.scene, element });
model.resources.track(label);
// 框架组件在应用中挂载；在标签 DOM 移除前卸载组件。
model.resources.track({ dispose: () => unmountComponent() });
```

这里的 element、unmountComponent 由消费应用提供，初始化/挂载失败也由应用回滚。label.dispose 负责移除该标签 DOM 和登记，不执行 Vue/React 卸载；后登记的框架清理会按 scope 逆序先执行。单独移除标签时，应用也应一起结束组件，并解除对应 scope 登记或保证清理幂等。

## 对照演示验收

先运行 `pnpm run dev`，用主页面的双实例验证模型加载、暂停/绘制、取景、动画、截图、销毁与重建。`/?demo=instances` 验证实例网格，`/?demo=path` 验证路径和定位，`/?demo=orthographic` 验证两类投影。

接入业务页面后，至少验证：卸载中加载完成不会重新挂载、两个容器互不修改、暂停后 resize/拾取/标签一致、反复进入退出清理自有监听/资源。保留原始材质、坐标和动画后再加入业务效果，便于定位差异。当前 Chromium/SwiftShader 回归不能代替旧工程真实模型、设备和浏览器的迁移验收。

本仓库本地检查使用 `pnpm run ready`、`pnpm run test:browser` 和 `pnpm run test:package`；不依赖 CI。旧项目迁移结果、额外格式支持和 npm 发布另按实际需求推进。
