# 动画与路径运动

## GSAP 场景时间线

```ts
import { gsap } from "gsap"; // 应用自行安装；SDK 不依赖 GSAP。
import { attachGSAPTimeline } from "@adui/three/animation";

const timeline = gsap
  .timeline({ paused: true, repeat: 1, yoyo: true })
  .to(mesh.position, { x: 3, duration: 2, ease: "power2.inOut" });
const motion = attachGSAPTimeline(app, timeline, { scope: model.resources });
motion.pause();
motion.seek(1); // 秒；静默采样并暂停，不触发 GSAP 回调、不自动绘制。
app.renderOnce();
motion.setPlaybackRate(0.5);
motion.resume();
// motion.restart() 从0重播；motion.dispose() kill 自己的时间线。
```

传入已填充、暂停的根时间线，并交给句柄清理；绑定后禁止直接 play/reverse/seek、改结构、加入其他父时间线或接 ScrollTrigger。支持有限 repeat/yoyo，不接受无限根 repeat 或初始反向状态。SDK 通过结构接口调用 totalTime，不导入 GSAP，不修改全局 ticker，页面动画独立运行。

句柄提供 timeline、state、time、duration、playbackRate、disposed；autoPlay 默认 true，playbackRate 默认快照原生 timeScale，随后通过句柄调整（非负有限，0冻结）。宿主停止/隐藏/零尺寸时不推进；到达 totalDuration 后 finished，使用 restart 重播。原生回调里的控制排队到采样后；回调中销毁立即撤销更新，kill 延后至采样结束。dispose 保留最后姿态，随宿主或额外 scope 执行。

避免与 Mixer、路径或相机控件同时写同一属性。原生回调报错沿用宿主异常策略。见[基础示例](../examples/basic.md)和 [ADR-0053](../adr/0053-gsap-timeline.md)。

## 模型动画

```ts
import { attachGLTFAnimations } from "@adui/three/animation";

const model = await loadGLTF(app, "/models/animated.glb");
const animations = attachGLTFAnimations(app, model);
animations.play("Lift", { loop: "repeat", timeScale: 1 });
animations.setPlaybackRate(0.5); // 模型内全部动作与渐变半速；0 冻结时钟。
// animations.pause(); animations.resume();
// animations.seek(0.5); // 精确定位到片段第 0.5 秒后暂停。
// animations.play("Slide", { loop: "once", clampWhenFinished: true });
// animations.stop(); // 恢复 Mixer 绑定属性原值，并清除当前片段。
// animations.dispose(); // 只清理动画，模型仍可使用。
```

返回 `GLTFAnimationsHandle`，包含 mixer、clips、action、state、disposed 和 play/crossFadeTo/seek/pause/resume/stop/dispose。构造时不自动播放或启动宿主；clips 是原生片段引用的只读数组快照，空列表也可创建。play 按非负整数索引或唯一完整名称选择，未知/歧义名称、越界、非正有限 duration、无效 tracks 拒绝并保留原播放；原生 clip.validate 可能输出诊断。播放期间不要修改片段数据。

模型级运行倍速用 `animations.setPlaybackRate(rate)`，`playbackRate` 读取当前原生 mixer.timeScale，初始 1；允许非负有限数，0 冻结该模型动作和渐变时钟，宿主/其他模型继续。它与 play 的动作级 timeScale 相乘，保留片段、循环预算、当前姿态与混合权重；不会恢复 paused 或 finished 状态，不采样/绘制/启动。速度跨 seek/stop/play 保留，新控制器默认 1；通知内设置沿用命令队列，失败/销毁丢弃待执行设置。原生 mixer 仍公开，直接写入不受本 setter 校验。

play 选项：loop="repeat"（默认）、"once" 或 "pingpong"；repetitions 为正安全整数或 Infinity（repeat/pingpong 默认 Infinity，once 默认且只接受 1）；clampWhenFinished=true（默认）；timeScale=1（正有限倍速）。重复播放同一片段也从零开始；play 切换立即停止旧 action；需要渐变时使用 crossFadeTo。调用时采样首帧，后续由宿主 onUpdate(delta) 驱动；宿主停止/隐藏/零尺寸期间不前进，恢复首帧 delta=0。pause/resume 保持姿态、时间和配置的速度，不改变宿主或 mixer.timeScale；idle/finished 时无操作。

repetitions 按单向遍历计数：`animations.play("Lift", { loop: "pingpong", repetitions: 2 })` 是一去一回，奇数次保留片段终点、偶数次保留起点。有限 repeat 完成保留片段终点。库在原生迭代返回后归一化 r187 的往返末帧，不读取私有循环计数；不为此推进 Mixer 时间。

往返中 action.time 是原生循环本地时间，反向阶段不直接等于实际采样的片段时间。seek 仍定位到正向片段秒数并暂停，同时重置循环历史，保留次数和模式；它不是整个往返过程的绝对时间轴。crossFadeTo 继承 repetitions；复用仍在播放的目标时继续其原生循环进度，配置的次数是总预算而非追加次数。

state 为 idle/playing/paused/finished/disposed，描述控制器状态；有限次数播放结束进入 finished，clamp=true 保留末姿态，false 按原生 binding 规则恢复未被其他 action 使用的属性。stop 恢复绑定属性、清空 action 和 Mixer 时间；停止、暂停时可再次 play。销毁后 play/seek/pause/resume 抛错，stop/dispose 幂等。

seek(seconds) 仅接受已有选择的 [0,clip.duration] 有限秒数，零 delta 采样后进入 paused，保持 mixer.time、loop/clamp/weight/timeScale，不启动宿主或绘制。可检查已完成动作，精确端点保持到 resume 后依循环规则推进；定位重置过去循环次数及原生淡变/warp。若正在 crossFadeTo，定位会停止其他贡献并以全权重检查当前目标。暂停画面需要应用 app.render。原生事件内的定位依序执行，并在执行前按实际片段重新校验；队列更早的切换/stop 可能使请求失效并抛错。

句柄同时登记 app.resources 与 model.resources，任意所有者结束都会取消订阅、停止 action 并 uncacheRoot，不释放模型资产。原句柄缓存清理完成前，同一根对象不能再创建句柄。原生 loop/finished 事件中调用控制方法会在本次 Mixer 更新返回后执行；dispose 先失效并丢弃排队命令，延后清缓存。若事件中移除模型，GPU 资产可能先释放，CPU 采样结束后再完成缓存清理；不会重新挂载模型。

mixer/action 可查询及配置参数；采样、action 调度和缓存由句柄管理，不要再手动 update/play/stop/uncache 或为同一属性添加竞争写入者。业务注册的原生事件监听自行移除；持有句柄/mixer 引用仍可保留 CPU 模型。本入口不引入 GLTFLoader 运行时代码，不提供反向、任意混合图、骨骼重定向或状态机。浏览器原创样例只验证节点动画，骨骼/morph 与复杂资产仍需专门验证。

### 渐变切换

```ts
animations.play("Lift");
animations.crossFadeTo("Slide", { duration: 0.4, loop: "repeat", timeScale: 1 });
// animations.blending / animations.blendProgress（0..1）
// animations.pause(); animations.resume(); // 冻结/继续整个交接。
```

CrossFadeOptions 的 duration 默认 0.3，正有限 Mixer 秒，其他选项同 play。目标从当前有效权重渐变到 1，其他动作从各自当前权重降到 0；中断重新拍快照，保持瞬时复合姿态。已活动目标保留片段时间，同一当前目标无操作，重播用 play；没有旧动作时正常播放，不从空姿态淡入。结束进度为 1，旧动作在原生采样返回后停止，当前目标保持运行。每片段最多一个 native action，结束只留目标，缓存仍按既有 Mixer 生命周期清理。

`crossFadeTo` 也支持 easing: "linear" | "smoothstep"，默认 linear，animation 入口同样导出 TransitionEasing。只缓动权重，片段时间和倍速保持，blendProgress 仍是原始时间比例；中断基于当前实际有效权重交接。非法值在替换前拒绝，预设准备时捕获，不调用消费者逐帧函数。

暂停/停止宿主均冻结交接，无独立时钟。duration 受 mixer.timeScale 缩放，允许 0 暂停，须非负有限；action timeScale 只改变片段速度。当前只支持普通 blend mode 和 [0,1] 有效权重，不提供 additive、warp 或自定义权重曲线。目标 once 提前结束时继续交接，渐变结束后 state 才为 finished；clamp 行为沿用原生规则。

play/stop 取消渐变，seek 取消其他贡献并定位目标；blendProgress 初始/取消为 0，完成为 1。控制方法仍按原生事件队列依序执行，dispose 立即失效、原生返回后释放全部缓存。不要同时手动控制 native 淡变、action 调度或 Mixer 采样。异常沿用宿主停止/抛出，不承诺回滚已采样姿态；骨骼/morph 等复杂资产仍待验证。

### 动画通知

```ts
const off = animations.on("finished", ({ clip, direction }) => {
  console.log("已完成采样", clip.name, direction);
  animations.play("Slide"); // 在本批通知结束后执行。
});
animations.on("loop", ({ loopDelta }) => console.log("跨越循环", loopDelta));
// off(); // 只解除这一条订阅。
```

on 的事件 payload 由 GLTFAnimationEvents 按事件名推断，公共 union 为 GLTFAnimationEvent；都有借用的 action/clip。通知发生在当前选中动作采样、往返端点归一化和渐变权重交接完成后，早于宿主 GPU 绘制。渐变目标提前结束时延后 finished，离场动作不派发控制器完成；loop 沿用原生合并的 loopDelta，不保证每轮单独通知。

回调同步执行，不等待异步结果；play/crossFadeTo/seek/stop 在本批通知后按序处理。相同函数可独立订阅，派发中解除会跳过尚未执行的回调，新订阅从后续通知生效；销毁跳过后续通知并清订阅。回调抛错则停止本批、丢弃未执行命令并按宿主异常策略传播。stop/seek/pause 不制造 finished，订阅不回放历史完成；不要在回调里直接 update 原生 Mixer。

## 对象路径运动

```ts
import { followPath } from "@adui/three/animation";
import { CatmullRomCurve3, Vector3 } from "three";

const curve = new CatmullRomCurve3([
  new Vector3(-2, 0, 0),
  new Vector3(0, 1, 2),
  new Vector3(2, 0, 0),
]);
const motion = followPath(app, model.scene, {
  curve,
  duration: 4,
  loop: "once",
  orientToPath: true,
  scope: model.resources,
});
// motion.pause(); motion.resume(); motion.cancel();
// motion.setPlaybackRate(0.5); // 只改变后续步长；0 冻结该对象的采样。
const result = await motion.finished; // completed / cancelled（含原因）/ failed（含 error）
```

对象需已挂在本宿主 scene 下且使用自动矩阵，库借用它和曲线；创建时立即设置起点，不启动宿主或绘制。每次宿主更新以 (delta/duration)*playbackRate 推进，loop 默认为 once，可选 repeat/pingpong 默认无限循环到取消，也可指定有限 repetitions；progress 为当前局部弧长比例，回程递减。duration 是基准单向遍历秒数。getPointAt 使用原生近似弧长采样，父级非均匀缩放后不保证世界匀速；曲线控制点和弧长配置在运动期间保持不变，开放曲线 repeat 会跳回起点。

orientToPath 默认 false，仅写 position；true 时局部 +Z 沿切线，回程反向，不提供倾斜或平滑转向。暂停保持姿态，resume 不补墙钟时间。finish/cancel/dispose 保留当前姿态并释放宿主、可选 scope 的登记、订阅和 abort 监听，不释放对象或其 GPU 资产。scope 可以是 model.resources，模型结束立即取消且完成后自动解除两处登记。

同一对象的新合法请求替换旧运动；无效/预先 abort 的请求保留旧运动。外部改写所占用的位置/旋转、重新挂接、脱离 scene 或关闭自动矩阵，下次更新以 target-changed 结束；只控制位置时允许外部改旋转，scale 始终由应用管理。自定义曲线回调后重新核对取消/所有者，错误记为 failed 并按宿主帧异常规则抛出。原生字段自定义副作用不承诺事务回滚；不含碰撞、导航网格或相机漫游。独立演示为 `/?demo=path`。

### 有限循环

`repetitions` 可指定正安全整数或 Infinity；once 默认且仅 1，repeat/pingpong 默认无限。基准单向一程耗时 duration，往返一次为两程，例如 `followPath(app, object, { curve, duration: 2, loop: "pingpong", repetitions: 2 })`。有限 repeat 停在进度 1；pingpong 奇数停在 1、偶数回到 0，开启朝向时保留到达方向，不释放目标或借用资源。progress 仍表示当前曲线比例。

### 路径倍速

路径也提供 `motion.playbackRate` / `motion.setPlaybackRate(rate)`：初始 1，非负有限数，仅缩放后续步长，保留位置、朝向、有限程数和暂停状态。0 跳过采样但继续检查所有者/外部修改；宿主和另一目标继续。seek 保留速度，新句柄默认 1；已结束或采样/写入重入时拒绝设置，不改变原速度。非有限缩放步长在新采样前失败，不保证全部 Number 极值组合可表示。

### 路径定位与预览

对存活的路径运动调用 `motion.seek(0.5)`，会按弧长比例采样并暂停；应用可显式 `app.renderOnce()` 展示，再 `motion.resume()` 从该处继续。定位不启动宿主，不改变曲线/duration 或资源归属；返回阶段统一重置为首个正向阶段。

允许 [0,1] 有限值。`seek(1)` 仍暂停预览，定位会重置有限程数历史，继续后的更新按剩余程数处理完成、回绕或换向。结束句柄不能重新定位，需创建新的 followPath。采样中改变控制状态或目标/所有者会丢弃旧候选，采样错误终结 failed 并同步抛出；不回滚已发生的业务或自定义变换写入。
