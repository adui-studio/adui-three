# 场景与生命周期

立方体使用暂停的原生 GSAP 时间线，经 attachGSAPTimeline 交给宿主推进；提供独立暂停、继续、重播和中点定位。宿主暂停后仍可显式定位并 renderOnce，销毁场景释放该时间线。API 见[场景时间线](../api/animation.md#gsap-场景时间线)。

在导航栏“运行示例”进入画廊，或访问 /play/?example=basic。场景辅助见[shared.ts](../../examples/src/shared.ts)，画廊负责宿主切换与结束。

## 示例源码

“读取统计快照”展示 captureRenderStats；所有正式主题还可在控制面板展开“渲染统计”，由[共用面板](../../ui/render-stats-panel.ts)消费公开 rendering API，场景代码不依赖面板。详细计数窗口和单位见[统计用法](../api/rendering.md#渲染统计与监视)。

<<< ../../examples/src/cases/basic.ts
