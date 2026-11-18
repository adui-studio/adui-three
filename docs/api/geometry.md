# 几何与实例

## 实例化网格

受管理矩阵/颜色在首次实际上传后只标记 16/3 个 Float32 组件。每属性合并为一个待传包络，可能包含稀疏修改之间的未变槽位；公开 onUpload 确认上传并清范围，同时保留既有回调。检测到外部 needsUpdate 版本变化或回调替换则保守回退完整上传，避免混合原生写入丢失；直接数组修改仍由调用者标记上传。没有每帧监听或额外 draw，详见 ADR-0022 的补充。

```ts
import { createInstancedMesh } from "@adui/three/geometry";
import { BoxGeometry, MeshBasicMaterial, Matrix4, Color } from "three";

const geometry = app.resources.track(new BoxGeometry());
const material = app.resources.track(new MeshBasicMaterial());
const instances = createInstancedMesh(app, { geometry, material, capacity: 100 });
instances.setMatrixAt(0, new Matrix4().makeTranslation(2, 0, 0));
instances.setColorAt(0, new Color(0xff0000));
instances.setCount(1);
app.render();
instances.dispose(); // 不释放借用的 geometry/material
```

capacity 是正整数，count 默认 0 且不能超过容量；支持预填尚未激活的槽位。setMatrixAt 复制有限 Float32 仿射矩阵，量化后行列式必须有限且大于零；不支持零缩放或反射。setColorAt 复制非负有限 Float32 线性 RGB。写入自动标记上传，矩阵/count 更新清空原生包围体；不启动循环或隐式绘制。拾取结果保留原生 instanceId。

handle 拥有节点、实例属性、morphTexture 和扩展 resources，登记宿主 scope 并幂等清理；几何体、材质/纹理和外来子节点由调用方管理。material 数组快照列表，addToScene 可设 false，仍由宿主结束清理。公开 mesh 可作原生配置；直接替换自有 buffer 或绕过 helper 改 count/矩阵时，由调用方负责上传、边界和所有权一致性。演示地址 `/?demo=instances`。

原生事件的异常仍遵循 Three.js 的派发语义：调用方在首次绘制前注册的 mesh dispose 监听若抛错，会阻断后续 renderer 监听，WebGL 实例 buffer 可能不能立即释放；BufferAttribute.dispose 在 WebGL 下不能补救这个路径。把会失败的自有清理登记到 instances.resources，避免从原生 dispose 监听抛错。若已经触发，调用方可移除出错监听后显式 mesh.dispose 让原生清理继续；handle.dispose 本身仍幂等且不会重试已结束的 handle。

## 对象世界边界

需要尺寸或中心时，可直接测量原生对象，无需创建宿主或相机：

```ts
import { computeObjectBounds } from "@adui/three/geometry";
import { Vector3 } from "three";

const bounds = computeObjectBounds(object);
const size = bounds.getSize(new Vector3());
const center = bounds.getCenter(new Vector3());
```

返回独立的世界轴对齐盒快照，单位由应用决定。包含隐藏子树和普通网格当前 CPU 骨骼/形变；刷新原生世界矩阵、蒙皮绑定逆矩阵及实例/批次包围盒缓存。实例/批次沿用保守原生盒，不承诺逐实例形变紧边界、shader 位移或实际可见像素尺寸。手动矩阵模式遵循原生更新开关。

函数不绘制、不推进动画、不上传数据或接管对象资源；按需调用，扫描成本取决于顶点/骨骼/实例数量。空或非有限边界抛 RangeError，零尺寸有效，非法对象抛 TypeError；跨根在内的封装同步重入拒绝，以保护原生共享临时向量，准备失败可能保留已更新的原生矩阵/缓存。自定义采样回调仍应避免直接进行原生 Box3 的重入计算。

## 三维路径几何

geometry 提供同步的 createPathCurve、createPathRibbon、createPathTube。参考 three.path 的用途独立实现，复用 Three.js 原生曲线/平行移动帧/TubeGeometry，不依赖或兼容 three.path。开发演示 `/?demo=path-geometry` 支持双实例、进度、拐角、宽度/半径与闭合。

```ts
import { createPathCurve, createPathRibbon, createPathTube } from "@adui/three/geometry";
import { Vector3 } from "three";

const curve = createPathCurve([new Vector3(-3, 0, 0), new Vector3(0, 0, 0), new Vector3(0, 1, 3)], {
  cornerTrim: 0.5,
});
const ribbon = createPathRibbon(curve, { width: 0.4, arrow: true, progress: 0.75 });
const tube = createPathTube(curve, { radius: 0.1, radialSegments: 12 });
// 把返回的普通 BufferGeometry 交给 Mesh，并登记自己的 scope；替换/卸载时 dispose。
// 同一 curve 也可借给 followPath，目标和路径网格采用相同局部坐标空间。
```

曲线复制2..4096个 Vector3 控制点，cornerTrim 默认0，表示沿两侧边修剪距离并以二次贝塞尔圆滑连接，最多各邻边一半，不是圆弧半径。closed 默认 false，闭合至少3点，可重复尾点；相邻重复、180°折返、零长/非有限拒绝。返回新的 CurvePath，源点改变不会影响它。

共享选项 segments=64（整数1..4096，完整闭合至少3）、progress=1（[0,1]）、closed=false、uvScale=1（单位长度/纹理重复）。实际构造近似弧长前缀，progress=0 是带空顶点/索引和空边界的几何体，不只修改 drawRange。UV.x=距离/uvScale，UV.y=截面比例，纹理可用 RepeatWrapping。完整闭合要求曲线首尾匹配；裁切闭合曲线时仍是开放前缀。

路径带 width=1，side 为 both/left/right，up 默认 Y-up，arrow=false，arrowLength/arrowWidth 默认2*width。width 在 both 时两边各一半，单侧时全宽；up 决定初始表面朝向，沿曲线使用原生平行移动帧，垂直初始方向有确定回退。箭头占最后一段可见长度，超过可见长度时只有箭头；完整闭合不允许箭头。管道 radius=.1、radialSegments=8（整数3..128），复用原生 TubeGeometry，不加端盖。

返回几何体和 buffer 由调用方拥有，无宿主、材质、Mesh 或调度器，也不保留源曲线引用。参数变化时先构造成功，再替换 Mesh.geometry、untrack 并 dispose 旧几何；否则旧几何可继续使用。采样/原生帧可能更新曲线弧长缓存，构建期间不要修改借用曲线。同步重入、非法切线、非有限/Float32 溢出拒绝并清理；采样精度、自交和尖锐拐角受数值与细分限制，不提供道路布尔运算或精确斜接修复。
