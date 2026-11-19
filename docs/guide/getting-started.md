# 快速开始

## 安装与容器

当前尚未发布 npm，在工作区通过 workspace 引用，独立应用使用 [本地 tarball](installation.md)。应用直接依赖 three@0.187.0，直接导入 Three.js 类型时安装 @types/three@0.187.0。

容器必须有明确尺寸，例如 `width:100%; height:480px`。应用取得容器 HTMLElement 后，统一用 ThreeApp.create 创建已就绪、未运行的实例。

## 最小完整场景

```ts
import { ThreeApp } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import { BoxGeometry, Color, Mesh, MeshBasicMaterial } from "three";

const container = document.querySelector<HTMLElement>("#scene")!;
const app = await ThreeApp.create(container, {
  renderer: { type: "webgl", antialias: true },
  maxPixelRatio: 2,
});

app.scene.background = new Color(0x102030);
const cube = new Mesh(
  app.resources.track(new BoxGeometry()),
  app.resources.track(new MeshBasicMaterial({ color: 0xff6600 })),
);
app.scene.add(cube);
attachOrbitControls(app);
app.onUpdate(({ delta }) => {
  cube.rotation.y += delta;
});
app.start();
```

切换 WebGPU 只需将 renderer.type 改为 webgpu。默认允许原生 WebGL 2 回退；必须使用原生 WebGPU 时设置 renderer.allowFallback=false。后续场景、相机、模型和生命周期 API 相同。

## 暂停与单帧绘制

```ts
app.stop();
cube.position.x = 1;
app.renderOnce(); // 不推进动画、不启动新的循环
app.start();
```

宿主只维护一个循环；更新统一写入 onUpdate，渲染完成通知使用 onAfterRender，不需要直接调用原生 renderer.render 或 renderer.init。

## 页面或组件卸载

```ts
await app.destroy();
```

destroy 调用即停止循环、取消宿主任务并移除监听/画布，Promise 完成表示原生清理已结束。几何体、材质和纹理分别登记；借用资产由原所有者管理。创建尚未完成时使用传入的 AbortController.signal 取消；已经取得的实例通过 destroy 结束。

创建配置、精确 renderer 类型、实际回退诊断与能力范围见 [渲染器配置](../api/webgpu.md)。组件中的取消和切换参考 [正式示例](../examples/webgpu.md)；原有写法的迁移见 [迁移指南](../MIGRATION.md#正式宿主-api)。
