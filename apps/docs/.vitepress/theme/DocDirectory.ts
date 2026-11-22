import { computed, defineComponent, h, ref } from "vue";
import { useData, useRoute, withBase } from "vitepress";
import type { DefaultTheme } from "vitepress";

const normalize = (path: string): string =>
  path
    .split(/[?#]/)[0]!
    .replace(/\.html$/, "")
    .replace(/\/$/, "")
    .replace(/\/index$/, "");
const href = (path: string): string =>
  withBase(
    path.startsWith("/") && !path.endsWith("/") && !/\.[a-z]+(?:#|$)/i.test(path)
      ? path.replace(/(#|$)/, ".html$1")
      : path,
  );

export default defineComponent({
  name: "DocDirectory",
  setup() {
    const { theme } = useData();
    const route = useRoute();
    const query = ref("");
    const groups = computed(() =>
      Array.isArray(theme.value.sidebar) ? (theme.value.sidebar as DefaultTheme.SidebarItem[]) : [],
    );
    const selected = (item: DefaultTheme.SidebarItem): boolean =>
      !!item.link && normalize(route.path) === normalize(withBase(item.link));
    const active = (item: DefaultTheme.SidebarItem): boolean =>
      selected(item) || !!item.items?.some(active);
    const visible = computed(() =>
      groups.value
        .map((group) => ({
          ...group,
          items: group.items?.filter((item) =>
            `${item.text} ${item.link}`
              .toLocaleLowerCase()
              .includes(query.value.trim().toLocaleLowerCase()),
          ),
        }))
        .filter((group) => group.items?.length),
    );
    const link = (item: DefaultTheme.SidebarItem) =>
      h(
        "a",
        {
          href: href(item.link ?? "/"),
          "aria-current": selected(item) ? "page" : undefined,
          class: "doc-directory-link",
        },
        [h("span", item.text), h("span", { "aria-hidden": "true" }, selected(item) ? "↳" : "↗")],
      );
    return () =>
      h("div", { class: "doc-directory" }, [
        h("div", { class: "directory-identity" }, [h("span", "DOCUMENTATION"), h("span", "r187")]),
        h("label", { class: "directory-search" }, [
          h("span", { "aria-hidden": "true" }, "⌕"),
          h("input", {
            type: "search",
            "aria-label": "筛选文档目录",
            name: "doc-directory",
            autocomplete: "off",
            placeholder: "查找模块…",
            value: query.value,
            onInput: (event: Event) => {
              query.value = (event.target as HTMLInputElement).value;
            },
          }),
        ]),
        h(
          "nav",
          { "aria-label": "文档目录" },
          visible.value.map((group, index) =>
            h(
              "details",
              {
                key: group.text,
                open: !!query.value || !group.collapsed || active(group),
              },
              [
                h("summary", [
                  h("span", { class: "directory-index" }, String(index + 1).padStart(2, "0")),
                  group.text,
                  h("span", { class: "directory-chevron", "aria-hidden": "true" }, "+"),
                ]),
                h("div", { class: "directory-items" }, group.items!.map(link)),
              ],
            ),
          ),
        ),
        !visible.value.length
          ? h("p", { class: "directory-empty", role: "status" }, "没有匹配的文档，试试模块名称。")
          : null,
        h("div", { class: "directory-foot" }, [
          h("span", "@adui/three"),
          h("small", "REFERENCE / DEVELOPMENT BUILD"),
        ]),
      ]);
  },
});
