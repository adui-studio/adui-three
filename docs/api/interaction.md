# 对象拾取

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
