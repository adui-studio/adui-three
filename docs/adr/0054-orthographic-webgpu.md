# ADR-0054 正交双后端创建

- 状态：Accepted
- 日期：2026-11-20
- 需求：FR-073
- 关系：扩展 ADR-0026、ADR-0049、ADR-0050 的正交创建范围

## 决策

OrthographicThreeApp.create 沿用 renderer.type 与 allowFallback；同步 new 仍是 WebGL。异步返回真实 OrthographicThreeApp 实例，泛型默认 webgl，明确 webgpu 时返回原生节点 renderer 类型；不提供另一个 WebGPU 包入口或投影运行时切换。

提取正交相机工厂，在分配 GPU 前校验竖向跨度、near/far、位置和可逆投影。WebGPU 私有准备流程接受具体相机工厂，共用设备初始化、坐标系统、取消、迟到清理和丢失处理。尺寸保留 top/bottom、水平中心与 zoom；near=0 按原生正交协议合法。

两种投影继续使用各自 fit/transition 接口。正式渲染器示例通过 projection=orthographic 显式重建投影；不让旧宿主暗中更换相机。历史原生透视设备验收不自动外推本次正交组合。

## 依据与验证

核验锁定 r187 源码及 [OrthographicCamera](https://threejs.org/docs/pages/OrthographicCamera.html)；单测、节点回退和原生设备范围分别记录在 [Harness](../HARNESS.md)。
