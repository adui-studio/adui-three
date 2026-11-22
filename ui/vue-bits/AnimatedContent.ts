import { defineComponent, h, onBeforeUnmount, onMounted, ref } from "vue";
import { gsap } from "gsap";
import { finishFiniteMotion } from "../finite-motion.ts";

/** Vue Bits AnimatedContent's one-shot transform/opacity reveal. */
export default defineComponent({
  name: "AnimatedContent",
  setup(_, { slots }) {
    const root = ref<HTMLElement>();
    let cleanup: (() => void) | undefined;
    onMounted(() => {
      let alive = true;
      const media = gsap.matchMedia();
      const observer = new IntersectionObserver(
        (entries) => {
          if (!alive) return;
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          media.add(
            "(prefers-reduced-motion: no-preference)",
            () => {
              const tween = gsap.fromTo(
                root.value!,
                { y: 18, opacity: 0.4 },
                {
                  y: 0,
                  opacity: 1,
                  duration: 0.65,
                  ease: "power3.out",
                  clearProps: "transform,opacity",
                },
              );
              return finishFiniteMotion(tween);
            },
            root.value,
          );
        },
        { threshold: 0.1 },
      );
      observer.observe(root.value!);
      cleanup = () => {
        alive = false;
        observer.disconnect();
        media.revert();
      };
    });
    onBeforeUnmount(() => cleanup?.());
    return () =>
      h(
        "div",
        { ref: root, class: "bits-animated-content", "data-vue-bits": "animated-content" },
        slots.default?.(),
      );
  },
});
