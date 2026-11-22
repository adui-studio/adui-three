import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export type PageMotion = "docs" | "gallery" | "detail" | "studio";

/** Application chrome only. Never animate a live canvas or its layout ancestors. */
export function mountPageMotion(root: HTMLElement, page: PageMotion): () => void {
  const previous = root.getAttribute("data-motion");
  const media = gsap.matchMedia();
  let disposed = false;
  media.add(
    {
      reduced: "(prefers-reduced-motion: reduce)",
      normal: "(prefers-reduced-motion: no-preference)",
    },
    (context) => {
      if (context.conditions?.reduced) {
        root.dataset.motion = "reduced";
        return;
      }
      root.dataset.motion = "active";
      const select = (selector: string): HTMLElement[] =>
        Array.from(root.querySelectorAll<HTMLElement>(selector));
      const entry = {
        // Home entry belongs to the Vue Bits components; this scope owns document headings.
        docs: ".vp-doc h1",
        gallery: ".gallery-intro > div:not([data-vue-bits]), .collection-heading",
        detail: ".detail-heading > div, .live-state, .scene-inspector",
        studio:
          ".workbench-identity, .workbench-settings, .intro > *, .card-heading, .metrics, .capabilities > h1, #app > main > h1",
      }[page];
      const entries = select(entry);
      if (entries.length)
        gsap
          .timeline({
            onComplete: () => {
              if (!disposed) root.dataset.motion = "ready";
            },
          })
          .from(entries, {
            opacity: 0.45,
            y: page === "studio" ? 6 : 12,
            duration: 0.45,
            stagger: 0.045,
            ease: "power2.out",
            clearProps: "opacity,transform",
          });
      else root.dataset.motion = "ready";
      const scrolling = {
        docs: ".principle-grid article, .home-code > div, .home-explore",
        gallery: ".example-card",
        detail: ".source",
        studio: ".notes > div",
      }[page];
      for (const [index, element] of select(scrolling).entries()) {
        gsap.from(element, {
          opacity: 0.65,
          y: 10,
          duration: 0.36,
          delay: page === "gallery" ? (index % 3) * 0.045 : 0,
          ease: "power1.out",
          clearProps: "opacity,transform",
          scrollTrigger: { trigger: element, start: "top 94%", once: true },
        });
      }
    },
    root,
  );
  return () => {
    if (disposed) return;
    disposed = true;
    media.revert();
    if (previous === null) root.removeAttribute("data-motion");
    else root.setAttribute("data-motion", previous);
  };
}
