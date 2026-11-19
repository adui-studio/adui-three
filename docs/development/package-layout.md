# 目录与包边界

## 工作区

```text
packages/three/   可分发SDK
examples/         正式示例与源码画廊
apps/docs/        VitePress配置和主题
apps/website/     集成工作台、场景导航与GPU能力诊断
fixtures/        共享资产与许可
docs/            指南、API、开发记录及ADR
tests/           GPU浏览器、站点和包消费
```

只有packages/three为可分发库，其余消费者为private。库不得反向依赖应用、fixture、Store或固定DOM选择器。

## SDK源码

src根级17个文件保留公开入口；目录容纳内部实现：

| 目录       | 职责                             |
| ---------- | -------------------------------- |
| core       | 宿主、帧循环、资源和绘制结束边界 |
| camera     | 视图、取景、过渡与相机租约       |
| geometry   | 世界边界与路径构建               |
| loaders    | GLTF资产/实例和转码任务          |
| animation  | 路径运动                         |
| controls   | 变换手柄                         |
| navigation | 角色运动器                       |
| textures   | 独立KTX2                         |
| shared     | 共用缓动                         |

内部目录不构成深层导出。默认核心不反向打包加载器、BVH、shader或composer。

## 分发与资产

tarball仅含dist、src、包README和LICENSE。Three.js保持peer依赖，BVH是显式依赖。

fixtures通过Vite publicDir供两消费者使用，浏览器models/textures/environments路径保持不变。文档构建把正式示例静态产物嵌入/play/，SSR不执行浏览器SDK。
