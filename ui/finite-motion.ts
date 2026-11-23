interface FiniteAnimation {
  totalDuration(): number;
  totalProgress(progress: number): unknown;
  pause(): unknown;
  kill(): unknown;
}

/** UI entrances must settle even if the renderer delays RAF or GSAP smooths a long frame. */
export function finishFiniteMotion(animation: FiniteAnimation): () => void {
  const duration = animation.totalDuration();
  if (!Number.isFinite(duration)) throw new Error("Expected a finite interface animation");
  const events = new AbortController();
  let timer: number | undefined;
  let settled = false;
  const cleanup = (): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    events.abort();
  };
  const settle = (): void => {
    if (settled) return;
    settled = true;
    cleanup();
    animation.pause();
    animation.totalProgress(1);
    animation.kill();
  };
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) settle();
    },
    { signal: events.signal },
  );
  window.addEventListener("pagehide", settle, { signal: events.signal });
  if (document.hidden) settle();
  else timer = window.setTimeout(settle, Math.ceil((duration + 0.15) * 1000));
  return cleanup;
}
