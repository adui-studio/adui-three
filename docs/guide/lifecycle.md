# 生命周期与资源

## 一个容器，一个宿主

ThreeApp和OrthographicThreeApp拥有独立scene、camera、renderer、canvas及循环。创建为ready，start显式运行，stop暂停，dispose结束。重建使用新宿主，不复活旧实例。

## 更新与绘制

onUpdate的delta以秒计，模型、路径、控件与特效共用宿主节奏。暂停后render只绘制一帧，不推进动画或启动循环。不要在更新回调再维护另一套renderer/composer循环。

零尺寸或页面隐藏自动暂停调度，保留运行意图。尺寸和DPR由宿主管理，不应每帧重复setSize。

## 自有与借用

geometry、material、texture分别登记到app.resources。登记Mesh不会递归接管它引用的共享资产。

模块返回的句柄各有所有权。显式dispose或结束宿主清理已登记资源；可用ResourceScope提前结束子模块。借用资产仍由原所有者管理，各API说明具体边界。

## 异步与卸载

取消是逻辑取消；迟到结果不会重新挂回已结束宿主，但不能保证共享传输或原生解码立即停止。原生失败时未返回的局部资源仍有边界。应用异步状态需判断signal或请求版本。

框架中把app.dispose放入卸载钩子。额外DOM事件可使用app.signal；第三方UI和框架根需应用自行卸载。

[宿主API](../api/core.md) · [模型生命周期](../adr/0003-gltf-lifecycle.md)
