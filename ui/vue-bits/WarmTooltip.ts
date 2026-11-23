import type { NativeBitsControl } from "./native-types.ts";

let sequence = 0;
let warmUntil = 0;

/** Vue Bits WarmTooltip's cold delay/warm handoff and bounded floating content. */
export function attachWarmTooltip(trigger: HTMLElement): NativeBitsControl {
  const title = trigger.getAttribute("title");
  const hasInputLabel =
    (trigger instanceof HTMLInputElement || trigger instanceof HTMLTextAreaElement) &&
    !!trigger.labels?.length;
  const ownsName =
    !!title &&
    !trigger.hasAttribute("aria-label") &&
    !trigger.hasAttribute("aria-labelledby") &&
    !trigger.textContent?.trim() &&
    !trigger.querySelector('img[alt]:not([alt=""]), svg title, [aria-label], [aria-labelledby]') &&
    !hasInputLabel;
  if (ownsName) trigger.setAttribute("aria-label", title!);
  const events = new AbortController();
  const { signal } = events;
  let tooltip: HTMLDivElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  trigger.removeAttribute("title");
  trigger.dataset.vueBitsTooltip = "warm-tooltip";
  const close = (): void => {
    clearTimeout(timer);
    if (tooltip) {
      warmUntil = performance.now() + 300;
      const ids = (trigger.getAttribute("aria-describedby") ?? "")
        .split(/\s+/)
        .filter((id) => id && id !== tooltip!.id);
      if (ids.length) trigger.setAttribute("aria-describedby", ids.join(" "));
      else trigger.removeAttribute("aria-describedby");
    }
    tooltip?.remove();
    tooltip = undefined;
  };
  const show = (): void => {
    if (!title || tooltip || !trigger.isConnected) return;
    tooltip = document.createElement("div");
    tooltip.className = "bits-warm-tooltip";
    tooltip.id = `bits-tooltip-${++sequence}`;
    tooltip.dataset.vueBits = "warm-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = title;
    (trigger.closest("dialog[open]") ?? document.body).append(tooltip);
    const box = trigger.getBoundingClientRect(),
      size = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(innerWidth - size.width - 8, box.left + (box.width - size.width) / 2))}px`;
    tooltip.style.top = `${box.top > size.height + 12 ? box.top - size.height - 8 : box.bottom + 8}px`;
    trigger.setAttribute(
      "aria-describedby",
      [trigger.getAttribute("aria-describedby"), tooltip.id].filter(Boolean).join(" "),
    );
  };
  trigger.addEventListener(
    "pointerenter",
    (event) => {
      if (event.pointerType === "touch") return;
      clearTimeout(timer);
      timer = setTimeout(show, performance.now() < warmUntil ? 0 : 400);
    },
    { signal },
  );
  trigger.addEventListener("pointerleave", close, { signal });
  trigger.addEventListener("focus", show, { signal });
  trigger.addEventListener("blur", close, { signal });
  trigger.addEventListener("pointerdown", close, { signal });
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") close();
    },
    { signal },
  );
  window.addEventListener("scroll", close, { signal, capture: true });
  window.addEventListener("pagehide", close, { signal });
  return {
    update() {},
    destroy() {
      close();
      events.abort();
      if (title !== null && !trigger.hasAttribute("title")) trigger.setAttribute("title", title);
      if (ownsName && trigger.getAttribute("aria-label") === title)
        trigger.removeAttribute("aria-label");
      delete trigger.dataset.vueBitsTooltip;
    },
  };
}
