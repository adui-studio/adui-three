# ADR-0052 统一资产批任务

- 状态：Accepted
- 日期：2026-11-20
- 需求：FR-071

## 决策

loadAssets 从既有 loaders 入口导出，接受命名异步任务，推导只读 assets 结果。任务获得 signal、从1开始的 attempt 和主请求 onProgress。默认并发4、额外重试0；并发范围1–32，重试0–10。AbortError 不重试，不提供隐式缓存或物理网络取消保证。

成功任务的句柄转移给批次私有 ResourceScope，不再单独登记到 app.resources；批次本身由宿主拥有。失败结束同批任务、逆完成顺序清理已接受句柄；迟到结果单独 dispose，清理异常走 onCleanupError。自定义任务须交付独占、幂等的 Disposable，并自行清理失败尝试的未交付资源；同批不得返回重复句柄。

progress.ratio 仅为完成任务数/总数；bytes 是当前任务主请求信息，不将下载进度伪装为总解码进度。用户回调异常拒绝并清理整个批次。输入任务与选项在开始时快照；不自动修改场景或调用 render。

预加载是既有 loadGLTF(addToScene:false)、纹理/环境加载后显式挂载或绑定，不另建有隐藏存活期的 preload 缓存。

## 依据与验证

原生 [LoadingManager](https://threejs.org/docs/pages/LoadingManager.html) 负责运输项统计，其全局管理与取消不能替代本项目的任务隔离/迟到资源所有权。实际命令和限制见 [Harness](../HARNESS.md)。
