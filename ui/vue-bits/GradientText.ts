import { defineComponent, h } from "vue";

/** Vue Bits GradientText's repeated palette; a finite CSS sweep replaces its idle RAF. */
export default defineComponent({
  name: "GradientText",
  props: { text: { type: String, required: true } },
  setup(props) {
    const palette = ["#e3d3ff", "#9faeff", "#bda0f1", "#e3d3ff"];
    return () =>
      h(
        "span",
        {
          class: "bits-gradient-text",
          "data-vue-bits": "gradient-text",
          style: { "--gt-gradient": `linear-gradient(110deg, ${palette.join(", ")})` },
        },
        props.text,
      );
  },
});
