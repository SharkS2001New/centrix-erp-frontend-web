import { describe, expect, it } from "vitest";
import {
  fulfillmentPickedBaseQty,
  fulfillmentPickedDisplayQty,
  fulfillmentPickedInputUnit,
  fulfillmentPickedUsesSmallUnit,
} from "./fulfillment-quantity";

const cartonUom = {
  id: 1,
  uom_type: "carton",
  full_name: "carton",
  conversion_factor: 12,
  small_packaging_label: "piece",
};

const line = (requiredQty, extra = {}) => ({
  product_code: "P1",
  required_qty: requiredQty,
  ...extra,
});

describe("fulfillmentPickedUsesSmallUnit", () => {
  const uomMap = new Map([["P1", cartonUom]]);

  it("uses small units for loose pieces below one carton", () => {
    expect(fulfillmentPickedUsesSmallUnit(line(5), uomMap)).toBe(true);
    expect(fulfillmentPickedUsesSmallUnit(line(1), uomMap)).toBe(true);
  });

  it("uses full packages for whole-carton quantities", () => {
    expect(fulfillmentPickedUsesSmallUnit(line(12), uomMap)).toBe(false);
    expect(fulfillmentPickedUsesSmallUnit(line(24), uomMap)).toBe(false);
  });

  it("uses small units for mixed carton + piece quantities", () => {
    expect(fulfillmentPickedUsesSmallUnit(line(15), uomMap)).toBe(true);
  });
});

describe("fulfillmentPickedDisplayQty", () => {
  const uomMap = new Map([["P1", cartonUom]]);

  it("shows piece counts for loose-piece requests", () => {
    expect(fulfillmentPickedDisplayQty(5, line(5), uomMap)).toBe(5);
    expect(fulfillmentPickedDisplayQty(1, line(1), uomMap)).toBe(1);
  });

  it("shows carton counts for whole-carton requests", () => {
    expect(fulfillmentPickedDisplayQty(12, line(12), uomMap)).toBe(1);
    expect(fulfillmentPickedDisplayQty(24, line(24), uomMap)).toBe(2);
  });
});

describe("fulfillmentPickedBaseQty", () => {
  const uomMap = new Map([["P1", cartonUom]]);

  it("stores piece input as base units for loose-piece requests", () => {
    expect(fulfillmentPickedBaseQty(5, line(5), uomMap)).toBe(5);
  });

  it("stores carton input as base units for whole-carton requests", () => {
    expect(fulfillmentPickedBaseQty(2, line(24), uomMap)).toBe(24);
  });
});

describe("fulfillmentPickedInputUnit", () => {
  const uomMap = new Map([["P1", cartonUom]]);

  it("labels loose-piece input as piece", () => {
    expect(fulfillmentPickedInputUnit(line(5), uomMap)).toBe("piece");
  });

  it("labels whole-carton input as carton", () => {
    expect(fulfillmentPickedInputUnit(line(12), uomMap)).toBe("carton");
  });
});
