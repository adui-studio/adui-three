import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref } from "vue";

/** Adapted from Vue Bits SpotlightCard. See ./README.md and ./LICENSE.md. */
export default defineComponent({
  name: "SpotlightCard",
  props: {
    spotlightColor: { type: String, default: "#ab83df" },
    spotlightSize: { type: Number, default: 320 },
    intensity: { type: Number, default: 0.14 },
    softness: { type: Number, default: 0.7 },
  },
  setup(props, { slots }) {
    const root = ref<HTMLDivElement>();
    const light = ref<HTMLSpanElement>();
    const edge = ref<HTMLSpanElement>();
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    // Vue Bits' soft falloff keeps the highlight smooth at the edge of the card.
    const stops = computed(() => {
      const core = (1 - clamp(props.softness)) ** 1.5 * 0.85;
      const stop = (alpha: number, at: number) =>
        `color-mix(in srgb, ${props.spotlightColor} ${(alpha * 100).toFixed(2)}%, transparent) ${(at * 100).toFixed(2)}%`;
      const list = [stop(1, 0)];
      for (let i = 0; i <= 14; i++) {
        const t = core + ((1 - core) * i) / 14;
        const g = (t - core) / (1 - core);
        const smooth = 1 - g * g * (3 - 2 * g);
        const glow = Math.exp(-4.6 * g * g) * (1 - g ** 6);
        list.push(stop(smooth + (glow - smooth) * clamp(props.softness), t));
      }
      return list.join(", ");
    });
    let cleanup: (() => void) | undefined;
    onMounted(() => {
      const element = root.value!;
      const media = matchMedia("(prefers-reduced-motion: reduce)");
      const events = new AbortController();
      let frame = 0;
      let alive = true;
      let visible = false;
      let pointer: { x: number; y: number } | undefined;
      let focused = false;
      const reset = (): void => {
        cancelAnimationFrame(frame);
        frame = 0;
        element.dataset.spotlight = "idle";
        light.value!.style.opacity = "0";
        edge.value!.style.opacity = "0";
      };
      const paint = (): void => {
        frame = 0;
        if (!alive) return;
        if (!visible || document.hidden || (!pointer && !focused)) {
          reset();
          return;
        }
        const rect = element.getBoundingClientRect();
        const stationary = media.matches || focused || !pointer;
        const x = stationary ? rect.width / 2 : pointer!.x - rect.left;
        const y = stationary ? rect.height / 2 : pointer!.y - rect.top;
        const gradient = `radial-gradient(circle ${Math.max(20, props.spotlightSize)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px, ${stops.value})`;
        light.value!.style.background = gradient;
        edge.value!.style.background = gradient;
        light.value!.style.opacity = String(clamp(props.intensity));
        edge.value!.style.opacity = "0.6";
        element.dataset.spotlight = stationary ? "stationary" : "pointer";
      };
      const wake = (): void => {
        if (alive && !frame) frame = requestAnimationFrame(paint);
      };
      const observer = new IntersectionObserver((entries) => {
        if (!alive) return;
        visible = entries.some((entry) => entry.isIntersecting);
        if (visible) wake();
        else reset();
      });
      observer.observe(element);
      element.addEventListener(
        "pointermove",
        (event) => {
          if (event.pointerType === "touch") return;
          pointer = { x: event.clientX, y: event.clientY };
          wake();
        },
        { signal: events.signal, passive: true },
      );
      element.addEventListener(
        "pointerleave",
        () => {
          pointer = undefined;
          wake();
        },
        { signal: events.signal },
      );
      element.addEventListener(
        "focusin",
        () => {
          focused = true;
          wake();
        },
        { signal: events.signal },
      );
      element.addEventListener(
        "focusout",
        (event) => {
          focused = event.relatedTarget instanceof Node && element.contains(event.relatedTarget);
          wake();
        },
        { signal: events.signal },
      );
      media.addEventListener("change", wake, { signal: events.signal });
      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.hidden) reset();
          else wake();
        },
        { signal: events.signal },
      );
      cleanup = () => {
        alive = false;
        reset();
        events.abort();
        observer.disconnect();
      };
    });
    onBeforeUnmount(() => cleanup?.());
    return () =>
      h(
        "div",
        {
          ref: root,
          class: "spotlight-card",
          "data-vue-bits": "spotlight-card",
          "data-spotlight": "idle",
        },
        [
          h("span", { ref: light, class: "spotlight-card__light", "aria-hidden": "true" }),
          slots.default?.(),
          h("span", { ref: edge, class: "spotlight-card__edge", "aria-hidden": "true" }),
        ],
      );
  },
});
