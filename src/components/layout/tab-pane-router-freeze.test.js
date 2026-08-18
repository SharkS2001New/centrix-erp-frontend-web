import { describe, expect, it } from "vitest";
import { paramsFromTabHref } from "@/components/layout/tab-pane-router-freeze";

describe("paramsFromTabHref", () => {
  it("extracts trip id from fulfillment trip detail hrefs", () => {
    expect(paramsFromTabHref("/fulfillment/trips/63")).toEqual({ id: "63" });
    expect(paramsFromTabHref("/fulfillment/trips/63/close")).toEqual({ id: "63" });
  });

  it("does not invent params for list routes", () => {
    expect(paramsFromTabHref("/fulfillment/trips")).toEqual({});
    expect(paramsFromTabHref("/hr/attendance-clock")).toEqual({});
    expect(paramsFromTabHref("/admin/attendance-clock")).toEqual({});
  });

  it("extracts attendance clock device id from detail hrefs", () => {
    expect(paramsFromTabHref("/hr/attendance-clock/42")).toEqual({ id: "42" });
    expect(paramsFromTabHref("/admin/attendance-clock/42")).toEqual({ id: "42" });
  });
});
