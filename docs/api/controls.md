# 控制器与变换

从 `@adui/three/controls` 导入 `attachOrbitControls(app)`；返回的 `controls` 为原生 OrbitControls，只订阅宿主更新，不新增循环。通过 `dispose()` 或宿主销毁解除。

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
  if (!gizmo.disposed && app.state !== "running" && app.state !== "disposed") app.renderOnce();
});
// gizmo.controls.setMode("rotate"); gizmo.controls.setTranslationSnap(0.5);
// 模型移除前：gizmo.detach();
// gizmo.dispose(); // 不释放模型；宿主也会自动释放手柄。
```

TransformControlsHandle 提供原生 controls、helper、disposed、attach、detach 和 dispose。单宿主一个库手柄，非法配置、外部目标/控件在写入前拒绝。目标/OrbitControls 借用，手柄拥有原生 helper、监听和初始几何/材质快照，后加节点不接管。改变目标用句柄；不要单独原生 connect/disconnect/dispose 或移动自有 helper。

拖拽期间暂时关闭借用 OrbitControls 的 enabled、damping、autoRotate，通过 update(0) 消耗旧惯性，结束按值恢复配置，保留外部已改为 true 的属性。开始可能有最后一次惯性更新；没有每帧更新订阅。松手、取消/失捕获/失焦、detach/dispose 均释放租约，即使原生 enabled 已改变。取消保留当前对象变换，不实现撤销或编辑器状态；应用避免与动画/相机过渡竞争写入。

库不自动 render/start/RAF。消费者根据 change 决定暂停绘制，并在模型删除前 detach。释放从场景移除 helper、断开事件、去重清理全部初始 GPU 资源，借用模型/控件保持存活；错误继续处理后聚合，touchAction 按值恢复。原生参数与额外事件由应用管理，完整契约见仓库设计文档。
