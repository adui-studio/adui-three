import { defineComponent, h, onBeforeUnmount, onMounted, ref } from "vue";

/** Vue Bits AnimatedContent's one-shot transform/opacity reveal. */
export default defineComponent({
  name: "AnimatedContent",
  setup(_, { slots }) {
    const root = ref<HTMLElement>();
    const entered = ref(false);
    let cleanup: (() => void) | undefined;
    onMounted(() => {
      let alive = true;
      const observer = new IntersectionObserver(
        (entries) => {
          if (!alive) return;
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          entered.value = true;
        },
        { threshold: 0.1 },
      );
      observer.observe(root.value!);
      cleanup = () => {
        alive = false;
        observer.disconnect();
      };
    });
    onBeforeUnmount(() => cleanup?.());
    return () =>
      h(
        "div",
        {
          ref: root,
          class: ["bits-animated-content", { "bits-content-entered": entered.value }],
          "data-vue-bits": "animated-content",
        },
        slots.default?.(),
      );
  },
});
