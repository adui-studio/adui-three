# 维护正式示例

## 组成

catalog.ts登记惰性模块、标题与原始源码。cases模块导出mount(context)，返回Promise<SceneApp>，统一使用ThreeApp.create；shared.ts包含场景和DOM辅助，ExampleContext.renderer选择webgl/webgpu/webgpu-strict，创建signal与配置一并传递。9主题使用相同工具栏，URL的renderer参数与浏览器历史同步，并显示实际backend。

异步示例使用 context.signal 取消尚未完成的初始化；挂载后由宿主 signal 管理任务。画廊先取消旧初始化并结束旧实例，并以请求版本防止迟到模块覆盖页面；模型和动画继续使用SDK资源生命周期。

## 新增主题

1. 在examples/src/cases编写模块，只使用公开包入口。
2. 几何/材质分别登记，额外监听绑定app.signal。
3. 在catalog登记模块及?raw源码。
4. 在docs/examples新增说明与源码包含，并添加导航。
5. 执行ready、站点验证；SDK变更另按Harness检查。

## 生命周期

不要另建RAF。工具栏只调宿主start/stop/renderOnce/destroy；动画暂停与宿主暂停需区分。

DOM标签的元素、样式、表单和事件归示例，标签句柄只管理投影与挂载；框架根若加入需自己卸载。
