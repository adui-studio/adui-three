# ADui Three 集成验证工作台

面向 SDK 开发与验收的私有应用。统一导航组织双实例、模型、相机、导航、特效和渲染器场景，用真实画面验证资源、异步任务及生命周期；使用者学习入口仍是 [正式 examples](../../examples/README.md)。

## 运行

在仓库根目录执行 pnpm run dev:playground，打开终端显示的地址。桌面端通过 Studio 侧栏与选择器进入场景，窄屏使用顶部选择器，URL 保持稳定；资产来自共享 fixtures，此应用不进入 SDK tarball。

| 地址参数                 | 场景                                 |
| ------------------------ | ------------------------------------ |
| ?demo=core（或首页）     | 双实例、模型、动画、纹理、截图与资源 |
| ?demo=orthographic       | 透视/正交、取景与视角                |
| ?demo=path               | 路径运动与动画控制                   |
| ?demo=instances          | 实例化网格                           |
| ?demo=path-geometry      | 路径带、箭头与管道                   |
| ?demo=navigation         | 第一/第三人称与静态 BVH              |
| ?demo=effects            | 飞线、光墙、雷达、阴影与滤镜         |
| ?demo=effects-collection | 飞点、流光、波纹、光柱与护罩         |
| ?demo=editor             | 色调、曝光、阴影与环境对照           |
| ?demo=webgpu             | 双后端生命周期、控件与模型           |
| ?demo=webgpu-features    | 双后端扩展操作与完整自检             |
| ?demo=capabilities       | 当前浏览器 WebGPU 能力诊断           |

## 原生 WebGPU 验证

双后端场景支持 backend=webgl、auto、webgpu，运行模式选择器与 URL 同步；webgpu 严格要求原生设备，auto 允许节点渲染器的 WebGL 2 回退。

打开 ?demo=capabilities，检查当前安全上下文、core/compatibility 适配器及厂商、架构、回退标记和能力。GPUAdapter 不是 npm 依赖；浏览器返回 null 只能说明当前上下文没有交付适配器，不能单独判断使用者的物理显卡。

打开 ?demo=webgpu-features&backend=webgpu，确认显示 webgpu / webgpu，再运行扩展自检。检查覆盖后处理与截图、八种动态特效、三种阴影、Room/HDR/EXR、逐像素裁剪与重复资源释放。页面同时提供单项操作和截图预览。

自动化 Chromium 与使用者 Chrome 是不同环境。前者可能只暴露 SwiftShader，后者可能已提供 NVIDIA 等原生适配器；按实际页面结果验收，不能用回退通过代替原生设备验证。

## 验证与维护

pnpm run test:browser 执行集成回归，test:site 验证正式示例及文档站。保留既有选择器和场景 URL，新增工作台导航不改变 SDK 所有权。真实结果与设备范围见 [Harness](../../docs/HARNESS.md)。

## 界面与品牌

使用用户提供的 ADui Three 横向标志，技术包名保持 @adui/three。共享基础令牌与原创静态几何预览不进入 SDK，设计和可访问性维护见[界面设计与品牌](../../docs/development/visual-design.md)。
