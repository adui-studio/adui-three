# 安装与版本

当前版本0.0.0尚未发布npm，不能将 `pnpm add @adui/three` 当作已可用安装步骤。支持工作区依赖或本地tarball。

## 工作区开发

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Node.js要求>=22.18.0，pnpm固定12.16.1。示例通过workspace:*引用SDK，不需要先发布。

## 外部项目接入

先在本仓库构建并打包：

```sh
pnpm exec vp run @adui/three#build
pnpm --dir packages/three pack --pack-destination ../../dist/local-packages
```

将adui-three-0.0.0.tgz复制到目标应用，在目标应用执行：

```sh
pnpm add ./adui-three-0.0.0.tgz three@0.187.0
pnpm add -D @types/three@0.187.0
```

库携带类型依赖供自身声明解析；应用直接导入Three.js类型时，仍应声明自己的@types/three。peer为>=0.187.0 <0.188.0。

## 平台

ESM、默认WebGL2，可选 [WebGPU基础宿主](../api/webgpu.md)。导入模块不创建DOM、Worker或网络请求，创建宿主需要浏览器容器。框架挂载/卸载和UI状态由应用管理。

[最小场景](getting-started.md) · [旧版迁移](../MIGRATION.md)
