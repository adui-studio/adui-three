import { expect, test, vi } from "vite-plus/test";
import { renderWithRetirement, retireAfterRender } from "../src/render-retirement.ts";
test("retirement is synchronous outside draw and waits for the owning renderer inside draw", () => {
  const renderer = {},
    other = {},
    events: string[] = [];
  retireAfterRender(renderer, () => events.push("idle"));
  renderWithRetirement(renderer, () => {
    retireAfterRender(renderer, () => events.push("cleanup"));
    retireAfterRender(other, () => events.push("other"));
    events.push("draw");
    expect(events).toEqual(["idle", "other", "draw"]);
  });
  expect(events).toEqual(["idle", "other", "draw", "cleanup"]);
});
test("nested draws preserve the outer boundary and aggregate every cleanup after draw errors", () => {
  const renderer = {},
    last = vi.fn();
  expect(() =>
    renderWithRetirement(renderer, () => {
      renderWithRetirement(renderer, () =>
        retireAfterRender(renderer, () => {
          throw new Error("cleanup");
        }),
      );
      retireAfterRender(renderer, last);
      throw new Error("draw");
    }),
  ).toThrow(AggregateError);
  expect(last).toHaveBeenCalledOnce();
  expect(() => retireAfterRender(renderer, () => {})).not.toThrow();
});
