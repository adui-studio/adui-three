import "./style.css";

interface Adapter {
  info?: {
    vendor?: string;
    architecture?: string;
    device?: string;
    description?: string;
    isFallbackAdapter?: boolean;
  };
  features: Iterable<string>;
  limits: { maxTextureDimension2D: number; maxStorageBufferBindingSize: number };
}
interface BrowserGPU {
  requestAdapter(options: { featureLevel: "core" | "compatibility" }): Promise<Adapter | null>;
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML =
  `<main class="capabilities"><h1>渲染能力诊断</h1><p class="capability-lead">查看当前浏览器是否能提供 WebGPU 适配器。这里检测运行环境，不创建 Three.js 场景，也不修改浏览器或显卡设置。</p><p data-browser-context></p><button data-detect>重新检测</button><span role="status">准备检测</span><section class="capability-grid"><article data-adapter="core"><h2>WebGPU Core</h2><p data-result>等待检测</p><dl></dl></article><article data-adapter="compatibility"><h2>WebGPU Compatibility</h2><p data-result>等待检测</p><dl></dl></article></section><p class="capability-note">GPUAdapter 是浏览器选择的图形设备接口，不是需要安装的 npm 包。返回 null 表示当前浏览器没有交付可用适配器；原因可能在浏览器策略、驱动、远程会话或运行环境。检测结果不能单独证明某块显卡不支持 WebGPU。</p><h2>如何继续</h2><p>先确认页面运行在 HTTPS 或 localhost，查看浏览器 GPU 状态与硬件加速设置，再在具备可用设备的浏览器选择严格 WebGPU 模式验证。WebGPURenderer 的 WebGL 2 回退可以验证节点实现，但不能替代原生 WebGPU 设备验收。</p></main>`;
const button = document.querySelector<HTMLButtonElement>("[data-detect]")!;
const status = document.querySelector<HTMLElement>("[role=status]")!;
let generation = 0;
async function detect(): Promise<void> {
  const request = ++generation;
  button.disabled = true;
  status.textContent = "检测中…";
  const gpu = Reflect.get(navigator, "gpu") as BrowserGPU | undefined;
  document.querySelector("[data-browser-context]")!.textContent =
    `安全上下文：${isSecureContext ? "是" : "否"} · WebGPU API：${gpu ? "已暴露" : "未暴露"}`;
  for (const level of ["core", "compatibility"] as const) {
    const card = document.querySelector<HTMLElement>(`[data-adapter=${level}]`)!;
    const result = card.querySelector("[data-result]")!,
      detail = card.querySelector("dl")!;
    detail.replaceChildren();
    try {
      const adapter = await gpu?.requestAdapter({ featureLevel: level });
      if (request !== generation) return;
      card.dataset.state = adapter ? "available" : "unavailable";
      result.textContent = adapter
        ? "可用适配器"
        : gpu
          ? "未取得适配器（null）"
          : "当前上下文没有 WebGPU API";
      if (adapter) {
        const info = adapter.info;
        const values: Array<[string, string]> = [
          ["厂商", info?.vendor || "浏览器未提供"],
          ["设备", info?.description || info?.device || "浏览器未提供"],
          ["架构", info?.architecture || "浏览器未提供"],
          [
            "回退设备",
            info?.isFallbackAdapter === undefined
              ? "浏览器未提供"
              : info.isFallbackAdapter
                ? "是"
                : "否",
          ],
          ["纹理上限", String(adapter.limits.maxTextureDimension2D)],
          ["功能数量", String(Array.from(adapter.features).length)],
        ];
        for (const [label, value] of values) {
          const term = document.createElement("dt"),
            definition = document.createElement("dd");
          term.textContent = label;
          definition.textContent = value;
          detail.append(term, definition);
        }
      }
    } catch (error) {
      if (request !== generation) return;
      card.dataset.state = "error";
      result.textContent = `检测失败：${String(error)}`;
    }
  }
  if (request === generation) {
    button.disabled = false;
    status.textContent = "检测完成";
  }
}
button.addEventListener("click", () => {
  void detect();
});
window.addEventListener(
  "pagehide",
  () => {
    generation++;
  },
  { once: true },
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    generation++;
  });
void detect();
