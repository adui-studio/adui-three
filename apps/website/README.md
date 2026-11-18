# 浏览器回归 Playground

保留既有双实例调试场景，供 tests/browser 验证异步取消、重入、GPU回收、输入与生命周期竞争。正式用户示例见 [examples](../../examples/README.md)。

仓库根目录运行 `pnpm run dev:playground`。原有 ?demo=effects、editor、navigation 等入口保持可用，资产从共享 fixtures 提供。此包为私有消费者，不进入 SDK tarball。
