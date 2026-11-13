# 旧版 CustomThree 审查

## 来源与范围

2026-11-04 只读检查本机 `D:/Workspace/bn/zhgk-web-v3/src/plugins/CustomThree`，以及旧项目 package.json。此路径为本机参考，其他机器不可假定存在；新库不依赖该目录。本轮未运行旧项目，也未做完整渲染或泄漏测试；下列为源码观察。

旧项目声明 three ^0.181.2、@types/three ^0.180.0、gsap ^3.13.0、three-mesh-bvh ^0.9.3、three-pathfinding ^1.3.0；声明版本不等于锁定安装版本。未读取 .env，也不复制业务资产、路径坐标或第三方库文件。

## 能力盘点与去向建议

2026-11-13 仅读取旧工程已安装公共依赖的 package.json：three 版本字段为 0.181.2，@types/three 为 0.180.0，与上述声明一致。没有据此推断业务运行或 0.187.0 迁移兼容；原运行、资源与许可证审查边界保持。

| 旧文件                                                                  | 已观察能力                                                                | 新版建议                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| CustomThree.js                                                          | scene/camera/renderer、OrbitControls、CSS render、拾取、相机动画、dispose | 提取最小宿主，统一生命周期         |
| CustomModel.js                                                          | GLTF/GLB/OBJ/FBX、加载进度、加密模型                                      | 先按需求选格式；加密留应用扩展     |
| CustomLabel.js                                                          | DOM/CSS2D/CSS3D、Vue render、标签事件                                     | DOM 能力与框架挂载分离             |
| CustomLight.js                                                          | 灯光封装                                                                  | 先确认是否比原生 API 更有价值      |
| CustomEffect.js / CustomBloom.js / CustomOutline.js / CustomRGBShift.js | 路径、雷达、泛光、描边、RGB 偏移                                          | 可选模块，统一渲染出口             |
| CustomPathfinding.js / CustomRoaming.js                                 | 导航网格、碰撞、漫游控制                                                  | 后续需求；不进入首轮默认能力       |
| CustomUtils.js / libs / shader / path                                   | 路径提取、路径几何、着色器和业务路线                                      | 区分通用算法、第三方源码、业务数据 |

## 具体发现

| 编号 | 源码位置与事实                                                                                                                                                | 风险及后续验证                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| L-01 | CustomThree.js:10 引入 useScreenStore；CustomLabel.js:2、5 引入 Vue render 和 Store；若干模块使用 @/ 别名                                                     | 无法直接作为通用库；验证主包不依赖应用或 Vue/Pinia                      |
| L-02 | CustomThree.js:158、405 与 CustomLabel.js:40 查找 .three-container；标签监听 window 并修改 body 光标                                                          | 多实例与嵌入容器互相影响；验证双容器事件隔离与坐标                      |
| L-03 | CustomThree.js:193 起每帧更新投影、setSize 和 devicePixelRatio * 2                                                                                            | 重复配置且放大绘制负载；验证稳定尺寸不重复 resize，DPR 有约束           |
| L-04 | CustomThree.js:235 和 CustomEffect.js:76 起各有动画/渲染循环                                                                                                  | 同时运行时可能重复渲染；验证单调度、单 WebGL 输出                       |
| L-05 | CustomThree.js:511 dispose 清主循环和部分对象，但未调用 label/effect 的清理，未统一遍历登记自有场景资源；CustomLabel 有 removeEventListeners 但无统一 dispose | 可能遗留监听、模块或 GPU 资源；需释放登记与多次挂载卸载验证，未实测泄漏 |
| L-06 | CustomModel.js:16-17 从 VITE 环境变量读取 AES 配置；_setupModelMaterial 默认改写 alphaMap/metalness/roughness                                                 | 应用策略混入通用加载；保留原材质为建议默认，解密按应用注入              |
| L-07 | CustomThree 公开多个可变 setter，模块长期持有原 scene/camera/renderer                                                                                         | 外部替换后引用可能不一致；明确哪些对象可替换及传播策略                  |
| L-08 | libs/three.path.module.js 等第三方/来源待核验代码与 path/ 业务坐标并列                                                                                        | 迁入前核验来源、许可证和版本；本轮未作许可证完整审计                    |

旧版已有清理逻辑，不能笼统称为“完全没有 dispose”。审查旨在定位未统一的生命周期，未确认问题需要后续可复现用例。

## 维护

旧版仅作为能力和经验参考，不默认兼容所有方法和行为。后续迁移按“旧能力 → 正式需求编号 → 新设计 → 最小用例 → 验收”推进；发现新证据时更新本文件并同步 [需求](REQUIREMENTS.md) 和 [设计](SDD.md)。
