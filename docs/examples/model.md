# 模型与动画

此示例使用 loadAssets 同时准备 detached 模型和 HDR：可取消加载，失败额外重试一次；全部完成后才挂载模型，可随后启用预加载环境。批次清理会一并结束模型动画和环境绑定。API 见[统一资产任务](../api/loaders.md#批量准备资产)。

在导航栏“运行示例”进入画廊，或访问 /play/?example=model。场景辅助见[shared.ts](../../examples/src/shared.ts)，画廊负责宿主切换与结束。

## 示例源码

<<< ../../examples/src/cases/model.ts
