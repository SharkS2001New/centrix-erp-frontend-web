import { describe, expect, it } from "vitest";
import { stockTakeCountsAreValid } from "./stock-take-count-inputs";

const levels = [{ key: "full" }, { key: "small" }];

describe("stockTakeCountsAreValid", () => {
  it("accepts explicit zero counts", () => {
    expect(
      stockTakeCountsAreValid("line-1", levels, {
        "line-1:full": "0",
        "line-1:small": "0",
      }),
    ).toBe(true);
  });

  it("rejects blank or negative count fields", () => {
    expect(
      stockTakeCountsAreValid("line-1", levels, {
        "line-1:full": "2",
        "line-1:small": "",
      }),
    ).toBe(false);
    expect(
      stockTakeCountsAreValid("line-1", levels, {
        "line-1:full": "-1",
        "line-1:small": "3",
      }),
    ).toBe(false);
  });
});
