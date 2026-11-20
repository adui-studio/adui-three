import { expect, test, vi } from "vite-plus/test";
import { loadAssets } from "../src/loaders.ts";
import type { AssetBatchProgress } from "../src/loaders.ts";
import { ResourceScope } from "../src/core/resources.ts";
import type { SceneApp } from "../src/index.ts";

function host() {
  const controller = new AbortController();
  const resources = new ResourceScope();
  return { controller, resources, app: { resources, signal: controller.signal } as SceneApp };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const asset = (name = "asset") => ({ name, dispose: vi.fn() });
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

test("completed task progress is ignored and resource ownership transfers to the batch", async () => {
  const { app, resources } = host();
  const gate = deferred<ReturnType<typeof asset>>();
  const owned = resources.track(asset());
  let report!: (value: { loaded: number; total: null; ratio: null }) => void;
  const progress = vi.fn();
  const result = loadAssets(
    app,
    {
      first: async (context) => {
        report = context.onProgress;
        return owned;
      },
      waiting: () => gate.promise,
    },
    { onProgress: progress },
  );
  await flush();
  const count = progress.mock.calls.length;
  report({ loaded: 99, total: null, ratio: null });
  expect(progress).toHaveBeenCalledTimes(count);
  gate.resolve(asset());
  const batch = await result;
  resources.dispose();
  batch.dispose();
  expect(owned.dispose).toHaveBeenCalledTimes(1);
});

test("bounded parallelism, completion progress and typed values remain independent", async () => {
  const { app, resources } = host();
  const a = deferred<ReturnType<typeof asset>>(),
    b = deferred<ReturnType<typeof asset>>();
  const third = vi.fn(async () => asset("c"));
  const progress: AssetBatchProgress[] = [];
  const result = loadAssets(
    app,
    { a: () => a.promise, b: () => b.promise, c: third },
    { concurrency: 2, onProgress: (value) => progress.push(value) },
  );
  expect(third).not.toHaveBeenCalled();
  a.resolve(asset("a"));
  await flush();
  expect(third).toHaveBeenCalledTimes(1);
  b.resolve(asset("b"));
  const batch = await result;
  expect(batch.assets.a.name).toBe("a");
  expect(batch.assets.c.name).toBe("c");
  expect(progress.at(-1)).toMatchObject({ completed: 3, active: 0, queued: 0, ratio: 1 });
  expect(progress.every((event) => event.active <= 2)).toBe(true);
  expect(Object.isFrozen(batch.assets)).toBe(true);
  batch.dispose();
  resources.dispose();
  batch.dispose();
  for (const value of Object.values(batch.assets)) expect(value.dispose).toHaveBeenCalledTimes(1);
});

test("byte progress is separate and attempts retry only failed tasks", async () => {
  const { app, resources } = host();
  const progress: AssetBatchProgress[] = [];
  const stable = vi.fn(async () => asset());
  const attempts: number[] = [];
  const batch = await loadAssets(
    app,
    {
      stable,
      retry: async ({ attempt, onProgress }) => {
        attempts.push(attempt);
        onProgress({ loaded: 5, total: null, ratio: null });
        if (attempt === 1) throw new Error("transient");
        return asset();
      },
    },
    { concurrency: 1, retries: 1, onProgress: (p) => progress.push(p) },
  );
  expect(stable).toHaveBeenCalledTimes(1);
  expect(attempts).toEqual([1, 2]);
  expect(progress.find((p) => p.bytes)).toMatchObject({ ratio: 0.5, bytes: { ratio: null } });
  resources.dispose();
  expect(batch.disposed).toBe(true);
});

test("abort promptly rejects, skips queued work and disposes a late result", async () => {
  const { app, controller } = host();
  const late = deferred<ReturnType<typeof asset>>();
  const queued = vi.fn(async () => asset());
  const result = loadAssets(app, { late: () => late.promise, queued }, { concurrency: 1 });
  const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await rejection;
  const value = asset();
  late.resolve(value);
  await flush();
  expect(queued).not.toHaveBeenCalled();
  expect(value.dispose).toHaveBeenCalledTimes(1);
});

test("failure releases completed assets in reverse completion order and aborts siblings", async () => {
  const { app } = host();
  const order: string[] = [];
  let sibling: AbortSignal | undefined;
  const late = deferred<ReturnType<typeof asset>>();
  const result = loadAssets(
    app,
    {
      one: async () => ({
        dispose: () => {
          order.push("one");
        },
      }),
      two: async () => ({
        dispose: () => {
          order.push("two");
        },
      }),
      late: ({ signal }) => {
        sibling = signal;
        return late.promise;
      },
      fail: async () => {
        throw new Error("failed");
      },
    },
    { concurrency: 1 },
  );
  // With concurrency 1, the failure is behind the unfinished task until it completes.
  await flush();
  const value = asset();
  late.resolve(value);
  await expect(result).rejects.toThrow("failed");
  expect(sibling?.aborted).toBe(true);
  expect(order).toEqual(["two", "one"]);
  expect(value.dispose).toHaveBeenCalledTimes(1);
});

test("external cancellation and progress callback cancellation start no later task", async () => {
  const { app } = host();
  const controller = new AbortController();
  const load = vi.fn(async () => asset());
  await expect(
    loadAssets(app, { load }, { signal: controller.signal, onProgress: () => controller.abort() }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(load).not.toHaveBeenCalled();
});

test("progress callback failure cleans accepted assets and late cleanup is reported", async () => {
  const { app } = host();
  const gate = deferred<{ dispose(): void }>();
  const cleanup = vi.fn();
  const result = loadAssets(
    app,
    { one: () => gate.promise },
    {
      onCleanupError: cleanup,
      onProgress: (p) => {
        if (p.key) throw new Error("observer");
      },
    },
  );
  await expect(result).rejects.toThrow("observer");
  // A separate cancellation reaches a genuinely in-flight custom loader.
  const other = host();
  const cancel = new AbortController();
  const pending = loadAssets(
    other.app,
    { one: () => gate.promise },
    { signal: cancel.signal, onCleanupError: cleanup },
  );
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  cancel.abort();
  await rejected;
  gate.resolve({
    dispose: () => {
      throw new Error("late cleanup");
    },
  });
  await flush();
  expect(cleanup).toHaveBeenCalledWith(expect.objectContaining({ message: "late cleanup" }));
});

test("AbortError is not retried and sibling cleanup errors retain the original cause", async () => {
  const { app } = host();
  const load = vi.fn(async () => {
    throw new DOMException("cancel", "AbortError");
  });
  await expect(loadAssets(app, { load }, { retries: 3 })).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(load).toHaveBeenCalledTimes(1);
  const next = host();
  await expect(
    loadAssets(
      next.app,
      {
        first: async () => ({
          dispose: () => {
            throw new Error("cleanup");
          },
        }),
        second: async () => {
          throw new Error("original");
        },
      },
      { concurrency: 1 },
    ),
  ).rejects.toBeInstanceOf(AggregateError);
});

test("empty batches, invalid options and task snapshots have deterministic behavior", async () => {
  const { app, resources } = host();
  const empty = await loadAssets(app, {});
  expect(empty.assets).toEqual({});
  for (const concurrency of [0, 33, 1.5, Infinity])
    await expect(loadAssets(app, {}, { concurrency })).rejects.toThrow(RangeError);
  for (const retries of [-1, 11, 0.5])
    await expect(loadAssets(app, {}, { retries })).rejects.toThrow(RangeError);
  const first = deferred<ReturnType<typeof asset>>();
  const original = vi.fn(async () => asset("original"));
  const tasks = { first: () => first.promise, second: original };
  const result = loadAssets(app, tasks, { concurrency: 1 });
  tasks.second = vi.fn(async () => asset("replacement"));
  first.resolve(asset());
  expect((await result).assets.second.name).toBe("original");
  resources.dispose();
});

test("scope disposal cancels pending batches and duplicate asset ownership is rejected", async () => {
  const { app, resources } = host();
  const gate = deferred<ReturnType<typeof asset>>();
  const result = loadAssets(app, { gate: () => gate.promise });
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  resources.dispose();
  await rejected;
  const late = asset();
  gate.resolve(late);
  await flush();
  expect(late.dispose).toHaveBeenCalledTimes(1);
  const other = host();
  const shared = asset();
  await expect(
    loadAssets(other.app, { one: async () => shared, two: async () => shared }),
  ).rejects.toThrow("distinct owned handles");
  expect(shared.dispose).toHaveBeenCalledTimes(1);
});
