import DefaultTheme from "vitepress/theme-without-fonts";
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, watch } from "vue";
import { useRoute, withBase } from "vitepress";
import HomePage from "./HomePage.ts";

export default defineComponent({
  name: "MotionLayout",
  setup() {
    const route = useRoute();
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
    watch(() => route.path, resume, { flush: "post" });
    onMounted(() => {
      mounted = true;
      resume();
      window.addEventListener("pagehide", stop);
      window.addEventListener("pageshow", resume);
    });
    onBeforeUnmount(() => {
      mounted = false;
      stop();
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("pageshow", resume);
    });
    return () =>
      h(DefaultTheme.Layout, null, {
        "home-hero-before": () => h(HomePage),
        "doc-before": () =>
          h("div", { class: "doc-masthead" }, [
            h("a", { href: withBase("/guide/getting-started.html") }, "ADUI THREE / DOCS"),
            h("span", "v0.0.0 · r187"),
          ]),
      });
  },
});
