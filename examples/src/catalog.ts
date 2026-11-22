import type { ExampleSource } from "./source-viewer.ts";
import type { SceneApp } from "@adui/three";
import type { ExampleContext } from "./shared.ts";
interface ExampleModule {
  mount(context: ExampleContext): SceneApp | Promise<SceneApp>;
}
export interface Example {
  id: string;
  title: string;
  description: string;
  tag: string;
  load(): Promise<ExampleModule>;
  source(): Promise<ExampleSource>;
}
export const examples: readonly Example[] = [
  {
    id: "basic",
    title: "场景与生命周期",
    tag: "CORE",
    description: "从原生立方体开始，理解统一更新、暂停与释放。",
    load: () => import("./cases/basic.ts"),
    source: () => import("../recipes/basic.ts?example-source").then((m) => m.default),
  },
  {
    id: "model",
    title: "模型与动画",
    tag: "ASSETS",
    description: "本地 GLB、动画控制与异步任务所有权。",
    load: () => import("./cases/model.ts"),
    source: () => import("../recipes/model.ts?example-source").then((m) => m.default),
  },
  {
    id: "camera",
    title: "相机与视角",
    tag: "CAMERA",
    description: "立即取景、平滑过渡，以及数值视角的保存恢复。",
    load: () => import("./cases/camera.ts"),
    source: () => import("../recipes/camera.ts?example-source").then((m) => m.default),
  },
  {
    id: "labels",
    title: "交互 DOM 标签",
    tag: "INTERACTION",
    description: "用完整设备卡片展示指标、表单与按钮交互。",
    load: () => import("./cases/labels.ts"),
    source: () => import("../recipes/labels.ts?example-source").then((m) => m.default),
  },
  {
    id: "effects",
    title: "点云与流光",
    tag: "EFFECTS",
    description: "点云飞线、路径流光、波纹、光柱和护罩。",
    load: () => import("./cases/effects.ts"),
    source: () => import("../recipes/effects.ts?example-source").then((m) => m.default),
  },
  {
    id: "shadows",
    title: "光影与环境",
    tag: "RENDERING",
    description: "Editor 色调基准、实时阴影与可选 Room IBL。",
    load: () => import("./cases/shadows.ts"),
    source: () => import("../recipes/shadows.ts?example-source").then((m) => m.default),
  },
  {
    id: "navigation",
    title: "第一与第三人称",
    tag: "NAVIGATION",
    description: "原生相机控件、输入切换与静态 BVH 碰撞。",
    load: () => import("./cases/navigation.ts"),
    source: () => import("../recipes/navigation.ts?example-source").then((m) => m.default),
  },
  {
    id: "instances",
    title: "实例化网格",
    tag: "GEOMETRY",
    description: "一百个实例，共享资产与独立实例数据。",
    load: () => import("./cases/instances.ts"),
    source: () => import("../recipes/instances.ts?example-source").then((m) => m.default),
  },
  {
    id: "webgpu",
    title: "渲染器与输出",
    tag: "RENDERING",
    description: "同一场景切换后端，组合泛光、环境与截图。",
    load: () => import("./cases/webgpu.ts"),
    source: () => import("../recipes/webgpu.ts?example-source").then((m) => m.default),
  },
];
