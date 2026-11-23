import type { NativeBitsControl } from "./native-types.ts";

let sequence = 0;

/** Vue Bits GlideSelect: native-value bridge, floating list, gliding pill and typeahead. */
export function attachGlideSelect(select: HTMLSelectElement): NativeBitsControl {
  const events = new AbortController();
  const { signal } = events;
  const id = `bits-glide-${++sequence}`;
  let menu: HTMLDivElement | undefined;
  let menuEvents: AbortController | undefined;
  let pill: HTMLSpanElement | undefined;
  let active = -1;
  const optionVisibility = new Map<HTMLOptionElement, string | null>();
  let search = "";
  let lastKey = 0;
  const previous = new Map(
    ["aria-expanded", "aria-haspopup", "aria-controls", "aria-activedescendant"].map((name) => [
      name,
      select.getAttribute(name),
    ]),
  );
  select.classList.add("bits-glide-select");
  select.dataset.vueBits = "glide-select";
  select.setAttribute("aria-haspopup", "listbox");
  select.setAttribute("aria-expanded", "false");
  const close = (): void => {
    menuEvents?.abort();
    menuEvents = undefined;
    menu?.remove();
    menu = undefined;
    pill = undefined;
    select.setAttribute("aria-expanded", "false");
    select.removeAttribute("aria-controls");
    select.removeAttribute("aria-activedescendant");
    for (const [option, value] of optionVisibility) {
      if (value === null) option.removeAttribute("aria-hidden");
      else option.setAttribute("aria-hidden", value);
    }
    optionVisibility.clear();
  };
  const highlight = (index: number): void => {
    if (!menu || index < 0 || select.options[index]?.disabled) return;
    active = index;
    const option = menu.querySelector<HTMLElement>(`[data-index="${index}"]`)!;
    select.setAttribute("aria-activedescendant", option.id);
    pill!.style.transform = `translateY(${option.offsetTop}px)`;
    pill!.style.height = `${option.offsetHeight}px`;
    option.scrollIntoView({ block: "nearest" });
  };
  const pick = (index: number): void => {
    if (!select.options[index] || select.options[index]!.disabled || select.disabled) return;
    select.selectedIndex = index;
    close();
    select.focus({ preventScroll: true });
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const open = (): void => {
    if (menu || select.disabled || !Array.from(select.options).some((item) => !item.disabled))
      return;
    menu = document.createElement("div");
    menu.className = "bits-glide-menu";
    menu.id = `${id}-list`;
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", select.getAttribute("aria-label") ?? "选择选项");
    pill = document.createElement("span");
    pill.className = "bits-glide-pill";
    pill.setAttribute("aria-hidden", "true");
    menu.append(pill);
    for (const [index, item] of Array.from(select.options).entries()) {
      optionVisibility.set(item, item.getAttribute("aria-hidden"));
      item.setAttribute("aria-hidden", "true");
      const row = document.createElement("div");
      row.id = `${id}-${index}`;
      row.dataset.index = String(index);
      row.setAttribute("role", "option");
      row.setAttribute("aria-label", item.label);
      row.setAttribute("aria-selected", String(index === select.selectedIndex));
      row.setAttribute("aria-disabled", String(item.disabled));
      row.textContent = item.label;
      menu.append(row);
    }
    (select.closest("dialog[open]") ?? document.body).append(menu);
    menuEvents = new AbortController();
    const menuSignal = menuEvents.signal;
    const rect = select.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 200), innerWidth - 24);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
    menu.style.maxHeight = `${Math.min(320, Math.max(rect.top - 12, innerHeight - rect.bottom - 12))}px`;
    const height = menu.getBoundingClientRect().height;
    menu.style.top = `${rect.bottom + height + 6 <= innerHeight ? rect.bottom + 6 : Math.max(12, rect.top - height - 6)}px`;
    select.setAttribute("aria-controls", menu.id);
    select.setAttribute("aria-expanded", "true");
    highlight(
      select.selectedIndex >= 0 && !select.options[select.selectedIndex]!.disabled
        ? select.selectedIndex
        : Array.from(select.options).findIndex((item) => !item.disabled),
    );
    menu.addEventListener("pointerdown", (event) => event.preventDefault(), { signal: menuSignal });
    menu.addEventListener(
      "pointermove",
      (event) => {
        const target = (event.target as Element).closest<HTMLElement>("[data-index]");
        if (target) highlight(Number(target.dataset.index));
      },
      { signal: menuSignal },
    );
    menu.addEventListener(
      "click",
      (event) => {
        const target = (event.target as Element).closest<HTMLElement>("[data-index]");
        if (target) pick(Number(target.dataset.index));
      },
      { signal: menuSignal },
    );
  };
  select.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || select.disabled) return;
      event.preventDefault();
      select.focus({ preventScroll: true });
      if (menu) close();
      else open();
    },
    { signal },
  );
  select.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" || event.key === "Tab") {
        close();
        return;
      }
      if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        if (!menu) {
          open();
          if (event.key !== "Home" && event.key !== "End") return;
        }
        if (event.key === "Enter" || event.key === " ") {
          pick(active);
          return;
        }
        const direction = event.key === "ArrowUp" || event.key === "End" ? -1 : 1;
        let next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? select.options.length - 1
              : active + direction;
        while (next >= 0 && next < select.options.length && select.options[next]!.disabled)
          next += direction;
        if (next >= 0 && next < select.options.length) highlight(next);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (performance.now() - lastKey > 700) search = "";
        search += event.key.toLocaleLowerCase();
        lastKey = performance.now();
        open();
        const index = Array.from(select.options).findIndex(
          (item) => !item.disabled && item.label.toLocaleLowerCase().startsWith(search),
        );
        if (index >= 0) highlight(index);
      }
    },
    { signal },
  );
  select.addEventListener("change", close, { signal });
  select.addEventListener("blur", close, { signal });
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.target !== select && !menu?.contains(event.target as Node)) close();
    },
    { signal, capture: true },
  );
  window.addEventListener("resize", close, { signal });
  window.addEventListener("pagehide", close, { signal });
  window.addEventListener(
    "scroll",
    (event) => {
      if (menu && !menu.contains(event.target as Node)) close();
    },
    { signal, capture: true },
  );
  return {
    update() {
      if (select.disabled) close();
    },
    destroy() {
      close();
      events.abort();
      select.classList.remove("bits-glide-select");
      delete select.dataset.vueBits;
      for (const [name, value] of previous) {
        if (value === null) select.removeAttribute(name);
        else select.setAttribute(name, value);
      }
    },
  };
}
