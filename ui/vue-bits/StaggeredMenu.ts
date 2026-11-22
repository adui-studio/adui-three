import { defineComponent, h, onBeforeUnmount, onMounted, ref, useId } from "vue";
import type { PropType } from "vue";
import { gsap } from "gsap";
import { finishFiniteMotion } from "../finite-motion.ts";

export interface MenuLink {
  label: string;
  href: string;
  description?: string;
}

/** Vue Bits StaggeredMenu's layers and rising labels, with native modal focus handling. */
export default defineComponent({
  name: "StaggeredMenu",
  props: {
    label: { type: String, default: "探索导航" },
    items: { type: Array as PropType<readonly MenuLink[]>, required: true },
  },
  setup(props, { slots }) {
    const id = `bits-menu-${useId()}`;
    const dialog = ref<HTMLDialogElement>();
    const toggle = ref<HTMLButtonElement>();
    const open = ref(false);
    let motion: gsap.Context | undefined;
    let events: AbortController | undefined;
    const stop = (): void => {
      motion?.revert();
      motion = undefined;
    };
    const close = (): void => {
      stop();
      dialog.value?.close();
      open.value = false;
      toggle.value?.focus({ preventScroll: true });
    };
    const show = (): void => {
      stop();
      dialog.value!.showModal();
      open.value = true;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      motion = gsap.context(() => {
        const panel = dialog.value!.querySelector(".bits-menu-content")!;
        const timeline = gsap
          .timeline()
          .fromTo(
            dialog.value!.querySelectorAll(".bits-menu-layer"),
            { xPercent: 100 },
            { xPercent: 0, stagger: 0.07, duration: 0.45, ease: "power4.out" },
          )
          .fromTo(
            panel,
            { xPercent: 100 },
            { xPercent: 0, duration: 0.5, ease: "power4.out" },
            0.08,
          )
          .fromTo(
            panel.querySelectorAll(".bits-menu-label"),
            { yPercent: 140, rotate: 10, opacity: 0 },
            {
              yPercent: 0,
              rotate: 0,
              opacity: 1,
              stagger: 0.055,
              duration: 0.6,
              ease: "power4.out",
              clearProps: "transform,opacity",
            },
            0.2,
          );
        return finishFiniteMotion(timeline);
      }, dialog.value);
    };
    onMounted(() => {
      events = new AbortController();
      matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
        "change",
        (event) => {
          if (event.matches) stop();
        },
        { signal: events.signal },
      );
    });
    onBeforeUnmount(() => {
      stop();
      events?.abort();
      dialog.value?.close();
    });
    return () =>
      h("div", { class: "bits-staggered-menu", "data-vue-bits": "staggered-menu" }, [
        h(
          "button",
          {
            ref: toggle,
            type: "button",
            class: "bits-menu-toggle",
            "aria-expanded": String(open.value),
            "aria-controls": id,
            onClick: show,
          },
          [props.label, h("span", { "aria-hidden": "true" }, "＋")],
        ),
        h(
          "dialog",
          {
            ref: dialog,
            id,
            class: "bits-menu-dialog",
            "aria-label": props.label,
            onCancel: (event: Event) => {
              event.preventDefault();
              close();
            },
            onClick: (event: MouseEvent) => {
              if (event.target === dialog.value) close();
            },
          },
          [
            h("div", { class: "bits-menu-layer layer-one", "aria-hidden": "true" }),
            h("div", { class: "bits-menu-layer layer-two", "aria-hidden": "true" }),
            h("div", { class: "bits-menu-content" }, [
              h("div", { class: "bits-menu-top" }, [
                h("span", "ADUI THREE / EXPLORE"),
                h("button", { type: "button", onClick: close, autofocus: true }, "关闭 ×"),
              ]),
              h(
                "nav",
                { "aria-label": props.label },
                props.items.map((item, index) =>
                  h("a", { href: item.href, onClick: close }, [
                    h("span", { class: "bits-menu-number" }, String(index + 1).padStart(2, "0")),
                    h("span", { class: "bits-menu-label" }, [
                      h("strong", item.label),
                      item.description ? h("small", item.description) : null,
                    ]),
                    h("span", { "aria-hidden": "true", class: "bits-menu-arrow" }, "↗"),
                  ]),
                ),
              ),
              h("p", { class: "bits-menu-foot" }, "THREE.JS r187 / ONE SCENE. TWO BACKENDS."),
              slots.default?.(),
            ]),
          ],
        ),
      ]);
  },
});
