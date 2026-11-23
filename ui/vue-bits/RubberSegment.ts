import { gsap } from "gsap";
import { finishFiniteMotion } from "../finite-motion.ts";
import type { NativeBitsControl } from "./native-types.ts";

/** Vue Bits RubberSegment's independently moving leading/trailing edges. */
export function attachRubberSegment(root: HTMLElement): NativeBitsControl {
  root.classList.add("bits-rubber-segment");
  root.dataset.vueBits = "rubber-segment";
  const thumb = document.createElement("span");
  thumb.className = "bits-rubber-thumb";
  thumb.setAttribute("aria-hidden", "true");
  root.prepend(thumb);
  let first = true;
  let tween: gsap.core.Timeline | undefined;
  let cancel: (() => void) | undefined;
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const events = new AbortController();
  const stop = (): void => {
    cancel?.();
    cancel = undefined;
    tween?.kill();
    tween = undefined;
  };
  const update = (): void => {
    if (!root.contains(thumb)) root.prepend(thumb);
    const item = root.querySelector<HTMLElement>(
      '[aria-pressed="true"], [aria-selected="true"], [aria-current="page"]',
    );
    if (!item || !root.getClientRects().length) {
      thumb.hidden = true;
      return;
    }
    thumb.hidden = false;
    const box = root.getBoundingClientRect(),
      selected = item.getBoundingClientRect();
    const x = selected.left - box.left + root.scrollLeft;
    const right = box.width + root.scrollLeft - (x + selected.width);
    stop();
    thumb.style.top = `${selected.top - box.top + root.scrollTop}px`;
    thumb.style.height = `${selected.height}px`;
    if (first || media.matches) {
      gsap.set(thumb, { left: x, right });
      first = false;
    } else {
      tween = gsap
        .timeline()
        .to(thumb, { left: x, duration: 0.3, ease: "power3.out" }, 0)
        .to(thumb, { right, duration: 0.3, ease: "power3.out" }, 0.055);
      cancel = finishFiniteMotion(tween);
    }
  };
  const observer = new ResizeObserver(update);
  observer.observe(root);
  root.addEventListener("click", () => queueMicrotask(update), { signal: events.signal });
  media.addEventListener("change", update, { signal: events.signal });
  update();
  return {
    update,
    destroy() {
      stop();
      observer.disconnect();
      events.abort();
      thumb.remove();
      root.classList.remove("bits-rubber-segment");
      delete root.dataset.vueBits;
    },
  };
}
