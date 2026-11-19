# 第一与第三人称

第一/第三人称控件接受共同的 PerspectiveSceneApp，可用于 WebGL 或 WebGPU 透视宿主；碰撞、输入和运动仍在宿主时钟内处理，不读取图形后端能力。

## 第一与第三人称

按需导入 navigation；核心不会加载碰撞库。第一人称使用原生 PointerLockControls，第三人称使用原生 OrbitControls，二者共享宿主更新和角色运动逻辑。先 dispose 旧 attachOrbitControls / 导航句柄，再切换控制器。演示：开发服务的 `/?demo=navigation`，两个场景独立运行。

```ts
import { attachFirstPersonControls } from "@adui/three/navigation";
import { createCollisionWorld } from "@adui/three/collision";
import { Vector3 } from "three";

// app 是已创建的 ThreeApp，obstacles 是显式的静态普通 Mesh 根对象列表。
const world = app.resources.track(createCollisionWorld(obstacles));
const player = attachFirstPersonControls(app, {
  world,
  position: new Vector3(0, 0.02, 4), // 世界足点；原生场景和相机采用 Y-up
});
app.start();
// 在用户点击按钮时 await player.lock()；Escape 或 player.unlock() 释放鼠标。
// 程序/手柄输入：player.setInput({ forward: 1, right: 0, sprint: false });
// player.clearInput(); player.jump(); player.teleport(new Vector3(0, 0.02, 4));
```

第三人称调用 `attachThirdPersonControls(app, actor, options)`；actor 为场景的直接子节点，推荐使用 Group 包裹动画模型。控制器独占 actor.position，模型子节点可独立播放动画；用 teleport 代替直接移动 actor。借用 actor/world，不负责释放模型。第三人称另可传 distance（默认4）和 cameraPadding（默认.15），相机射线遇障碍向 target 收回；只保护相机中心，不能代替球体或视锥碰撞。

句柄暴露 controls、disposed、enabled、grounded 和独立 position/velocity 快照；setEnabled、setInput、clearInput、jump、teleport、dispose。第一人称另有 locked、lock():Promise<void>、unlock()。启用不启动/绘制场景；原生 controls.enabled 还取决于宿主运行、可见和非零尺寸。lock 要求用户手势，拒绝重复在途申请，结束后迟到授权释放；未授权失败由调用者处理。

默认 speed=4、sprintMultiplier=2、radius=.3、height=1.8、eyeHeight=1.6、jumpSpeed=6、terminalSpeed=20、maxSubsteps=32、maxSlopeAngle=PI/4；有 world 时 gravity=20，否则0。维度/速度正有限，重力/跳跃可0；身高至少2radius，视点不超过身高。keyboard 默认 true：第一人称须拥有指针锁，第三人称须画布聚焦且无其他锁；WASD/方向键、Shift、空格。setInput 复制[-1,1]轴，斜向归一，不要求焦点；失焦/隐藏/禁用/销毁清空输入。宿主暂停不推进，重启清键盘输入，显式程序输入可保留。

场景无变换，相机无父级、Y-up、单位缩放、自动矩阵。不要改原生 controls.object 或绕过运动器直接移动相机/actor；新取景/相机过渡会释放导航租约。控制器可另登记 scope；结束解除监听、宿主更新、原生控件和输入，只释放自身资源。子步超预算、世界失效或碰撞不收敛会抛错、结束控制器，并触发宿主更新异常策略。
