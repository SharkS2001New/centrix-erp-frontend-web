import { describe, expect, it } from "vitest";
import { expandHotelRoomNumbers, occupancySourceLabel } from "./hospitality-room-numbers";

describe("expandHotelRoomNumbers", () => {
  it("increments numeric rooms and keeps padding", () => {
    expect(expandHotelRoomNumbers("101", 3)).toEqual(["101", "102", "103"]);
    expect(expandHotelRoomNumbers("G01", 2)).toEqual(["G01", "G02"]);
  });

  it("rejects a start value without digits", () => {
    expect(() => expandHotelRoomNumbers("Suite", 2)).toThrow(/prefix plus digits/i);
  });
});

describe("occupancySourceLabel", () => {
  it("names POS vs front desk occupancy", () => {
    expect(occupancySourceLabel("pos_room_sale")).toBe("Hotel POS");
    expect(occupancySourceLabel("pms_folio")).toBe("Front desk folio");
    expect(occupancySourceLabel(null)).toBe("Available");
  });
});
