# 相机

## 相机取景

```ts
import { computeObjectFrame, fitObject } from "@adui/three/camera";

const plan = computeObjectFrame(app.camera, model.scene, { padding: 1.2 });
const frame = fitObject(app, model.scene, { padding: 1.2 });
// 已有 OrbitControls 时，传 controls: orbitHandle.controls，复用同一控件。
console.log(plan.bounds, frame.center, frame.position, frame.near, frame.far);
```

computeObjectFrame 更新目标及祖先/后代世界矩阵，按世界 AABB 的包围球计算中心、半径与相机位置，不改变相机姿态或裁剪面。返回 `ObjectFrame` 的 bounds/center/position 是独立快照；隐藏后代也纳入边界，原生实例/批处理边界需由应用保持有效。空/零/非有限边界和超出数值精度的取景拒绝。

`ObjectFrameOptions`：padding 默认 1.2、有限且 >=1；minimumDistance 默认 0、有限非负；direction 可指定从中心指向相机的非零世界向量，默认保持当前视线方向。计算同时考虑垂直 FOV、aspect 对应的水平 FOV 和 zoom。包围球方案会留空白，不自动改变模型位置/尺寸，不保证最紧凑构图，也不覆盖着色器位移。

fitObject 使用当前 app.camera 和尺寸立即应用；支持宿主 ready/stopped/running，零尺寸、宿主或 resource scope 销毁后拒绝。支持未挂父节点、无缩放、自动矩阵且无 view/filmOffset 的透视相机。默认 adjustClipping=true，设置推荐 near/far；它们针对当前目标，其他物体可能被裁剪。设 false 时保留现有裁剪面，并先检查能否容纳整个取景球。

传入 `FitObjectOptions.controls` 时必须属于当前相机。遵守 minDistance，maxDistance 或 cursor/目标半径约束无法容纳时写入前拒绝；不修改这些限制。控件角度限制仍生效，返回 position 反映最终位置。通过公开 update(0) 先消耗残余惯性，再同步相机/target；临时关闭的 damping/autoRotate 标志始终恢复。原生 change 回调会执行，回调中销毁宿主阻止后续取景写入；同相机重入拒绝。消费者回调抛错时，不承诺回滚原生更新已产生的变动。

蒙皮目标在计算前刷新所引用的骨骼世界矩阵（包括目标子树外的骨骼），并按原生 bindMode 更新绑定逆矩阵，再采样当前顶点。暂停后直接改变父级变换或骨骼姿态，也无需先渲染一帧才能正确取景；不修改骨骼 inverse-bind 数据、推进动画或创建骨骼 GPU 纹理。这不包含自定义顶点着色器位移。

两个函数不创建循环、资源句柄、订阅或自动播放/启动，也不直接 render。暂停时应用若希望立即显示，可显式 render 一次并更新标签；演示使用这一方式。旋转、动画、resize 或模型替换后，按需重新调用取景。相机过渡见下节；正交/父级/偏轴相机留后续，详见 [ADR-0007](https://github.com/adui-studio/adui-three/blob/main/docs/adr/0007-camera-framing.md)。

### 正交自动取景

```ts
import { computeOrthographicFrame, fitOrthographicObject } from "@adui/three/camera";

const plan = computeOrthographicFrame(app.camera, object, { padding: 1.2 });
const frame = fitOrthographicObject(app, object, { controls: orbit.controls });
console.log(plan.zoom, frame.distance);
app.renderOnce();
```

这里 app 为 OrthographicThreeApp，object 为借用 Object3D，orbit 为可选 OrbitControls 句柄。规划不写相机；应用设置位置/朝向、zoom 和默认推荐裁剪面，不改未缩放视锥、不绘制或启动场景。返回 OrthographicObjectFrame，包含世界边界、包围球、中心、位置、距离、near/far 及 zoom。采用保守包围球以容纳任意朝向，可能比最紧凑取景留白更多。

默认 padding=1.2（>=1）、minimumDistance=0；可指定世界 direction。相机需未挂父级、无缩放、自动矩阵且视锥居中，不支持 view offset；无效/空/退化边界拒绝。蒙皮准备包含子树外骨骼和当前绑定逆矩阵。控件必须属于该相机；不兼容的缩放、距离和目标限制先拒绝，保留调用方配置。adjustClipping=false 保留原生 near/far（near 可为 0），范围不足则拒绝。回调异常释放准备/应用写锁，恢复控件配置，但不回滚原生副作用。尺寸/对象改变后自行重新取景；shader 位移不属于 CPU 边界保证。

## 相机平滑过渡

```ts
import { transitionToObject } from "@adui/three/camera";

const motion = transitionToObject(app, model.scene, {
  controls, // 可选，当前相机的原生 OrbitControls
  duration: 0.8, // 正有限秒数，默认 0.8
});
app.start(); // 由应用决定；库不会自动运行宿主。
const result = await motion.finished;
if (result.status === "failed") console.error(result.error);
// motion.cancel(); 或 motion.dispose(); 幂等，不跳至终点。
```

选项继承 FitObjectOptions，另接受可选 AbortSignal signal，沿用即时取景的相机、边界与控件限制。目标是调用时快照，不跟随动画、变换或删除；模型移除时由应用取消，必要时可登记到 model.resources。duration 以宿主有效 delta 计时，固定 smoothstep；停止、隐藏或零尺寸期间暂停，恢复不补墙钟时间。无独立 RAF、render 或自动启停。

句柄提供只读 state（running/completed/cancelled/failed）、progress（未经缓动的 0..1）及 finished。finished 始终 resolve：completed 含 frame，cancelled 无 frame，failed 含 error；同步非法输入仍抛错，且在打断旧过渡前校验。更新回调异常清理并 resolve failed 后仍向宿主抛出，使宿主停止；清理异常聚合到 failed 结果。已 abort 的 signal 返回 cancelled 句柄。句柄自动登记 app.resources，cancel/dispose 与宿主清理均解除订阅。

无 controls 时插值位置及 quaternion；有 controls 时插值 target、轨道距离和最短方向旋转，原生角度限制继续生效。过渡期间 enabled、enableDamping、autoRotate 临时设 false，公开 update(0) 清惯性；结束仅恢复仍为 false 的属性，外部已改为 true 的值保留。不要同时安排其他相机写入者；在原生同步 change 事件中重入 fitObject/transitionToObject 会拒绝，可安全取消或销毁。

同相机新过渡或有效 fitObject 会取消旧过渡。有 controls 时画布 pointerdown/wheel 捕获阶段取消，不阻止同一事件交给恢复后的控件。外部尺寸、投影、姿态、控件约束或可观察配置变化，在下一次有效更新取消；暂停期间不轮询。取消保留当前姿态；adjustClipping=true 会先扩展裁剪面，只有完成才收紧，取消保留扩展范围。false 保留原裁剪面并检查终点可见范围。路径不避障、不保证中途完整可见；不提供独立暂停、正交/父级相机或自定义缓动。

### 正交平滑取景

```ts
import { transitionOrthographicToObject } from "@adui/three/camera";

const motion = transitionOrthographicToObject(app, object, {
  controls: orbit.controls,
  duration: 0.8,
});
app.start(); // 消费者明确决定运行；宿主暂停时过渡也暂停。
const result = await motion.finished;
if (result.status === "completed") console.log(result.frame.zoom);
```

沿用正交即时规划，按宿主 delta 插值姿态/轨道与 zoom，返回 CameraTransitionHandle<OrthographicObjectFrame>；原句柄/结果默认类型仍为 ObjectFrame。每相机最多一个过渡，无自动启动/绘制或独立时钟，finished 始终 resolve completed/cancelled/failed。支持 cancel/dispose、signal、替换、即时 fit、宿主/scope 结束及带控件的输入取消。

尺寸、视锥/zoom、姿态或控件缩放约束改写在下次更新取消；默认先扩裁剪、完成后收紧，near=0 有效，取消保留当前姿态/zoom。控件配置按值租用/恢复，即时取景先完成旧租约交接。目标改变后自行取消并重新规划，不保证过渡中全部可见或避障。

## 保存和恢复视角

```ts
import { captureCameraView, restoreCameraView } from "@adui/three/camera";

const saved = captureCameraView(app, { controls: orbit.controls });
const json = JSON.stringify(saved); // 消费者自行存储。
const actual = restoreCameraView(app, JSON.parse(json), { controls: orbit.controls });
app.renderOnce();
```

CameraView 是 version=1 的透视/正交联合快照，含独立 position/quaternion/up 数组、zoom、near/far，可选轨道 target；透视含 fov，正交含 top/bottom/centerX。没有场景、模型、userData 或 GPU 引用，可在原宿主结束后恢复到同类新宿主。恢复按当前 CSS 比例适配，保持垂直构图，不保存旧 aspect、renderer 或深度模式；类型字段只读不表示运行时冻结。

capture 不写相机、取消过渡或推进时间，零尺寸可用；restore 需要有效视口，完整校验后取消旧过渡，返回实际视图，不绘制或启动。只支持未挂父级、无缩放、自动矩阵且无 view/filmOffset 的相机，拒绝坏版本/数值/镜头范围。

带控件保存会记录 target，并要求无 roll、单位 up；带控件恢复需已有 target、同相机与相同 up。距离、正交缩放和目标限制先校验，原生角度限制可调整最终姿态。控件惯性通过公开 update 消耗，配置与共享写锁在异常后恢复；原生副作用不回滚。演示“保存视角 / 恢复视角”使用内存 JSON，库不访问 localStorage 或业务 Store。

平滑返回书签时使用同一 camera 入口：

```ts
import { transitionToCameraView } from "@adui/three/camera";

const motion = transitionToCameraView(app, saved, { controls: orbit.controls, duration: 1 });
app.start(); // 消费者决定何时运行；宿主暂停时过渡也暂停。
const result = await motion.finished;
if (result.status === "completed") console.log(result.view); // 原生约束后的实际独立快照。
// motion.cancel(); // 保留当前状态，立即解除控件租约。
```

只支持同类相机。输入与源配置验证后才替换原运动，与取景和即时恢复共用一份相机租约；不自动启动或绘制。smoothstep 插值位置/朝向、zoom 与镜头，借用控件时同步 target 和原生限制。near/far 开始扩展、完成恢复，取消保留当前投影；无控件 up 仅在完成恢复。有控件仍要求相同单位 up、无 roll，原生角度限制可能改变终点。

scope/signal/输入/新相机命令可结束过渡；CSS 尺寸、外部姿态/投影/控件约束变化在下次有效更新取消。结束按值恢复 enabled/damping/autoRotate，不释放借用对象。原生回调副作用不回滚，错误同步传播且 finished resolve failed。`/?demo=orthographic` 同时提供立即恢复、平滑恢复、取消和进度。

取景/书签选项还支持 `easing: "linear" | "smoothstep"`（camera 入口导出类型 TransitionEasing），默认 smoothstep；匀速时间参数可设为 linear。创建时捕获预设，progress 仍报告未缓动的时间比例，改选项仅影响下一次请求。球面轨道、原生约束和透视投影可能改变世界/屏幕速度，不保证物理匀速；不接受自定义逐帧回调。

取景与书签过渡句柄均支持 `motion.pause()` / `motion.resume()`：只冻结自身进度，state 为 paused，宿主及其他对象继续更新/绘制。暂停保留相机和输入租约，输入/取消/替换/所有者结束仍可结算；外部配置变化在下一宿主更新取消。继续只消费后续 delta，不补暂停时间。原生写入回调中的请求待本次姿态完整提交后生效，终点/异常优先结算；终态调用无操作。演示“暂停相机 / 继续相机”与场景启停分开。

相机过渡也有 `motion.playbackRate` / `motion.setPlaybackRate(rate)`，初始 1，非负有限数，仅改变后续时间推进；duration 为速度 1 的基准宿主秒数。0 冻结时间但保持 running，pause/resume 不改变速度。原生写入期间的设置待当前帧提交后应用；终点/失败会丢弃未应用请求，结束句柄不能再设置，新过渡默认 1。零速度仍检查外部配置/所有者并接受取消，溢出步长在新姿态写入前失败；不支持倒播。演示“相机倍速”只控制最新过渡。
