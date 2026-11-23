import { defineComponent, h } from "vue";
import type { PropType } from "vue";

export interface BitsBranchItem {
  text: string;
  href: string;
  selected: boolean;
}
export interface BitsBranchGroup {
  text: string;
  open: boolean;
  items: readonly BitsBranchItem[];
}

/** Vue Bits BranchedMenu's trunk/reach geometry, with SSR-native links and disclosure. */
export default defineComponent({
  name: "BranchedMenu",
  props: {
    groups: { type: Array as PropType<readonly BitsBranchGroup[]>, required: true },
  },
  setup(props) {
    const rowHeight = 44,
      pad = 6,
      trunk = 12,
      radius = 8,
      endX = 30;
    const rowY = (index: number): number => pad + index * rowHeight + rowHeight / 2;
    const branch = (index: number): string =>
      `M ${trunk} ${rowY(index) - radius} A ${radius} ${radius} 0 0 0 ${trunk + radius} ${rowY(index)} H ${endX}`;
    const reach = (index: number): string =>
      `M ${trunk} 0 V ${rowY(index) - radius} A ${radius} ${radius} 0 0 0 ${trunk + radius} ${rowY(index)} H ${endX}`;
    return () =>
      h(
        "nav",
        { class: "bits-branched-menu", "data-vue-bits": "branched-menu" },
        props.groups.map((group, index) =>
          h("details", { key: group.text, open: group.open }, [
            h("summary", [
              h("span", { class: "directory-index" }, String(index + 1).padStart(2, "0")),
              group.text,
              h("span", { class: "directory-chevron", "aria-hidden": "true" }, "+"),
            ]),
            h("div", { class: "directory-items bits-branch-items" }, [
              h(
                "svg",
                {
                  width: 34,
                  height: pad * 2 + group.items.length * rowHeight,
                  "aria-hidden": "true",
                },
                [
                  h("path", { d: `M ${trunk} 0 V ${rowY(group.items.length - 1) - radius}` }),
                  ...group.items.map((item, row) =>
                    h("path", { d: branch(row), class: item.selected ? "selected" : undefined }),
                  ),
                  ...group.items.flatMap((item, row) =>
                    item.selected ? [h("path", { d: reach(row), class: "bits-branch-reach" })] : [],
                  ),
                ],
              ),
              ...group.items.map((item) =>
                h(
                  "a",
                  {
                    href: item.href,
                    "aria-current": item.selected ? "page" : undefined,
                    class: "doc-directory-link",
                  },
                  [
                    h("span", item.text),
                    h("span", { "aria-hidden": "true" }, item.selected ? "↳" : "↗"),
                  ],
                ),
              ),
            ]),
          ]),
        ),
      );
  },
});
