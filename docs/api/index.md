# API 参考

## 公开入口

公开入口保持稳定，内部目录不参与深层导出。透视宿主的 WebGL / WebGPU 共用这些入口及扩展调用方式；后处理参数使用 configure，原生对象差异及验收边界见 [渲染器配置](webgpu.md)。

| 入口                       | 参考                                           |
| -------------------------- | ---------------------------------------------- |
| @adui/three                | [场景与资源](core.md)、[渲染器配置](webgpu.md) |
| @adui/three/controls       | [控制器](controls.md)                          |
| @adui/three/loaders        | [模型加载](loaders.md)                         |
| @adui/three/animation      | [动画](animation.md)                           |
| @adui/three/camera         | [相机](camera.md)                              |
| @adui/three/interaction    | [拾取](interaction.md)                         |
| @adui/three/labels         | [DOM标签](labels.md)                           |
| @adui/three/geometry       | [几何](geometry.md)                            |
| @adui/three/collision      | [碰撞](collision.md)                           |
| @adui/three/navigation     | [导航](navigation.md)                          |
| @adui/three/capture        | [截图](capture.md)                             |
| @adui/three/textures       | [纹理](textures.md)                            |
| @adui/three/environment    | [环境](environment.md)                         |
| @adui/three/rendering      | [渲染配置](rendering.md)                       |
| @adui/three/lighting       | [灯光](lighting.md)                            |
| @adui/three/effects        | [特效](effects.md)                             |
| @adui/three/postprocessing | [后处理](postprocessing.md)                    |
