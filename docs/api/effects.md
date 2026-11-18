# 动态特效

## 飞线、光墙和雷达

可选 effects 入口提供 attachFlyLine、attachLightWall、attachRadar；演示 `/?demo=effects` 可逐项开关、暂停、定位并对比阴影/滤镜。

```ts
import { attachFlyLine, attachLightWall, attachRadar } from "@adui/three/effects";
import { QuadraticBezierCurve3, Vector3 } from "three";

const fly = attachFlyLine(app, {
  curve: new QuadraticBezierCurve3(
    new Vector3(-4, 0, 0),
    new Vector3(0, 5, 0),
    new Vector3(4, 0, 0),
  ),
  color: 0x55ddff,
  radius: 0.05,
  tail: 0.25,
  speed: 0.25,
});
const wall = attachLightWall(app, {
  points: [new Vector3(-2, 0, 0), new Vector3(2, 0, 0)],
  height: 2,
});
const radar = attachRadar(app, { radius: 2, rings: 4, color: 0x60f3ab });
radar.mesh.position.set(0, 0.02, 0); // 雷达默认位于局部 XZ 平面，朝向+Y
fly.pause();
fly.seek(0.4);
fly.setSpeed(0.5);
fly.resume();
// app.start()/app.render() 仍由应用决定；随宿主/scope结束，也可显式 dispose。
```

共用选项 color 为RGB整数（默认0x55ddff），intensity=2、opacity=1、speed=.25周期/秒、addToScene=true和可选scope。intensity非负且可表示为Float32，opacity在[0,1]，speed非负有限。飞线radius=.035、segments=128、tail=.25（(0,1]且Float32非零）；光墙height=2、segments=128、cornerTrim=0、closed=false，基线必须有水平延伸；雷达radius=2、segments=64（16..256）、tail=.25、rings=4（1..16整数）。路径采样segments为1..4096，几何坐标是Mesh局部空间，位置/旋转由应用控制。

句柄暴露自有mesh、disposed、state、phase、speed和pause/resume/seek/setSpeed/dispose。只复用宿主更新，无独立RAF；0倍速仍running，seek在[0,1]循环比例定位且1归0，不自动暂停/绘制。源曲线/点只在构建时采样，之后修改不会重建几何。几何体、材质、节点由句柄拥有，借用源数据和宿主；绘制期间释放会等原生pass返回后移除节点/GPU资源，重复dispose安全，结束后控制命令拒绝。

材质是带深度测试的双面透明加法shader，depthWrite=false，配合既有bloom可形成光晕，不产生实际光照。默认不投射阴影；不要把透明shader特效作为不透明实体caster使用。公开mesh/material保留原生配置能力，不要转移或替换句柄拥有的geometry/material。

## 点云飞线与常用特效

飞线可以按视觉需要选择：`attachFlyLine` 使用管道，`attachFlyPoints` 使用原生Points粒子尾迹，`attachFlowLine` 使用连续路径带和多段流光。它们都只使用宿主时钟，没有额外RAF。

```ts
import {
  attachFlyPoints,
  attachFlowLine,
  attachRipple,
  attachLightPillar,
  attachShield,
} from "@adui/three/effects";
import { QuadraticBezierCurve3, Vector3 } from "three";

const curve = new QuadraticBezierCurve3(
  new Vector3(-4, 0, 0),
  new Vector3(0, 4, 0),
  new Vector3(4, 0, 0),
);
const particles = attachFlyPoints(app, { curve, count: 256, size: 6, tail: 0.3 });
const stream = attachFlowLine(app, { curve, width: 0.15, pulses: 3, tail: 0.35 });
const ripple = attachRipple(app, { radius: 2, rings: 3, width: 0.15 });
ripple.mesh.position.y = 0.03; // 贴地时避开深度重合
const pillar = attachLightPillar(app, { radius: 0.45, height: 4 });
const shield = attachShield(app, { radius: 2, fresnelPower: 2, gridSegments: 12 });

particles.points.position.set(0, 1, 0); // 原生 Points；其他形态仍用 handle.mesh
particles.pause();
particles.seek(0.5);
particles.setSpeed(0.4);
particles.resume();
// particles.dispose() 或 app.dispose()：结束订阅并释放自有节点/geometry/material。
```

五种新效果共用EffectOptions：color/intensity/opacity/speed/addToScene/scope，默认仍为55ddff/2/1/.25/true。EffectPlayback统一pause/resume/seek/setSpeed/dispose与disposed/state/phase/speed；seek不自动暂停或绘制，seek(1)等价0，速度0保持running。FlyPointsHandle暴露points，其他返回EffectHandle并保留mesh。自有节点/几何/材质随宿主或scope结束，绘制中释放等整条管线返回，不拥有外加子节点的资源。

| API               | 默认形态参数                                           | 局部空间与边界                                                                                 |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| attachFlyPoints   | count=256、size=6、tail=.25                            | curve近似弧长固定采样；count为2..65536整数，size为1..64物理像素且受硬件上限限制，DPR不自动放大 |
| attachFlowLine    | width=.12、segments=128、pulses=3、tail=.3             | 连续路径带；pulses为1..32整数，speed为重复图案周期/秒                                          |
| attachRipple      | radius=2、segments=64、rings=3、width=.15              | XZ平面；rings为1..16整数，width为单圈周期比例                                                  |
| attachLightPillar | radius=.45、height=4、segments=64                      | 沿Y的开放圆柱，底部y=0                                                                         |
| attachShield      | radius=2、segments=48、fresnelPower=2、gridSegments=12 | 球形网格/脉冲和视角边缘高光，支持透视与正交                                                    |

新shape细分为16..256整数，shield纬向细分为ceil(segments/2)；指数在.1..16，网格4..64整数。新空间尺寸/路径长度/宽度需为正且可表示为非零有限Float32；tail/波纹width在(0,1]且Float32非零。路径带segments沿用1..4096预算。曲线构建后不再采样，修改曲线需重建效果并自行更新原生弧长缓存；没有每帧位置buffer上传。加法透明、深度测试与硬件点大小遵循原生规则。

开发服务打开 `/?demo=effects-collection`：透视/正交双实例、五种形态独立显隐、定位/倍速、可选泛光和绘制中回收；普通飞线/光墙/雷达仍在 `/?demo=effects`。泛光显式组合既有postprocessing入口，新材质不会自动创建灯光或发光照。
