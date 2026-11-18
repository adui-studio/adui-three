# ADR-0046 常用特效与点云飞线

- 状态：Accepted
- 日期：2026-11-18
- 关联需求：FR-061、FR-062；扩展 FR-056
- 替代关系：复用 ADR-0043 时钟、材质和绘制结束清理

## 目标与选择

用户要求增加常用特效，并明确飞线可以使用点、还需要流光。因此保留 attachFlyLine 的管道形态，新增原生 Points 飞线 attachFlyPoints、路径带流光 attachFlowLine，以及扩散波纹 attachRipple、光柱 attachLightPillar 和能量护罩 attachShield。不把管道设为所有飞线的必要依赖，不复制旧封装或第三方 shader。

复用 Three.js r187 的 CircleGeometry、CylinderGeometry、SphereGeometry、Points、Curve.getPointAt，以及既有 createPathRibbon。所有新增效果仍在 effects 可选入口，不新增依赖、composer 或调度。新演示显式采用 Editor Neutral/1 创建配置，并提供透视、正交两实例及可选既有泛光。

## 原生节点与共用生命周期

EffectPlayback 提取已存在的 state/phase/speed/暂停/恢复/定位/调速/销毁契约；既有 EffectHandle 继续暴露原类型 mesh。FlyPointsHandle 单独暴露 points，不将原生 Points 冒充 Mesh。内部泛型挂载器只统一自有几何/材质/节点、订阅及宿主/scope 的资源管理，公开节点引用和动态 getter 保持各自类型。

所有形态共用宿主 onUpdate；phase 有界循环，speed 是每宿主秒的图案周期数，0保持running，seek(1)等价0且不自动暂停/绘制。节点和GPU资源的销毁在当前宿主绘制结束后执行；直接渲染和composer共享相同边界。外加子节点及其资源仍归消费者。

## 新增形态

- Ripple：半径2、Circle细分64、3圈、波宽.15。局部XZ平面；UV径向重复波向外流动并沿半径衰减，贴地时由应用给小幅Y偏移。
- LightPillar：半径.45、高4、径向细分64的开放Cylinder；几何上移height/2，以y=0为底部，条纹和纵向脉冲沿局部Y显示。
- Shield：半径2、Sphere横向细分48、纵向ceil(segments/2)，Fresnel指数2、经线格12（纬线频率为其一半）。使用视空间法线/视线、绝对夹角的双面边缘项及UV网格/脉冲；正交视线为固定视空间Z，透视使用位置到相机的视线。没有碰撞、折射或物理防护模拟。
- FlyPoints：256个近似等弧长的固定采样点，点大小6个drawing-buffer物理像素，tail=.25。独立position/aProgress属性，顶点shader决定尾迹权重，gl_PointCoord作柔和圆点，显式gl_PointSize。每帧只改phase，既不重采样曲线也不上传位置；DPR变化不自动改变物理点大小，最终大小受硬件point-size范围限制。
- FlowLine：宽.12、细分128的连续路径带，默认3段重复脉冲、tail=.3，横向边缘衰减；不借用/修改模型材质或纹理。speed代表整体重复图案的周期，不是每个光头走完全程的次数。

## 输入与所有权

新空间形态radius/height和路径长度/宽度必须是有限正数且能表示为非零有限Float32；shape segments是16..256整数，rings为1..16，波宽/tail为(0,1]且Float32非零。shield指数为.1..16有限数、网格数4..64整数；points count为2..65536整数、size为1..64有限数；flow pulses为1..32整数，路径细分遵循既有1..4096预算。

曲线仅在构建时借用；points复制采样坐标，检查Float32溢出，ribbon使用既有独立buffer。后续修改源曲线不会自动更新效果；需要重建，并由消费者更新原生曲线的弧长缓存。尺寸、颜色与采样上限在节点挂载前检查，构建/挂载失败回滚已知自有资源。仍使用线性颜色、加法混合、双面、depthWrite=false和原生tone/colorspace chunks；没有额外网络纹理。

## 验证与边界

真实几何单测验证范围、采样快照、原生Points、参数、共用时钟与绘制期释放；新增 /?demo=effects-collection 实际读取五种形态的像素，在两类相机验证定位/冻结/显隐、原生点绘制和可选泛光。资源回归区分基础场景的三个几何体与composer保留的一个全屏三角形，再检查多轮回到相同基线和释放composer后的贴图归零。不用mock shader结果代替真实编译。

浏览器实测范围和命令结果见 [Harness](../HARNESS.md)。当前仍是WebGL2；透明排序、深度遮挡、硬件点大小及加法叠加遵循原生限制，不提供遮挡穿透、物理照明或性能承诺。

- [Points](https://threejs.org/docs/pages/Points.html)
- [Curve](https://threejs.org/docs/pages/Curve.html)
- [CylinderGeometry](https://threejs.org/docs/pages/CylinderGeometry.html)
- [SphereGeometry](https://threejs.org/docs/pages/SphereGeometry.html)
- [ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)
