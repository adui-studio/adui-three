# ADR-0043 动态特效、滤镜与绘制结束清理

- 状态：Accepted
- 日期：2026-11-18
- 关联需求：FR-056、FR-058、FR-021
- 替代关系：扩展 ADR-0011 效果组合和 ADR-0009 绘制边界

## 特效

新增可选 effects 入口，attachFlyLine / attachLightWall / attachRadar 分别返回独占 Mesh<BufferGeometry,ShaderMaterial> 的 EffectHandle。飞线复用现有 createPathTube，光墙复用 createPathCurve 的采样后作沿局部Y的竖直带，雷达复用 CircleGeometry；片元形态使用独立编写的 GLSL，不迁入旧业务 shader 或远端纹理。

材质使用线性 Color、透明加法混合、双面、depthWrite=false，保留深度测试；统一使用 Three.js 的 tone mapping/colorspace chunks，直接渲染与 HDR composer 各按原生输出规则处理。特效不发光照、不自动投射阴影；泛光由既有 postprocessing 显式组合。默认曲线/点是 Mesh 的局部空间，借用曲线只在构建时采样，不持续保留源曲线引用。

句柄只订阅宿主 onUpdate，不新建调度/绘制。phase 为有界循环比例，speed 是每宿主秒周期数，默认.25；pause/resume/seek/setSpeed 独立于宿主。0倍速保持 running，seek(1)等价0，不自动暂停，定位不启动/绘制。参数非法在分配前拒绝，步长溢出结束并解除订阅后传播宿主；宿主/scope/显式dispose回收自有节点、几何体和材质，不拥有场景、曲线或外加子节点资源。

## 原生滤镜

postprocessing 的 colorAdjustment 可单独或与 outline/bloom 组合，复用官方 BrightnessContrastShader 和 HueSaturationShader，经两个 ShaderPass 后由唯一 OutputPass 输出。顺序为基础渲染→描边→泛光→亮度/对比度→色相/饱和度→输出。滤镜在工作线性空间作用于 HDR 图像；色调/曝光仍由 renderer 决定。

brightness/hue 在[-1,1]，contrast/saturation 在[-1,1)，默认0，enabled默认true。Float32量化后的正端点1会让原生 shader 除零，封装显式拒绝；公开 colorAdjustment 的两原生pass供动态 uniforms 和 enabled 调整，调用者后续原生写入须自行保持合法范围。每条链独立克隆原生uniforms，不增加第二composer；仍由既有管线独占、原生场景异常恢复和执行期延后释放管理。

## 绘制结束边界

私有 render-retirement 在每次宿主真正调用原生 renderer 或借用管线时，为该 renderer 建立同步清理队列；默认核心只依赖此无GPU模块，不反向导入 effects/lighting。新模块在绘制回调中dispose时先标记结束和解除订阅/登记，节点移除和GPU释放在全部原生pass返回后的finally执行。原生阴影递归遍历 live children，提前detach会破坏遍历，因此不是只延后纹理释放。

普通帧外dispose仍同步；队列先解除登记再尝试全部清理，绘制与清理失败聚合，失败也解除边界。不同renderer互不等待，嵌套同renderer共享最外层边界；正常宿主仍拒绝帧重入。不拦截应用绕过宿主直接调用 renderer.render 的绘制。既有后处理继续自身executing保护，无额外RAF或异步清理错误通道。

## 验证与来源

单测使用真实 Three.js 几何/ShaderMaterial，验证时钟、scope、早期结束、独立uniforms、奇异参数和退休队列；浏览器实际编译shader、读取像素、验证暂停/定位/滤镜及绘制回调释放。边界与环境见 [Harness](../HARNESS.md)。

- [ShaderMaterial 官方文档](https://threejs.org/docs/pages/ShaderMaterial.html)
- [ShaderPass 官方文档](https://threejs.org/docs/pages/ShaderPass.html)
- [BrightnessContrastShader 官方源](https://github.com/mrdoob/three.js/blob/master/examples/jsm/shaders/BrightnessContrastShader.js)
- [HueSaturationShader 官方源](https://github.com/mrdoob/three.js/blob/master/examples/jsm/shaders/HueSaturationShader.js)
- 代码以本地固定 Three.js 0.187.0 为准；Skills 面向r186，仅作设计参考。
