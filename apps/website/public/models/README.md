# 本地模型 Fixtures

sample.gltf 与 sample.glb 是本项目原创的四面体，带一个内嵌白色 PNG 纹理，采用仓库 MIT 许可。invalid.gltf 故意使用不支持的 glTF 1.0，仅用于失败反馈验证。没有私有资产、外部模型或在线依赖。

在根目录运行 `pnpm run fixtures:models` 通过 [生成脚本](../../../../scripts/generate-model-fixtures.mjs) 重建。浏览器回归使用这两个小文件验证真实 GLTFLoader 解码、纹理与 GLB 路径，不代表已验证大型、压缩、骨骼或复杂资产。
