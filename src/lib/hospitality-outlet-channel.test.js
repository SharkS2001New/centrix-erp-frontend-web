import { describe, expect, it } from "vitest";
import {
  hospitalityOutletAssignmentLabel,
  hospitalityOutletCashierChannel,
  hospitalityOutletSelectOptions,
  hospitalityOutletTypeLabel,
} from "@/lib/hospitality-outlet-channel";

describe("hospitality outlet cashier channel", () => {
  it("maps bar and restaurant outlets to Bar and Hotel", () => {
    expect(hospitalityOutletCashierChannel({ outlet_type: "bar" })).toBe("Bar");
    expect(hospitalityOutletCashierChannel({ outlet_type: "restaurant" })).toBe("Hotel");
    expect(hospitalityOutletCashierChannel({ outlet_type: "hotel" })).toBe("Hotel");
    expect(hospitalityOutletTypeLabel("restaurant")).toBe("Hotel");
  });

  it("labels assigned cashiers with outlet name and Hotel or Bar", () => {
    expect(
      hospitalityOutletAssignmentLabel({ name: "Lobby Bar", outlet_type: "bar" }),
    ).toBe("Lobby Bar · Bar");
    expect(
      hospitalityOutletAssignmentLabel({ name: "Restaurant", outlet_type: "restaurant" }),
    ).toBe("Restaurant · Hotel");
    expect(hospitalityOutletAssignmentLabel(null)).toBe("Unassigned");
  });

  it("builds select options with Hotel or Bar", () => {
    const options = hospitalityOutletSelectOptions([
      { id: 1, name: "Bar", outlet_type: "bar" },
      { id: 2, name: "Restaurant", outlet_type: "restaurant" },
    ]);
    expect(options[0]).toEqual({ value: "", label: "Unassigned — pick Hotel or Bar" });
    expect(options.map((o) => o.label)).toContain("Bar · Bar");
    expect(options.map((o) => o.label)).toContain("Restaurant · Hotel");
  });
});
