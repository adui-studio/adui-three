/** Private per-renderer retirement boundary, shared by all optional entries. */
const frames = new WeakMap<object, Array<() => void>>();
export function retireAfterRender(renderer: object, cleanup: () => void): void {
  const pending = frames.get(renderer);
  if (pending) pending.push(cleanup);
  else cleanup();
}
export function renderWithRetirement<T>(renderer: object, draw: () => T): T {
  if (frames.has(renderer)) return draw();
  const pending: Array<() => void> = [];
  frames.set(renderer, pending);
  const errors: unknown[] = [];
  let value!: T;
  try {
    value = draw();
  } catch (error) {
    errors.push(error);
  } finally {
    frames.delete(renderer);
    for (const cleanup of pending) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length)
    throw new AggregateError(errors, "Rendering and retired resource cleanup failed");
  return value;
}
