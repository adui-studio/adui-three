import type { SceneApp } from "../core/three-app.ts";
import { ResourceScope } from "../core/resources.ts";
import type { Disposable } from "../core/resources.ts";

export interface AssetLoadContext {
  readonly signal: AbortSignal;
  /** One-based attempt number. Only failed attempts are retried. */
  readonly attempt: number;
  /** Optional primary-request byte progress, separate from batch completion. */
  onProgress(this: void, progress: AssetByteProgress): void;
}
export interface AssetByteProgress {
  readonly loaded: number;
  readonly total: number | null;
  readonly ratio: number | null;
}
export type AssetLoader<T extends Disposable = Disposable> = (
  context: AssetLoadContext,
) => Promise<T>;
export interface AssetBatchProgress {
  readonly total: number;
  readonly completed: number;
  readonly active: number;
  readonly queued: number;
  /** Completed task count / total, not a byte or decoding estimate. Empty batch is 1. */
  readonly ratio: number;
  readonly key: string | null;
  readonly attempt: number | null;
  readonly bytes: AssetByteProgress | null;
}
export interface LoadAssetsOptions {
  /** Integer 1..32. Default 4. Includes tasks waiting for an attempt to settle. */
  concurrency?: number;
  /** Additional attempts per task, integer 0..10. Default 0. AbortError is never retried. */
  retries?: number;
  signal?: AbortSignal;
  onProgress?: (progress: AssetBatchProgress) => void;
  /** Late custom-task cleanup errors after the batch has already rejected. */
  onCleanupError?: (error: unknown) => void;
}
export interface AssetBatch<T> extends Disposable {
  readonly assets: Readonly<T>;
  readonly disposed: boolean;
}
type Assets<T extends Record<string, AssetLoader>> = {
  readonly [K in keyof T]: Awaited<ReturnType<T[K]>>;
};

/** Compose existing loaders. The batch owns delivered assets; custom loaders must clean failed attempts. */
export async function loadAssets<const T extends Record<string, AssetLoader>>(
  app: SceneApp,
  tasks: T,
  options: LoadAssetsOptions = {},
): Promise<AssetBatch<Assets<T>>> {
  const { concurrency = 4, retries = 0, signal, onProgress, onCleanupError } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 32)
    throw new RangeError("concurrency must be an integer from 1 to 32");
  if (!Number.isInteger(retries) || retries < 0 || retries > 10)
    throw new RangeError("retries must be an integer from 0 to 10");
  if (!tasks || typeof tasks !== "object" || Array.isArray(tasks))
    throw new TypeError("Asset tasks must be a record of loader functions");
  const entries = Object.entries(tasks);
  if (entries.some(([, load]) => typeof load !== "function"))
    throw new TypeError("Every asset task must be a loader function");
  const aborted = (): DOMException => new DOMException("Asset batch was cancelled", "AbortError");
  if (app.signal.aborted || app.resources.disposed || signal?.aborted) throw aborted();

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const resources = new ResourceScope();
    const values: Record<string, Disposable> = Object.create(null);
    const received = new Set<Disposable>();
    let next = 0,
      active = 0,
      completed = 0;
    let settled = false,
      disposed = false;
    const detach = (): void => {
      app.signal.removeEventListener("abort", cancel);
      signal?.removeEventListener("abort", cancel);
    };
    const batch: AssetBatch<Assets<T>> = {
      get assets() {
        return values as Assets<T>;
      },
      get disposed() {
        return disposed;
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        detach();
        app.resources.untrack(batch);
        controller.abort();
        let cleanupError: unknown;
        try {
          resources.dispose();
        } catch (error) {
          cleanupError = error;
        }
        if (!settled) {
          settled = true;
          reject(cleanupError ? new AggregateError([aborted(), cleanupError]) : aborted());
        }
        if (cleanupError) throw cleanupError;
      },
    };
    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      try {
        batch.dispose();
      } catch (cleanupError) {
        reject(new AggregateError([error, cleanupError], "Asset loading and cleanup failed"));
        return;
      }
      reject(error);
    };
    const cancel = (): void => fail(aborted());
    const report = (error: unknown): void => {
      try {
        if (onCleanupError) onCleanupError(error);
        else console.error("Late asset cleanup failed", error);
      } catch (reportError) {
        console.error(reportError);
      }
    };
    const notify = (
      key: string | null = null,
      attempt: number | null = null,
      bytes: AssetByteProgress | null = null,
    ): void => {
      if (settled) return;
      try {
        onProgress?.(
          Object.freeze({
            total: entries.length,
            completed,
            active,
            queued: entries.length - next,
            ratio: entries.length ? completed / entries.length : 1,
            key,
            attempt,
            bytes,
          }),
        );
      } catch (error) {
        fail(error);
      }
    };
    const run = async (key: string, load: AssetLoader): Promise<void> => {
      for (let attempt = 1; !settled; attempt++) {
        notify(key, attempt);
        if (settled) return;
        let value: Disposable;
        let reporting = true;
        try {
          value = await load({
            signal: controller.signal,
            attempt,
            onProgress(progress) {
              if (reporting && !settled) notify(key, attempt, Object.freeze({ ...progress }));
            },
          });
        } catch (error) {
          if (settled) return;
          if (
            attempt <= retries &&
            !(error && typeof error === "object" && "name" in error && error.name === "AbortError")
          )
            continue;
          fail(error);
          return;
        } finally {
          reporting = false;
        }
        if (!value || typeof value.dispose !== "function") {
          fail(new TypeError(`Asset task ${key} must return an owned disposable asset`));
          return;
        }
        if (received.has(value)) {
          fail(new TypeError("Asset tasks must return distinct owned handles"));
          return;
        }
        received.add(value);
        if (settled || disposed) {
          try {
            value.dispose();
          } catch (error) {
            report(error);
          }
          return;
        }
        app.resources.untrack(value);
        resources.track(value);
        values[key] = value;
        completed++;
        return;
      }
    };
    const pump = (): void => {
      if (settled) return;
      if (completed === entries.length) {
        Object.freeze(values);
        settled = true;
        detach();
        resolve(batch);
        return;
      }
      while (!settled && active < concurrency && next < entries.length) {
        const [key, load] = entries[next++]!;
        active++;
        void run(key, load)
          .catch(fail)
          .finally(() => {
            active--;
            notify(key);
            pump();
          });
      }
    };
    app.resources.track(batch);
    app.signal.addEventListener("abort", cancel, { once: true });
    signal?.addEventListener("abort", cancel, { once: true });
    notify();
    if (app.signal.aborted || signal?.aborted) cancel();
    pump();
  });
}
