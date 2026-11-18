# 原创图片纹理

quadrants.png 是本项目通过 Node 内置 zlib 和 PNG 分块生成的 32×32 RGBA 四色方向图（MIT），四象限分别为红、黄、蓝、白。运行 `pnpm run fixtures:textures` 可离线重建，不依赖第三方图像或编码工具；具体压缩字节与当前 Node/zlib 版本有关。invalid.png 是故意无效的解码失败样例。
