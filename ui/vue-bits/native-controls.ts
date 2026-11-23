import { attachGlideSelect } from "./GlideSelect.ts";
import { attachWakeSlider } from "./WakeSlider.ts";
import { attachRubberSegment } from "./RubberSegment.ts";
import { attachWarmTooltip } from "./WarmTooltip.ts";
import { attachSloshGauge } from "./SloshGauge.ts";
import type { NativeBitsControl } from "./native-types.ts";

const segment = ".collection-filters, .source-languages, .source-tabs, .example-switcher";
const navigation = ".scenario-nav, .workbench-links, .home-pathways, .VPNavBarMenu";
const panels =
  ".scene-inspector, .source-workspace, .card, .capability-grid > article, .render-stats, .VPSidebar, .site-header, .workbench-commandbar";
const buttons = "button, a.product-button, a.intro-cta, a.source-download";
const fields =
  'input:not([type]), input[type="search"], input[type="text"], input[type="number"], input[type="url"], input[type="email"], input[type="tel"], input[type="password"], textarea';
const status = '.live-state, [role="status"]';
const candidates = `${segment}, ${navigation}, ${panels}, ${buttons}, ${fields}, ${status}, select, input[type="range"], input[type="checkbox"], input[type="radio"], progress, [title]`;

function skin(
  element: HTMLElement,
  name: string,
  className: string,
  update = (): void => {},
): NativeBitsControl {
  const previous = element.getAttribute("data-vue-bits");
  element.dataset.vueBits = name;
  element.classList.add(className);
  update();
  return {
    update,
    destroy() {
      element.classList.remove(className);
      if (previous === null) delete element.dataset.vueBits;
      else element.setAttribute("data-vue-bits", previous);
    },
  };
}

/**
 * Official Vue Bits interactions adapted to the borrowed DOM used by scene controllers.
 * Native elements, listeners, values, disabled state and focus are never replaced.
 * See README.md for each source, port and explicitly retained gap.
 */
export function mountBitsControls(root: HTMLElement): () => void {
  const owned = new Map<HTMLElement, NativeBitsControl>();
  let alive = true;
  const enhance = (element: HTMLElement): void => {
    if (owned.has(element) || element.closest("[data-bits-exclude]")) return;
    let control: NativeBitsControl | undefined;
    if (element.matches(segment)) control = attachRubberSegment(element);
    else if (element instanceof HTMLSelectElement && !element.multiple)
      control = attachGlideSelect(element);
    else if (element instanceof HTMLInputElement && element.type === "range")
      control = attachWakeSlider(element);
    else if (element instanceof HTMLProgressElement) control = attachSloshGauge(element);
    else if (element.matches(buttons) && element.closest(segment)) {
      control = skin(element, "rubber-segment-item", "bits-rubber-cell");
    } else if (element.matches('[role="switch"], button[aria-pressed]')) {
      control = skin(element, "squish-switch", "bits-squish-switch");
    } else if (
      element instanceof HTMLInputElement &&
      ["checkbox", "radio"].includes(element.type)
    ) {
      control = skin(
        element,
        element.type === "checkbox" ? "spring-check" : "jelly-radio",
        "bits-spring-check",
      );
    } else if (element.matches(buttons)) {
      // Segment cells and native VitePress switch contents have their own component.
      if (!element.closest(segment) && !element.closest(".VPSwitch"))
        control = skin(element, "star-border", "bits-star-border");
    } else if (element.matches(fields)) {
      control = skin(
        element,
        element instanceof HTMLInputElement && element.type === "number"
          ? "scrub-field"
          : "prompt-bar",
        "bits-prompt-field",
      );
    } else if (element.matches(status)) {
      const update = (): void => {
        const text = element.textContent ?? "";
        const next = /失败|错误|error|failed/i.test(text)
          ? "failed"
          : /销毁|取消|disposed|cancelled/i.test(text)
            ? "cancelled"
            : /通过|完成|ready|running|运行|stopped|暂停|paused/i.test(text)
              ? "done"
              : /正在|准备|加载|检测中|loading|pending/i.test(text)
                ? "running"
                : "pending";
        if (element.dataset.bitsStatus !== next) element.dataset.bitsStatus = next;
      };
      const base = skin(element, "status-mark", "bits-status-mark", update);
      control = {
        update,
        destroy() {
          base.destroy();
          delete element.dataset.bitsStatus;
        },
      };
    } else if (element.matches(navigation))
      control = skin(element, "flowing-menu", "bits-flowing-menu");
    else if (element.matches(panels))
      control = skin(element, "glass-surface", "bits-glass-surface");
    if (element.getAttribute("title")) {
      const base = control;
      const tooltip = attachWarmTooltip(element);
      control = {
        update() {
          base?.update();
          tooltip.update();
        },
        destroy() {
          tooltip.destroy();
          base?.destroy();
        },
      };
    }
    if (control) owned.set(element, control);
  };
  const scan = (node: HTMLElement): void => {
    if (node.matches(candidates)) enhance(node);
    for (const element of node.querySelectorAll<HTMLElement>(candidates)) enhance(element);
  };
  const observer = new MutationObserver((records) => {
    if (!alive) return;
    const update = new Set<HTMLElement>();
    for (const record of records) {
      const target =
        record.target instanceof HTMLElement ? record.target : record.target.parentElement;
      if (target) {
        if (record.type === "attributes") enhance(target);
        const owner = target.closest<HTMLElement>(candidates);
        if (owner && owned.has(owner)) update.add(owner);
      }
      for (const node of record.addedNodes)
        if (node instanceof HTMLElement && root.contains(node)) scan(node);
    }
    for (const element of update) owned.get(element)?.update();
    for (const [element, control] of owned) {
      if (!root.contains(element)) {
        control.destroy();
        owned.delete(element);
      }
    }
  });
  scan(root);
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "aria-pressed",
      "aria-selected",
      "aria-checked",
      "aria-current",
      "open",
      "value",
      "max",
    ],
  });
  const pageHide = (): void => {
    for (const control of owned.values()) control.update();
  };
  window.addEventListener("pageshow", pageHide);
  return () => {
    if (!alive) return;
    alive = false;
    observer.disconnect();
    window.removeEventListener("pageshow", pageHide);
    for (const control of Array.from(owned.values()).reverse()) control.destroy();
    owned.clear();
  };
}
