import { gsap } from "gsap";
import { finishFiniteMotion } from "../finite-motion.ts";
import type { NativeBitsControl } from "./native-types.ts";

/** Vue Bits WakeSlider's segmented fill and smoothstep wake, with a native range hit target. */
export function attachWakeSlider(input: HTMLInputElement): NativeBitsControl {
  const host = document.createElement("span");
  host.className = "bits-wake-slider";
  host.dataset.vueBits = "wake-slider";
  const bars = document.createElement("span");
  bars.className = "bits-wake-bars";
  bars.setAttribute("aria-hidden", "true");
  const cells = Array.from({ length: 24 }, () => document.createElement("i"));
  bars.append(...cells);
  input.before(host);
  host.append(bars, input);
  const events = new AbortController();
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  let tween: gsap.core.Tween | undefined;
  let cancel: (() => void) | undefined;
  let previous = Number(input.value);
  const stop = (): void => {
    cancel?.();
    cancel = undefined;
    tween?.kill();
    tween = undefined;
    gsap.set(cells, { clearProps: "transform" });
  };
  const update = (): void => {
    const min = Number(input.min || 0),
      max = Number(input.max || 100);
    const progress =
      max > min ? Math.min(1, Math.max(0, (Number(input.value) - min) / (max - min))) : 0;
    for (const [index, cell] of cells.entries()) {
      const on = String(index / (cells.length - 1) <= progress);
      if (cell.dataset.on !== on) cell.dataset.on = on;
    }
    if (host.dataset.value !== input.value) host.dataset.value = input.value;
    const disabled = String(input.disabled);
    if (host.dataset.disabled !== disabled) host.dataset.disabled = disabled;
  };
  const originalValue = Object.getOwnPropertyDescriptor(input, "value");
  const readValue = (): string => Reflect.get(HTMLInputElement.prototype, "value", input) as string;
  if (!originalValue)
    Object.defineProperty(input, "value", {
      configurable: true,
      get: readValue,
      set(value: string) {
        Reflect.set(HTMLInputElement.prototype, "value", value, input);
        update();
      },
    });
  input.addEventListener(
    "input",
    () => {
      update();
      stop();
      const min = Number(input.min || 0),
        max = Number(input.max || 100);
      const progress = max > min ? (Number(input.value) - min) / (max - min) : 0;
      const speed = Math.min(
        1,
        (Math.abs(Number(input.value) - previous) / Math.max(1, max - min)) * 12,
      );
      previous = Number(input.value);
      if (media.matches || !speed) return;
      gsap.set(cells, {
        scaleY: (index: number) => {
          const distance = Math.min(1, Math.abs(index / (cells.length - 1) - progress) * 6);
          const smoothstep = distance * distance * (3 - 2 * distance);
          return 1 + (1 - smoothstep) * speed * 1.6;
        },
      });
      tween = gsap.to(cells, {
        scaleY: 1,
        duration: 0.3,
        ease: "power3.out",
        clearProps: "transform",
      });
      cancel = finishFiniteMotion(tween);
    },
    { signal: events.signal },
  );
  input.addEventListener("change", update, { signal: events.signal });
  media.addEventListener("change", stop, { signal: events.signal });
  update();
  return {
    update,
    destroy() {
      stop();
      events.abort();
      if (!originalValue && Object.getOwnPropertyDescriptor(input, "value")?.get === readValue)
        Reflect.deleteProperty(input, "value");
      host.before(input);
      host.remove();
    },
  };
}
