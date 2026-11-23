import type { NativeBitsControl } from "./native-types.ts";

/** Vue Bits SloshGauge liquid fill in a horizontal, read-only progress presentation. */
export function attachSloshGauge(progress: HTMLProgressElement): NativeBitsControl {
  const host = document.createElement("span");
  host.className = "bits-slosh-gauge";
  host.dataset.vueBits = "slosh-gauge";
  const liquid = document.createElement("span");
  liquid.className = "bits-slosh-liquid";
  liquid.setAttribute("aria-hidden", "true");
  progress.before(host);
  host.append(liquid, progress);
  const update = (): void => {
    const level = Math.min(1, Math.max(0, progress.value / progress.max));
    liquid.style.width = `${level * 100}%`;
    host.dataset.level = String(level);
  };
  update();
  return {
    update,
    destroy() {
      host.before(progress);
      host.remove();
    },
  };
}
