export interface Disposable {
  dispose(): void;
}

/** Explicit ownership only: tracking an object does not traverse its children. */
export class ResourceScope implements Disposable {
  #resources = new Set<Disposable>();
  #disposed = false;

  get disposed(): boolean {
    return this.#disposed;
  }

  track<T extends Disposable>(resource: T): T {
    if (this.#disposed) throw new Error("Cannot track resources in a disposed scope");
    this.#resources.add(resource);
    return resource;
  }

  /** Transfer ownership back to the caller without disposing the resource. */
  untrack(resource: Disposable): boolean {
    return this.#resources.delete(resource);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const resources = [...this.#resources].reverse();
    this.#resources.clear();
    const errors: unknown[] = [];
    for (const resource of resources) {
      try {
        resource.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "Resource cleanup failed");
  }
}
