# 快速开始

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
