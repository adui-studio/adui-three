# ADR-0013 原生变换手柄与输入协调

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-025
- 替代关系：无，扩展 controls 可选入口

## 决策

attachTransformControls(app, options) 返回 controls、helper、disposed、attach、detach 和 dispose。单宿主一个库手柄；可选 object、orbitControls、mode=translate、space=world、size=1。模式平移/旋转/缩放，空间 world/local，尺寸正有限；目标须为本场景后代且不能是自有 helper。OrbitControls 必须使用同一相机和 canvas。初始非法参数在分配/挂载前拒绝。

使用原生 TransformControls 与 getHelper，不将 controls 当 Object3D。先断开构造，再显式连接和加入 scene，使部分连接或同步宿主销毁可回滚。句柄登记宿主资源、按身份清除独占槽位；目标借用，模型移除时消费者先 detach。改变目标用句柄 attach/detach；原生对象用于参数和事件扩展，不单独 connect/disconnect/dispose 或绕开句柄切换目标。

拖拽开始保存借用 OrbitControls 的 enabled、enableDamping 和 autoRotate，临时置 false，update(0) 消耗残余惯性，不创建更新订阅。原生 enabled 只阻止输入，不阻止显式 update，因此还需暂停 damping/autoRotate。释放只恢复仍为 false 的配置，保留外部已改为 true 的值；update 错误先恢复再抛出。消费残余惯性可能在开始时产生最后一次相机更新，不承诺回滚该次更新。

原生 pointerUp、失焦、pointercancel、lostpointercapture、句柄 detach/dispose 都结束借用租约。即使原生 enabled 在拖拽中改为 false，包装 pointerup 仍处理结束；只释放确认为手柄拖拽的 pointer capture，不捕获额外指针。取消保留对象当前位置，不自动 reset 或提供撤销栈。

## 所有权与失败

构造后立刻遍历原生 helper 的公开树，快照并去重 geometry/material；消费者后来加进去的对象仍借用。释放依次解除库监听、结束拖拽、停用并 detach 原生控制、移除 helper、公开 disconnect，再通过 ResourceScope 尝试全部快照资源。未调用原生 dispose 的整树遍历，因为它会包含后加外部节点且某项抛错会中断后续资源释放。没有访问原生私有 gizmo/plane/事件字段，固定 r187 helper 资源结构，升级时重新审查。

disconnect 无条件写 touchAction，因此包装按值恢复原 canvas 值；外部改成其他值则保留。宿主资源倒序清理，手柄先于先前创建的 OrbitControls 清理。外部自己持有的控制器存活与清理顺序由其所有者负责。

清理错误继续尝试剩余资源后聚合，重复清理不重试失败项。原生事件中同步销毁不复活 helper；native 事件回调的任意副作用不回滚。不能通过构建成功声称手柄输入或 GPU 资源行为已通过，需实际浏览器验证。

## 演示与边界

演示在启用手柄时取消相机过渡、暂停模型动画，停止自身程序旋转，避免两个写入者。模型加载/移除清除旧目标，加载后绑定新模型；手柄模式用原生 setMode。消费者从原生 change 事件决定暂停状态下 app.render，库本身不绘制、不启停、不创建 RAF 或 ResizeObserver。

只提供原生对象变换及生命周期，不是编辑器、拾取管理、Undo/Redo、持久化、碰撞约束或多选变换。不支持多个手柄并发驱动同一 OrbitControls，也不保证同时进行相机过渡/动画写入的语义；直接配置原生参数和监听异常由应用负责。共享原生 raycaster 不由库修改。

## 验证

单测保留真实原生 helper/geometry/material、Scene 和 OrbitControls，只替换 DOM 表面。验证选项、目标/独占、借用资源、配置恢复、取消、捕获、同步销毁、连接失败和全部资源尝试。

浏览器通过真实绿色轴像素定位并进行鼠标拖拽，验证对象变化、相机稳定/释放后可旋转、暂停不推进时间和双实例；验证模型替换/移除、模式和重建，并以真实 WebGL buffer/program 计数做三轮释放基线回归。实际结果见 Harness。

## 来源

- [TransformControls 官方 API](https://threejs.org/docs/pages/TransformControls.html)
- [r187 TransformControls](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/controls/TransformControls.js)
- [r187 OrbitControls](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/controls/OrbitControls.js)
