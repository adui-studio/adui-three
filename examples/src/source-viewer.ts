export interface ExampleSource {
  readonly code: string;
  readonly html: string;
  readonly filename: string;
}

export function createSourceViewer(panel: HTMLDetailsElement) {
  const content = panel.querySelector<HTMLElement>(".source-code")!;
  const filename = panel.querySelector<HTMLElement>(".source-filename")!;
  const copy = panel.querySelector<HTMLButtonElement>(".copy-source")!;
  const feedback = panel.querySelector<HTMLElement>(".copy-feedback")!;
  const listeners = new AbortController();
  let source: ExampleSource | undefined;
  let version = 0;
  let reset: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    version++;
    clearTimeout(reset);
    source = undefined;
    copy.disabled = true;
    feedback.textContent = "";
    filename.textContent = "正在加载源码…";
    content.replaceChildren();
    panel.open = false;
  };
  copy.addEventListener(
    "click",
    async () => {
      if (!source) return;
      const request = ++version;
      const code = source.code;
      copy.disabled = true;
      feedback.textContent = "正在复制…";
      try {
        await navigator.clipboard.writeText(code);
        if (request === version) feedback.textContent = "已复制";
      } catch {
        if (request === version) feedback.textContent = "无法复制，请选中代码后手动复制。";
      } finally {
        if (request === version) {
          copy.disabled = !source;
          clearTimeout(reset);
          reset = setTimeout(() => {
            feedback.textContent = "";
          }, 2200);
        }
      }
    },
    { signal: listeners.signal },
  );
  clear();
  return {
    clear,
    set(value: ExampleSource): void {
      clear();
      source = value;
      filename.textContent = value.filename;
      // Only accepts escaped, build-generated Shiki HTML from our source plugin.
      content.innerHTML = value.html;
      const pre = content.querySelector("pre")!;
      pre.tabIndex = 0;
      pre.setAttribute("role", "region");
      pre.setAttribute("aria-label", `TypeScript 源码：${value.filename}`);
      copy.disabled = false;
    },
    destroy(): void {
      clear();
      listeners.abort();
    },
  };
}
