import { describe, expect, it, vi } from "vitest";
import { runSequentialActions } from "@/components/catalog/table-row-selection";

describe("runSequentialActions", () => {
  it("retries one by one, skips failures, and reports progress", async () => {
    const progress = [];
    const action = vi.fn(async (item) => {
      if (item === "b") throw new Error("device busy");
    });

    const { succeeded, failed, total } = await runSequentialActions({
      items: ["a", "b", "c"],
      action,
      onProgress: (p) => progress.push({ ...p, item: p.item }),
    });

    expect(total).toBe(3);
    expect(succeeded).toEqual(["a", "c"]);
    expect(failed).toHaveLength(1);
    expect(failed[0].item).toBe("b");
    expect(failed[0].message).toBe("device busy");
    expect(action).toHaveBeenCalledTimes(3);
    expect(progress.at(-1)).toMatchObject({
      index: 3,
      total: 3,
      succeeded: 2,
      failed: 1,
      item: "c",
    });
  });
});
