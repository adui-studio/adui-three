import { defineComponent, h } from "vue";

/** Vue Bits SplitText rise/stagger, adapted for deterministic SSR markup. */
export default defineComponent({
  name: "SplitText",
  props: { text: { type: String, required: true } },
  setup(props) {
    return () =>
      h(
        "span",
        {
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
                {
                  class: "bits-split-letter",
                  key: index,
                  style: { "--bits-letter-delay": `${index * 25}ms` },
                },
                letter === " " ? "\u00a0" : letter,
              ),
            ),
          ),
        ],
      );
  },
});
