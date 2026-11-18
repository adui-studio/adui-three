# 共享演示与测试资产

models、textures、environments 中的模型、图片与环境样例由仓库脚本生成，供正式 examples 和回归 playground 共用。具体来源与许可见各目录 README 和 licenses。

两个 Vite 消费者将本目录配置为 publicDir；资产不进入 @adui/three 分发包。修改生成器后使用根目录 fixtures:models、fixtures:textures、fixtures:environment 命令重建，并验证消费端。
