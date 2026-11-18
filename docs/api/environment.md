# 环境

## HDR 环境

配置读取完成后再次检查宿主、资产/扩展 scope 和绑定独占状态；选项 getter 引发的同步销毁或嵌套绑定会使外层调用在场景写入前失败。getter 自身产生的副作用由调用者负责，不撤销有效嵌套绑定。

```ts
import { loadHDR, attachEnvironment } from "@adui/three/environment";

const controller = new AbortController();
const environment = await loadHDR(app, "/studio.hdr", { signal: controller.signal });
// 加载只创建资产。应用先检查请求版本，决定是否应用。
const binding = attachEnvironment(app, environment, { background: true, intensity: 1 });
if (app.state !== "running") app.render();
// binding.dispose(); // 恢复场景，资产可再次绑定。
// environment.dispose(); // 先解绑，再释放纹理与原生缓存；宿主销毁也会释放。
```

loadHDR 返回 HDREnvironment，提供原生 texture、前置资源 resources、disposed 与幂等 dispose。保留 HDRLoader 的 HalfFloat 和 LinearSRGB，设置 EquirectangularReflectionMapping；不自动改场景、绘制或启停。options 支持 signal、onProgress({ loaded, total, ratio }) 和 onCleanupError；未知总量为 null。取消立即拒绝 AbortError，迟到字节跳过解码，不中止可能与其他请求共享的运输。进度回调异常拒绝本任务；已结算后的清理异常交报告器或控制台。

attachEnvironment 只借用同一宿主的活动 HDREnvironment；background=false、intensity=1，强度为非负有限数。每个宿主一个绑定，替换时先释放旧绑定。EnvironmentBinding 提供 disposed 和幂等 dispose，同时登记宿主/资产 scope；解绑不释放资产，资产释放先解绑再纹理清理。原场景 environment、background 和强度只在当前值仍属于绑定时恢复，保留外部变更。原值借用，需由外部保持存活；相同值改回的 ABA 无法区分。

原生 renderer 自动生成 PMREM 照明/立方背景并在源纹理 dispose 时清理，不需手动生成。生成器共享 scratch 会保留至 renderer.dispose；释放单资产回到预热基线。不要单独 texture.dispose，也不要在释放资产后继续将纹理借用于其他场景/材质。当前仅 Radiance 等距柱状 HDR，不含 EXR、跨宿主资源共享或完整硬件/长期资源承诺。

### EXR 环境图

```ts
import { loadEXR, attachEnvironment } from "@adui/three/environment";

const exr = await loadEXR(app, "/studio.exr", { signal: abort.signal });
const binding = attachEnvironment(app, exr, { background: true });
app.render();
binding.dispose();
exr.dispose();
```

loadEXR 与 loadHDR 共用 LoadHDROptions/HDREnvironment（HDR 表示高动态范围资产）和显式绑定/释放；前者以原生 part=0、半浮点 RGBA 解析 EXR，后者保持 RGBE。保留原生色彩/方向/过滤，设置等距柱状映射，不猜格式、自动曝光、写材质或创建循环。

相同 URL 下载可合并，EXR 解压前独立复制输入；取消是逻辑性的，不能抢占同步解析或承诺运输终止。迟到纹理/错误、所有者结束和重试沿用既有环境契约。绑定与 GPU 缓存先清，再释放源纹理；不要另行 dispose 借用纹理。原创 64×32 FLOAT scanline 样例离线生成，半浮点/照明与 GPU 清理通过验证；其他压缩、多 part、深度 EXR 和硬件矩阵没有逐项验收。

## Room 环境

createRoomEnvironment(app,{sigma?,size?})默认sigma=.04、size=256，复用原生Room/PMREM，返回拥有cube target的资产；不绑定或启动宿主。

attachEnvironment(app,room,{background?,intensity?})显式绑定，room.dispose先解绑再清理。绘制期不能生成Room，目标释放遵循绘制结束边界；原生异常前未返回的分配仍有局限。完整示例见[Editor配置](rendering.md)。
