# 原创环境资产

studio.hdr 是本项目用数学渐变生成的 64×32 Radiance RGBE 环境（MIT），无第三方图片或编码工具。运行 `pnpm run fixtures:environment` 可离线逐字节重建；像素包含大于 1 的线性亮度，不用于性能或真实照明标定。invalid.hdr 为故意无效的失败样例。

studio.exr 是同尺寸的原创独立渐变，采用 OpenEXR version 2 单 part、未压缩 scanline、B/G/R FLOAT 通道和递增行顺序；生成器直接写标准二进制结构，无第三方编码器。原生 EXRLoader 默认输出线性半浮点 RGBA、flipY=false，峰值大于 4。invalid.exr 是故意无效的文本；同一命令同时重建 HDR/EXR，格式参考 [OpenEXR 官方布局](https://openexr.com/en/latest/OpenEXRFileLayout.html)。
