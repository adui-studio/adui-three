import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref } from "vue";
import SpotlightCard from "../../ui/vue-bits/SpotlightCard.ts";
import { sceneDiagram } from "../../ui/scene-diagram.ts";
import { spatialGraphic } from "../../ui/graphics.ts";
import { examples } from "./catalog.ts";

const categories = [
  { id: "all", label: "全部示例" },
  { id: "core", label: "基础与资产" },
  { id: "interaction", label: "交互与导航" },
  { id: "visual", label: "视觉与渲染" },
] as const;
const group: Readonly<Record<string, string>> = {
  basic: "core",
  model: "core",
  camera: "interaction",
  labels: "interaction",
  navigation: "interaction",
  effects: "visual",
  shadows: "visual",
  instances: "visual",
  webgpu: "visual",
};

export default defineComponent({
  name: "ExampleGallery",
  setup() {
    const query = ref("");
    const category = ref("all");
    const read = (): void => {
      const params = new URLSearchParams(location.search);
      query.value = params.get("q") ?? "";
      const requested = params.get("category");
      category.value = categories.some((item) => item.id === requested) ? requested! : "all";
    };
    read();
    const update = (): void => {
      const url = new URL(location.href);
      if (query.value) url.searchParams.set("q", query.value);
      else url.searchParams.delete("q");
      if (category.value !== "all") url.searchParams.set("category", category.value);
      else url.searchParams.delete("category");
      history.replaceState(null, "", url);
    };
    onMounted(() => window.addEventListener("popstate", read));
    onBeforeUnmount(() => window.removeEventListener("popstate", read));
    const filtered = computed(() => {
      const text = query.value.trim().toLocaleLowerCase();
      return examples.filter(
        (item) =>
          (category.value === "all" || group[item.id] === category.value) &&
          `${item.title} ${item.description} ${item.tag} ${item.id}`
            .toLocaleLowerCase()
            .includes(text),
      );
    });
    return () => [
      h("div", { class: "gallery-intro" }, [
        h("div", { class: "gallery-hero-copy" }, [
          h("div", { class: "eyebrow hero-badge" }, [
            h("i", { "aria-hidden": "true" }),
            "ADUI THREE / EXAMPLES",
          ]),
          h("h1", ["从灵感，", h("br"), "到", h("span", "真实场景。")]),
          h(
            "p",
            { class: "lead" },
            "探索三维交互的更多可能。9 个实时示例、两种渲染后端，以及可以带走的完整代码。",
          ),
          h("div", { class: "gallery-hero-actions" }, [
            h("a", { class: "intro-cta", href: "?example=basic", "data-example": "basic" }, [
              "开始探索",
              h("span", { "aria-hidden": "true" }, "↗"),
            ]),
            h("a", { class: "intro-secondary", href: "#example-collection" }, "浏览全部示例 ↓"),
          ]),
          h("div", { class: "hero-capabilities", "aria-label": "示例支持" }, [
            h("span", "WebGL 2 / WebGPU"),
            h("span", "TypeScript + JavaScript"),
          ]),
        ]),
        h("div", { class: "intro-graphic" }, [
          h("div", { class: "diagram-grid", innerHTML: sceneDiagram("gallery-orbit") }),
          h("span", { class: "diagram-label diagram-label-top", "aria-hidden": "true" }, [
            h("i"),
            "scene.add(ideas)",
          ]),
          h("span", { class: "diagram-label diagram-label-bottom", "aria-hidden": "true" }, [
            h("i"),
            "无限可能 / 原生对象",
          ]),
          h("span", { class: "graphic-caption" }, "GEOMETRY STUDY / 001"),
          h("span", { class: "graphic-corner" }, "r187"),
        ]),
      ]),
      h("div", { class: "collection-heading", id: "example-collection" }, [
        h("div", [
          h("span", { class: "eyebrow" }, "THE COLLECTION"),
          h("h2", "每个起点，都有可能。"),
        ]),
        h("span", { class: "collection-count" }, "实时预览 · 独立源码 · 完整工程"),
      ]),
      h("div", { class: "collection-tools" }, [
        h(
          "div",
          { class: "collection-filters", role: "group", "aria-label": "示例分类" },
          categories.map((item) =>
            h(
              "button",
              {
                type: "button",
                "aria-pressed": String(category.value === item.id),
                onClick: () => {
                  category.value = item.id;
                  update();
                },
              },
              item.label,
            ),
          ),
        ),
        h("label", { class: "collection-search" }, [
          h(
            "svg",
            {
              width: 18,
              height: 18,
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              "stroke-width": 1.6,
              "aria-hidden": "true",
            },
            [h("circle", { cx: 10.5, cy: 10.5, r: 6.5 }), h("path", { d: "m16 16 5 5" })],
          ),
          h("input", {
            type: "search",
            name: "example-search",
            "aria-label": "搜索示例",
            placeholder: "搜索示例…",
            value: query.value,
            autocomplete: "off",
            spellcheck: false,
            onInput: (event: Event) => {
              query.value = (event.target as HTMLInputElement).value;
              update();
            },
          }),
        ]),
      ]),
      h("p", { class: "collection-result", role: "status" }, `${filtered.value.length} 个示例`),
      h(
        "div",
        { class: "catalog" },
        filtered.value.map((item) => {
          const i = examples.indexOf(item);
          return h(
            SpotlightCard,
            { key: item.id, class: `gallery-card gallery-card-${item.id}` },
            {
              default: () =>
                h(
                  "a",
                  { class: "example-card", href: `?example=${item.id}`, "data-example": item.id },
                  [
                    h("div", { class: "card-art" }, [
                      h("div", {
                        class: "card-illustration",
                        innerHTML: spatialGraphic(item.id, `tile-${item.id}`),
                      }),
                      h("span", { class: "art-number" }, `0${i + 1}`),
                      h("span", { class: "card-category" }, item.tag),
                      h("span", { class: "art-open", "aria-hidden": "true" }, "↗"),
                    ]),
                    h("div", { class: "card-copy" }, [
                      h("h2", item.title),
                      h("p", item.description),
                      h("div", { class: "card-bottom" }, [
                        h("span", "TS / JS"),
                        h("span", { class: "card-action" }, [
                          "运行示例",
                          h("span", { "aria-hidden": "true" }, "↗"),
                        ]),
                      ]),
                    ]),
                  ],
                ),
            },
          );
        }),
      ),
      !filtered.value.length
        ? h("div", { class: "collection-empty" }, [
            h("h3", "没有找到匹配的示例"),
            h("p", "试试“模型”“相机”或 WebGPU。"),
            h(
              "button",
              {
                type: "button",
                onClick: () => {
                  query.value = "";
                  category.value = "all";
                  update();
                },
              },
              "清除筛选",
            ),
          ])
        : null,
      h("div", { class: "gallery-endnote" }, [
        h("span", "从一个场景开始，把它变成你的。"),
        h("a", { href: "?example=basic", "data-example": "basic" }, "创建第一个场景 ↗"),
      ]),
    ];
  },
});
