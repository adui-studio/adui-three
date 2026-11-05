# ADR-0011 选择描边与组合效果链

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-023
- 替代关系：扩展 ADR-0010，保留 attachBloom 兼容入口

## 决策

postprocessing 新增 attachPostprocessing(app, { bloom?, outline? })，至少指定一项。返回 PostprocessingHandle，包含可选原生 bloom/outline、disposed、dispose；整个对象登记 app.resources。attachBloom 委托同一实现，继续返回 pass/清理句柄，不创建第二条管线。

固定顺序为 RenderPass → 可选 OutlinePass → 可选 UnrealBloomPass → OutputPass。描边在泛光之前，边缘可参与亮度阈值泛光；颜色转换只在末尾执行。不提供任意 pass 编排或独立句柄的隐式合并。

OutlineOptions 接受 selectedObjects 数组快照（对象借用）、edgeStrength=3、edgeThickness=1、edgeGlow=0、enabled=true 和可选可见/隐藏 RGB hex 颜色。强度/光晕非负有限，粗细限制于 r187 核范围 [1,4]，颜色为 0..0xffffff 整数。未提供颜色沿用原生默认，未指定效果不分配对应 pass。pulsePeriod 保持默认 0，不新增脉冲时钟。

消费者直接更新 outline.selectedObjects 和参数，选择状态由业务/拾取决定。库不释放借用模型，不自动跟踪目标删除；演示在模型替换、移除时先清空选择。释放立即清空 selectedObjects，按既有契约延后清理正在执行的原生调用。

OutlinePass 会临时改写 scene.background、overrideMaterial 和对象 visible。启用且有选择时保存场景与借用选择的可见性快照，仅在绘制异常时恢复，成功时保留应用有意修改。这有一次遍历/Map 成本，不承诺回滚任意用户副作用，不访问 pass 私有缓存。

尺寸更新和绘制共享操作保护：拒绝半途重入渲染，resize 回调中释放也等原生操作返回后销毁 GPU 资源。多个绘制/清理失败仍聚合，失败初始化释放槽位；尺寸快照仅在原生设置成功后记录。宿主对失败尺寸保留 dirty 标记，后续同尺寸 resize 或再次绘制前重试，避免使用半更新目标；借用 renderer 和场景资产的归属不变。

## 验证与边界

原生构造单测验证选项、顺序、选择快照、颜色/核范围、借用资源、场景恢复和 resize 内销毁/重入。浏览器验证黄色边缘实际像素、真实拾取/空白清除、模型替换/移除、多实例，并将 GPU 计数回归扩展到三轮泛光+描边组合释放。实际结果见 Harness。

沿用原生组/网格选择，不提供单独 instanceId 的描边、透明图案级像素选择或完整骨骼/morph 资产验证。直接开启原生 pulsePeriod 使用原生墙钟，不属于宿主 delta 保证。持有原生 pass 仍可能保留 CPU 引用，应用应解除不再需要的引用。

## 来源

- [r187 OutlinePass](https://github.com/mrdoob/three.js/blob/r187/examples/jsm/postprocessing/OutlinePass.js)
- [OutlinePass 官方文档](https://threejs.org/docs/pages/OutlinePass.html)
