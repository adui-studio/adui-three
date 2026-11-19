# @adui/three

以生命周期为中心的 Three.js 场景封装。创建独立宿主，统一帧循环、尺寸和资源释放，并保留原生 `scene`、`camera`、`renderer`。

> [!NOTE]
> 当前版本 `0.0.0`，尚未发布 npm。使用工作区或本地 tarball；Three.js peer 为 `>=0.187.0 <0.188.0`，当前实现和验证基于 `0.187.0`。ESM / 默认 WebGL 2，可选 WebGPU，扩展 API 共用。

## 使用

应用直接依赖 `three@0.187.0`；直接导入 Three.js 类型时将 `@types/three@0.187.0` 列为应用开发依赖。容器必须有明确宽高，`container` 是应用取得的 HTMLElement。

```ts
import { ThreeApp } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import { BoxGeometry, Mesh, MeshNormalMaterial } from "three";

const container = document.querySelector<HTMLElement>("#scene")!;
const app = await ThreeApp.create(container, { renderer: { type: "webgl" } });
const geometry = app.resources.track(new BoxGeometry());
const material = app.resources.track(new MeshNormalMaterial());
const cube = new Mesh(geometry, material);
app.scene.add(cube);
attachOrbitControls(app);
app.onUpdate(({ delta }) => {
  cube.rotation.y += delta;
});
app.start();

// 在页面或组件的卸载钩子中调用：
window.addEventListener(
  "pagehide",
  () => {
    void app.destroy().catch(console.error);
  },
  { once: true },
);
```

创建不自动启动。`start()` / `stop()` / `destroy()` 幂等；`renderOnce()` 在暂停时绘制一帧且不推进动画。几何体、材质和纹理分别登记，借用资产仍由原所有者管理。

## 按需导入

| 入口                                   | 用途                                              |
| -------------------------------------- | ------------------------------------------------- |
| `@adui/three`                          | ThreeApp、OrthographicThreeApp、ResourceScope     |
| `@adui/three/controls`                 | 轨道控件与变换手柄                                |
| `@adui/three/loaders`                  | 模型、压缩解码和模型实例                          |
| `@adui/three/animation`                | 动画控制与路径运动                                |
| `@adui/three/camera`                   | 取景、过渡及视角快照                              |
| `@adui/three/interaction` / `labels`   | 拾取与屏幕空间 DOM 标签                           |
| `@adui/three/geometry`                 | 世界边界、路径几何、实例化                        |
| `@adui/three/collision` / `navigation` | 静态 BVH、第一/第三人称                           |
| `@adui/three/effects`                  | 点云/管道飞线、流光、光墙、雷达、波纹、光柱、护罩 |
| `@adui/three/lighting` / `rendering`   | 实时阴影和 Editor 配置预设                        |
| `@adui/three/postprocessing`           | 泛光、描边、颜色滤镜                              |
| `@adui/three/environment` / `textures` | HDR/EXR/Room 与图片/KTX2 资产                     |
| `@adui/three/capture`                  | 完整画布或区域截图                                |

正式用 `await ThreeApp.create(container, { renderer: { type: "webgl" } })` 或选择 `renderer.type="webgpu"`。WebGPU 的 allowFallback 默认true；创建后start，单帧renderOnce，卸载await destroy。两条路径均为ThreeApp实例。rendererType表示渲染器族，backend表示实际图形API。原生GPU仍需适配器环境验收，现有WebGL专属效果不可接到节点renderer。

子入口均独立声明；深层 `src` 路径不是公开 API。

## 文档与示例

- [使用指南](https://github.com/adui-studio/adui-three/blob/main/docs/guide/getting-started.md)
- [API 索引](https://github.com/adui-studio/adui-three/blob/main/docs/api/index.md)
- [正式示例与运行方法](https://github.com/adui-studio/adui-three/blob/main/examples/README.md)
- [生命周期与所有权](https://github.com/adui-studio/adui-three/blob/main/docs/guide/lifecycle.md)
- [本地验证与已知边界](https://github.com/adui-studio/adui-three/blob/main/docs/HARNESS.md)

模型取消是逻辑取消，不能保证网络/原生解码中止；原生失败时未返回的局部资源仍有边界。设备兼容与性能以实际验证为准。
