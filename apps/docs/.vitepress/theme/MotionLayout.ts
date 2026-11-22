import DefaultTheme from "vitepress/theme-without-fonts";
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, watch } from "vue";
import { useData, useRoute, withBase } from "vitepress";
import HomePage from "./HomePage.ts";
import DocDirectory from "./DocDirectory.ts";
import StaggeredMenu from "../../../../ui/vue-bits/StaggeredMenu.ts";

export default defineComponent({
  name: "MotionLayout",
  setup() {
    const route = useRoute();
    const { isDark } = useData();
    let mounted = false;
    let version = 0;
    let dispose: (() => void) | undefined;
    const stop = (): void => {
      version++;
      dispose?.();
      dispose = undefined;
    };
    const enter = async (): Promise<void> => {
      stop();
      if (!mounted) return;
      const request = version;
      await nextTick();
      const motion = await import("../../../../ui/motion.ts").catch(() => undefined);
      if (!motion || !mounted || request !== version) return;
      const root = document.querySelector<HTMLElement>(".VPContent");
      if (root) dispose = motion.mountPageMotion(root, "docs");
    };
    const resume = (): void => {
      void enter();
    };
    const pageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) resume();
    };
    watch(() => route.path, resume, { flush: "post" });
    onMounted(() => {
      mounted = true;
      resume();
      window.addEventListener("pagehide", stop);
      window.addEventListener("pageshow", pageShow);
    });
    onBeforeUnmount(() => {
      mounted = false;
      stop();
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("pageshow", pageShow);
    });
    return () =>
      h(DefaultTheme.Layout, null, {
        "sidebar-nav-before": () => h(DocDirectory),
        "nav-bar-content-after": () =>
          h(
            StaggeredMenu,
            {
              label: "探索",
              items: [
                {
                  label: "开始使用",
                  href: withBase("/guide/getting-started.html"),
                  description: "从第一个场景开始",
                },
                {
                  label: "API 参考",
                  href: withBase("/api/"),
                  description: "场景、资产、渲染与交互",
                },
                {
                  label: "实时示例",
                  href: withBase("/play/"),
                  description: "运行体验与 TS / JS 完整源码",
                },
                {
                  label: "开发与验收",
                  href: withBase("/development/"),
                  description: "架构、决策与回归边界",
                },
              ],
            },
            {
              default: () =>
                h(
                  "button",
                  {
                    type: "button",
                    class: "menu-theme-toggle",
                    onClick: () => {
                      isDark.value = !isDark.value;
                    },
                  },
                  isDark.value ? "切换为浅色外观" : "切换为深色外观",
                ),
            },
          ),
        "home-hero-before": () => h(HomePage),
        "doc-before": () =>
          h("div", { class: "doc-masthead" }, [
            h("a", { href: withBase("/guide/getting-started.html") }, "ADUI THREE / DOCS"),
            h("span", "v0.0.0 · r187"),
          ]),
      });
  },
});
