import { describe, expect, it } from "vitest";
import {
  finalizePosDisplayUnitPrice,
  finalizePosLineAmount,
  posCashOrderTotal,
  posDisplayCartLineAmount,
  roundLightStoresAmount,
} from "@/lib/pos-cash-round";

describe("roundLightStoresAmount", () => {
  it("rounds 105.4 to 106 (legacy last-digit on decimal string)", () => {
    expect(roundLightStoresAmount(105.4)).toBe(106);
  });

  it("applies ones-digit rules to whole shilling amounts", () => {
    expect(roundLightStoresAmount(101)).toBe(100);
    expect(roundLightStoresAmount(102)).toBe(105);
    expect(roundLightStoresAmount(105)).toBe(105);
    expect(roundLightStoresAmount(106)).toBe(105);
    expect(roundLightStoresAmount(107)).toBe(110);
    expect(roundLightStoresAmount(109)).toBe(110);
    expect(roundLightStoresAmount(110)).toBe(110);
  });

  it("returns 0 for empty or non-finite values", () => {
    expect(roundLightStoresAmount(0)).toBe(0);
    expect(roundLightStoresAmount(-5)).toBe(0);
    expect(roundLightStoresAmount(Number.NaN)).toBe(0);
  });
});

describe("posCashOrderTotal", () => {
  it("applies order-level round after per-line round", () => {
    expect(posCashOrderTotal([1592.5])).toBe(1595);
  });
});

describe("posDisplayCartLineAmount", () => {
  it("matches order total for a single line", () => {
    expect(posDisplayCartLineAmount(1592.5, [1592.5], { cashRound: true })).toBe(1595);
  });

  it("uses per-line round when multiple lines", () => {
    expect(posDisplayCartLineAmount(105.4, [105.4, 200], { cashRound: true })).toBe(106);
  });
});

describe("finalizePosLineAmount", () => {
  it("uses cent rounding when cash rounding is off", () => {
    expect(finalizePosLineAmount(105.4, { cashRound: false })).toBe(105.4);
    expect(finalizePosLineAmount(105.456, { cashRound: false })).toBe(105.46);
  });

  it("uses Light Stores rounding when cash rounding is on", () => {
    expect(finalizePosLineAmount(105.4, { cashRound: true })).toBe(106);
  });
});

describe("finalizePosDisplayUnitPrice", () => {
  it("keeps unit-price decimals even when cash rounding is on", () => {
    expect(finalizePosDisplayUnitPrice(92.22, { cashRound: true })).toBe(92.22);
    expect(finalizePosDisplayUnitPrice(92.226, { cashRound: true })).toBe(92.23);
    expect(finalizePosDisplayUnitPrice(89, { cashRound: true })).toBe(89);
    expect(finalizePosDisplayUnitPrice(89, { cashRound: false })).toBe(89);
  });
});
