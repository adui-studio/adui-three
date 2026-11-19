import { attachDOMLabels } from "@adui/three/labels";
import { addBox, addGround, createScene } from "../shared.ts";
import type { ExampleContext } from "../shared.ts";
export async function mount(context: ExampleContext) {
  const app = await createScene(context);
  addGround(app);
  const cube = addBox(app);
  const overlay = document.createElement("div");
  overlay.className = "label-overlay";
  context.container.append(overlay);
  app.resources.track({ dispose: () => overlay.remove() });
  const layer = attachDOMLabels(app, overlay),
    card = document.createElement("section");
  card.className = "device-label";
  card.innerHTML =
    '<header><span class="device-dot" aria-hidden="true"></span><strong>循环泵 A-01</strong></header><p>运行状态 <b data-status>正常</b></p><dl><div><dt>温度</dt><dd>42.6 ℃</dd></div><div><dt>负载</dt><dd>68%</dd></div></dl><progress aria-label="设备负载" max="100" value="68"></progress><label>备注 <input type="text" name="device-note" autocomplete="off" aria-label="设备备注" placeholder="例如：例行巡检…"></label><button type="button">查看设备</button>';
  let count = 0;
  card.querySelector("button")!.addEventListener(
    "click",
    () => {
      context.status("设备详情已打开 " + ++count + " 次。");
    },
    { signal: app.signal },
  );
  layer.add({
    object: cube,
    element: card,
    offset: [0, 0.5, 0],
    anchor: [0.5, 0.5],
    interactive: true,
  });
  context.status("完整 HTMLElement：标题、指标、进度条、输入框和按钮；内容由应用拥有。");
  app.start();
  return app;
}
