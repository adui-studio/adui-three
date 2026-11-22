import { defineComponent, h, onBeforeUnmount, onMounted, ref } from "vue";
import { gsap } from "gsap";
import { finishFiniteMotion } from "../finite-motion.ts";

/** Vue Bits SplitText rise/stagger, adapted for deterministic SSR markup. */
export default defineComponent({
  name: "SplitText",
  props: { text: { type: String, required: true } },
  setup(props) {
    const root = ref<HTMLElement>();
    let cleanup: (() => void) | undefined;
    onMounted(() => {
      const media = gsap.matchMedia();
      media.add(
        "(prefers-reduced-motion: no-preference)",
        () => {
          const letters = root.value!.querySelectorAll(".bits-split-letter");
          const tween = gsap.fromTo(
            letters,
            { yPercent: 65, opacity: 0.25 },
            {
              yPercent: 0,
              opacity: 1,
              duration: 0.65,
              stagger: 0.025,
              ease: "power3.out",
              clearProps: "transform,opacity",
            },
          );
          return finishFiniteMotion(tween);
        },
        root.value,
      );
      cleanup = () => media.revert();
    });
    onBeforeUnmount(() => cleanup?.());
    return () =>
      h(
        "span",
        {
          ref: root,
          class: "bits-split-text",
          "data-vue-bits": "split-text",
          "aria-label": props.text,
        },
        [
          h(
            "span",
            { "aria-hidden": "true" },
            Array.from(props.text).map((letter, index) =>
              h(
                "span",
                { class: "bits-split-letter", key: index },
                letter === " " ? "\u00a0" : letter,
              ),
            ),
          ),
        ],
      );
  },
});
