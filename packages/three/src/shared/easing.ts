/** Presets evaluated from elapsed progress in [0,1]. */
export type TransitionEasing = "linear" | "smoothstep";

const linear = (progress: number): number => progress;
const smoothstep = (progress: number): number => progress * progress * (3 - 2 * progress);

/** Internal immutable preset resolution. No consumer callbacks run during sampling. */
export function resolveTransitionEasing(
  value: TransitionEasing | undefined,
  fallback: TransitionEasing,
): (progress: number) => number {
  const name = value === undefined ? fallback : value;
  if (name === "linear") return linear;
  if (name === "smoothstep") return smoothstep;
  throw new RangeError("Easing must be linear or smoothstep");
}
