# @adui/three 正式示例

面向使用者的小型示例，直接消费公开包入口。每个示例都有自己的 mount 函数，画廊负责切换、销毁、重建和源码展示。现有复杂回归界面保留在 apps/website。

## 运行

在仓库根目录执行：

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

访问终端中的 /play/ 地址。`pnpm run examples:build` 生成本目录 dist；`pnpm run docs:build` 会将同一构建嵌入 VitePress 的 /play/ 路径。

| 示例           | 源码                                     | 主题                           |
| -------------- | ---------------------------------------- | ------------------------------ |
| WebGPU基础宿主 | [webgpu.ts](src/cases/webgpu.ts)         | 异步初始化、实际后端、模型动画 |
| 场景与生命周期 | [basic.ts](src/cases/basic.ts)           | 原生对象、单一循环、显式释放   |
| 模型与动画     | [model.ts](src/cases/model.ts)           | GLB、异步加载、Mixer           |
| 相机与视角     | [camera.ts](src/cases/camera.ts)         | 取景、过渡、数值快照           |
| 交互 DOM 标签  | [labels.ts](src/cases/labels.ts)         | 完整卡片、输入框、按钮         |
| 点云与流光     | [effects.ts](src/cases/effects.ts)       | Points、路径带与空间特效       |
| 光影与环境     | [shadows.ts](src/cases/shadows.ts)       | Editor 配置、阴影、Room        |
| 第一与第三人称 | [navigation.ts](src/cases/navigation.ts) | 控件、输入、静态 BVH           |
| 实例化网格     | [instances.ts](src/cases/instances.ts)   | 共享资产与实例数据             |

所有资产从共享 [fixtures](../fixtures/README.md) 构建，不依赖私有模型。完整文档见 [示例目录](../docs/examples/index.md)。

## 新增示例

1. 在 src/cases 新建模块，导出 mount(context)，返回自有 ThreeApp。
2. 使用 [shared.ts](src/shared.ts) 的基本场景和输入辅助，不另建渲染循环；额外监听使用 app.signal。
3. 在 [catalog.ts](src/catalog.ts) 登记惰性模块和原始源码。
4. 在 docs/examples 新增说明并引用实际源文件；运行类型、构建和站点浏览器验证。

切换时先结束旧实例；异步模型跟随宿主取消。HTML/样式/交互由示例拥有，库不依赖此目录。
