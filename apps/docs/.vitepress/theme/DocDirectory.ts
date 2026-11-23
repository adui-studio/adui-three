import { computed, defineComponent, h, ref } from "vue";
import { useData, useRoute, withBase } from "vitepress";
import type { DefaultTheme } from "vitepress";
import BranchedMenu from "../../../../ui/vue-bits/BranchedMenu.ts";

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
        h(BranchedMenu, {
          "aria-label": "文档目录",
          groups: visible.value.map((group) => ({
            text: group.text ?? "文档",
            open: !!query.value || !group.collapsed || active(group),
            items: group.items!.map((item) => ({
              text: item.text ?? "文档",
              href: href(item.link ?? "/"),
              selected: selected(item),
            })),
          })),
        }),
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
