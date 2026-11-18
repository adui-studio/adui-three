# ADR-0042 三维路径几何

- 状态：Accepted
- 日期：2026-11-18
- 关联需求：FR-055、FR-037
- 替代关系：扩展 geometry 入口；与 ADR-0024 的对象路径运动分离

## 决策与复用

参考 three.path README 所展示的路径几何用途独立实现 createPathCurve / createPathRibbon / createPathTube，不复制上游或旧工程源码，不承诺其 API/几何拓扑兼容，也不增加 three.path 依赖。它不负责导航网格寻路。

createPathCurve 返回拥有独立控制点的原生 CurvePath<Vector3>。线段和二次贝塞尔复用 LineCurve3 / QuadraticBezierCurve3；cornerTrim 是沿两侧边修剪的距离，分别限于任一邻边一半，不是精确圆弧半径。闭合时移除可选重复尾点，生成闭合曲线。相邻重复点、180度反向折返、非有限/零长拒绝；非相邻自交允许，应用负责拓扑。

路径带用原生 computeFrenetFrames 的平行移动帧，按 up 的初始法向投影旋转截面，up 平行初始切线时采用确定性的原生帧。采样中心两侧构造顶点，支持 both / left / right 宽度；三角索引和原生 computeVertexNormals 提供表面法线。闭合完整路径复制首行到末行并平均重复法线，UV 仍沿长度连续。不是精确斜接或道路布尔几何，窄弯与自交不自动修复。

管道完全复用 TubeGeometry 截面、帧、法线和索引，转交其 buffer 给普通 BufferGeometry，释放临时原生对象；不在返回值里保留 PrefixCurve 或借用曲线。曲线前缀适配器把原生 getPointAt/getTangentAt 映射到 [0,progress]，progress 按原生近似弧长比例；0 返回带 position/normal/uv/index 和有效空边界的空几何。管道开口无端盖。

## 接口与预算

三种构建同步、独立于 DOM/宿主/调度。曲线输入2..4096个 Vector3（闭合至少3），有界索引快照绕过用户重写的迭代器；几何选项快照后不重复读取细分 getter。segments 为1..4096整数，闭合完整几何至少3；进度裁切采用 ceil(segments*progress)，不只是改 drawRange。管道 radialSegments 为3..128整数，最坏顶点预算有限。width/radius/UV尺度/箭头尺寸正有限，progress 在[0,1]。

UV.x 为累计近似弧长 / uvScale，UV.y 为截面比例，适合 RepeatWrapping 的等距纹理。箭头占据最后 arrowLength 路程，超过可见长度则仅保留箭头三角形，arrowWidth 独立；单侧路径的箭头中心延续该侧带宽中心。完整闭合路径不允许箭头，部分闭合曲线仍可用开放前缀。

输入和源曲线不修改（原生弧长缓存可能更新），返回几何由调用方独占，可登记到 ResourceScope；修改输入不自动更新顶点。替换时先成功构造新几何，再替换 Mesh.geometry、untrack 并 dispose 旧几何。无自有材质、纹理、Mesh 或渲染循环。构建同步重入拒绝，异常 finally 解锁并释放已构造自有几何；Float32 溢出/非法切线/非有限采样拒绝。精度、采样密度和极小尺度仍受 Three.js 数值表示约束。

## 验证

真实原生几何单测涵盖曲线快照/圆角、宽度/侧边/法线/UV、箭头、进度0和前缀、垂直帧、闭合接缝、重复参数读取、索引预算、极端数值和同步重入；管道顶点与独立原生 TubeGeometry 逐项对照。/?demo=path-geometry 的两实例演示支持暂停时替换参数；Chromium 读取原生像素及 createBuffer/deleteBuffer 的实际存量验证旧几何回收。严格 tarball 消费覆盖三个构建器。实测结果见 [Harness](../HARNESS.md)。

## 来源

- [three.path 公开功能说明](https://github.com/shawn0326/three.path)
- [TubeGeometry 官方文档](https://threejs.org/docs/pages/TubeGeometry.html)
- [CurvePath 官方文档](https://threejs.org/docs/pages/CurvePath.html)
- [QuadraticBezierCurve3 官方文档](https://threejs.org/docs/pages/QuadraticBezierCurve3.html)
- 另核对工作区 Three.js 0.187.0 的 Curve.computeFrenetFrames 与 TubeGeometry 源码；Skill 面向 r186，仅作工作流参考。
