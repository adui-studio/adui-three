interface FiniteAnimation {
  totalDuration(): number;
  totalProgress(progress: number): unknown;
}

/** UI entrances must settle even if the renderer delays RAF or GSAP smooths a long frame. */
export function finishFiniteMotion(animation: FiniteAnimation): () => void {
  const duration = animation.totalDuration();
  if (!Number.isFinite(duration)) throw new Error("Expected a finite interface animation");
  const timer = window.setTimeout(
    () => {
      animation.totalProgress(1);
    },
    Math.ceil((duration + 0.15) * 1000),
  );
  return () => window.clearTimeout(timer);
}
