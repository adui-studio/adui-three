# ADR-0012 HDR 环境资产与显式场景绑定

- 状态：Accepted
- 日期：2026-11-05
- 关联需求：FR-024
- 替代关系：无，新增可选 environment 入口

## 决策

loadHDR(app, url, options) 只加载，不改变场景。使用 FileLoader 的 arraybuffer 运输，结束后通过 r187 HDRLoader.createDataTexture 解析；默认 HalfFloat、LinearSRGBColorSpace，设置 EquirectangularReflectionMapping。返回 HDREnvironment，拥有 texture、前置清理 resources、disposed 和 dispose，登记宿主资源。无 CDN、自动绘制或新调度。

调用方 signal、宿主 signal 或资源 scope 释放立即逻辑取消。FileLoader 全局合并同 URL 运输，因此不调用 manager.abort，不修改共享字节。迟到结果在解析前跳过；若同步解析中取消，返回纹理仍被消费清理。进度报告已下载字节、可知总量和比例，回调错误只拒绝本任务。已结算后的清理错误交 onCleanupError 或控制台，报告器自身异常仍记录；不承诺中止下载或同步解码。

attachEnvironment(app, environment, { background=false, intensity=1 }) 借用本宿主尚存活的 HDREnvironment。单宿主只有一个库绑定，重复/跨宿主/销毁/非法参数在写入前拒绝；不提供隐式替换栈。应用先 dispose 旧绑定，再显式绑定新资产。加载与绑定拆开，使应用可在完成时校验请求版本，避免旧异步请求覆盖新意图。

绑定保存 environment、可选 background 和 environmentIntensity。释放按当前值判断恢复：environment 仍等于本纹理才恢复原值；intensity 还等于写入值才恢复。background 单独按纹理身份恢复。外部替换保留，无法识别修改后又改回相同值的 ABA。前值借用，外部负责其存活。

绑定同时登记宿主与资产 resources，解绑不释放资产；资产释放先清扩展/绑定再释放纹理，失败继续处理并聚合。原生 texture 不应单独 dispose，持有公开引用可能延长 CPU 数据生命周期。直接把此纹理用于其他场景/材质属于借用，应用需在资产销毁前解除引用。

## 原生环境转换

配置读取完成后再次检查宿主、资产/扩展 scope 和绑定独占状态；选项 getter 引发的同步销毁或嵌套绑定会使外层调用在场景写入前失败。getter 自身产生的副作用由调用者负责，不撤销有效嵌套绑定。

r187 WebGLEnvironments 会为等距柱状纹理生成立方背景和 PMREM 照明结果，并监听源纹理 dispose 回收对应目标。封装不重复生成 PMREM，不访问或接管 renderer 私有缓存。PMREMGenerator 的共享 scratch 资源保留到 renderer.dispose；单资产清理验收以预热后的 renderer 基线比较，不能误报首次预热留存为泄漏。宿主仍负责最终 renderer 释放。

## 验证与边界

单测保留真实 HDR 解析和原生纹理/Scene，控制 FileLoader 运输。浏览器验证实际 HDR 照明/背景像素、暂停绘制、泛光组合、同 URL 单请求取消隔离、销毁/错误恢复和三轮预热基线 GPU 计数。资产是项目原创 64×32 RGBE 数学渐变，可用 fixtures:environment 离线确定性重建；不是照明标定图。

只支持 Radiance HDR 等距柱状图；不涵盖 EXR、立方六面、增益 JPEG、旋转动画、跨宿主共享所有权、任意纹理加载或完整设备/长期资源基准。初始强度非负有限；直接原生配置由应用管理。

## 来源

- [HDRLoader 官方文档](https://threejs.org/docs/pages/HDRLoader.html)
- [DataTextureLoader.createDataTexture](https://threejs.org/docs/pages/DataTextureLoader.html)
- [Scene 环境和背景](https://threejs.org/docs/pages/Scene.html)
- [r187 WebGLEnvironments](https://github.com/mrdoob/three.js/blob/r187/src/renderers/webgl/WebGLEnvironments.js)：本地安装的固定版本源码已核验
