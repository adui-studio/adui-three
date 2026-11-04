import { expect, test, vi } from "vite-plus/test";
import { ResourceScope } from "../src/index.ts";

test("owned resources are deduplicated, released in reverse order, and disposed once", () => {
  const scope = new ResourceScope();
  const order: number[] = [];
  const first = { dispose: vi.fn(() => order.push(1)) };
  const second = { dispose: vi.fn(() => order.push(2)) };
  scope.track(first);
  scope.track(first);
  scope.track(second);
  scope.dispose();
  scope.dispose();
  expect(order).toEqual([2, 1]);
  expect(first.dispose).toHaveBeenCalledTimes(1);
  expect(scope.disposed).toBe(true);
  expect(() => scope.track(first)).toThrow("disposed");
});

test("untrack transfers ownership without disposing", () => {
  const scope = new ResourceScope();
  const resource = { dispose: vi.fn() };
  scope.track(resource);
  expect(scope.untrack(resource)).toBe(true);
  scope.dispose();
  expect(resource.dispose).not.toHaveBeenCalled();
});

test("cleanup continues after failure, aggregates errors, and cannot reenter", () => {
  const scope = new ResourceScope();
  const cleanup = vi.fn();
  scope.track({ dispose: cleanup });
  scope.track({
    dispose(): void {
      scope.dispose();
      throw new Error("failed");
    },
  });
  expect(() => scope.dispose()).toThrow(AggregateError);
  expect(cleanup).toHaveBeenCalledOnce();
  expect(() => scope.dispose()).not.toThrow();
});
