import { attachRenderMonitor } from "@adui/three/rendering";
import type { RenderMonitorSample } from "@adui/three/rendering";
import type { SceneApp } from "@adui/three";

export interface RenderStatsPanel {
  refresh(): void;
  dispose(): void;
}
const rows = [
  ["fps", "观测 FPS"],
  ["interval", "帧间隔"],
  ["drawCalls", "绘制调用"],
  ["triangles", "三角形"],
  ["geometries", "几何体"],
  ["textures", "纹理"],
  ["programs", "程序"],
  ["bytes", "资源估算"],
] as const;
const integers = new Intl.NumberFormat("zh-CN");
const decimal = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const mebibytes = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Application presentation only; the SDK owns no DOM panel or CSS. */
export function mountRenderStatsPanel(app: SceneApp, container: HTMLElement): RenderStatsPanel {
  const root = container.ownerDocument.createElement("details");
  root.className = "render-stats";
  root.innerHTML = `<summary>渲染统计</summary><dl>${rows.map(([key, label]) => `<div><dt>${label}</dt><dd data-stat="${key}">—</dd></div>`).join("")}</dl><p>原生计数遵循后端重置规则；帧间隔为宿主绘制观测值，资源估算不等于显存占用。</p>`;
  const cells = Object.fromEntries(
    rows.map(([key]) => [key, root.querySelector<HTMLElement>(`[data-stat="${key}"]`)!]),
  );
  let disposed = false;
  let lastState = app.state;
  const render = (sample: RenderMonitorSample): void => {
    if (disposed) return;
    lastState = sample.stats.state;
    root.dataset.renderer = sample.stats.rendererType;
    root.dataset.backend = sample.stats.backend;
    root.dataset.draws = String(sample.draws);
    const number = (value: number | null): string =>
      value === null ? "—" : integers.format(value);
    const values = {
      fps: sample.fps === null ? "—" : decimal.format(sample.fps),
      interval:
        sample.frameIntervalMs === null ? "—" : `${decimal.format(sample.frameIntervalMs)} ms`,
      drawCalls: number(sample.stats.drawCalls),
      triangles: number(sample.stats.triangles),
      geometries: number(sample.stats.geometries),
      textures: number(sample.stats.textures),
      programs: number(sample.stats.programs),
      bytes:
        sample.stats.estimatedBytes === null
          ? "—"
          : `${mebibytes.format(sample.stats.estimatedBytes / 1048576)} MiB`,
    };
    for (const [key, value] of Object.entries(values)) cells[key]!.textContent = value;
  };
  const monitor = attachRenderMonitor(app, { onSample: render });
  const panel: RenderStatsPanel = {
    refresh() {
      if (!disposed && app.state !== lastState && app.state !== "disposed") render(monitor.read());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      monitor.dispose();
      app.resources.untrack(panel);
      root.remove();
    },
  };
  try {
    render(monitor.snapshot);
    app.resources.track(panel);
    container.append(root);
  } catch (error) {
    panel.dispose();
    throw error;
  }
  return panel;
}
