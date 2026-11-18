# DOM 标签

## DOM 标签

正交相机 near=0 时，相机平面上的锚点属于合法近平面边界；普通/反向深度都由原生 NDC 区间判断。透视相机在投影前拒绝相机平面及后方点，避免透视除法奇点。

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
