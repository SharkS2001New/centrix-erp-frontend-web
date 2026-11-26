import { describe, expect, it } from "vitest";
import {
  activeGeneralSettings,
  generalFormFromApi,
  generalPayloadFromForm,
  setActiveGeneralSettings,
} from "@/lib/general-settings";
import {
  formatOrgCurrency,
  formatOrgInputNumber,
  formatOrgNumber,
} from "@/lib/format";
import { formatDisplayQty } from "@/lib/stock-uom";
import { formatSaleKes } from "@/lib/sales";

describe("general-settings", () => {
  it("preserves zero decimal places in save payload", () => {
    expect(
      generalPayloadFromForm({
        currency: "KES",
        timezone: "Africa/Nairobi",
        date_format: "DD/MM/YYYY",
        language: "en",
        decimal_places: "0",
        number_thousands_separator: "comma",
        fiscal_year_start_month: "1",
        week_starts_on: "monday",
        phone_country_code: "+254",
        default_country_code: "KE",
      }).decimal_places,
    ).toBe(0);
  });

  it("round-trips zero decimal places from API form state", () => {
    const form = generalFormFromApi({ general: { decimal_places: 0 } });
    expect(form.decimal_places).toBe("0");
    expect(generalPayloadFromForm(form).decimal_places).toBe(0);
  });

  it("applies active general settings to currency formatters", () => {
    setActiveGeneralSettings({ decimal_places: 0, currency: "KES" });
    expect(formatSaleKes(1234.56)).toBe("KES 1,235");
    expect(formatOrgNumber(1234.56, activeGeneralSettings())).toBe("1,235");
    expect(formatOrgCurrency(1234.56, activeGeneralSettings())).toBe("KES 1,235");
    expect(formatDisplayQty(12.6)).toBe("13");
    setActiveGeneralSettings(null);
  });

  it("uses configured precision without grouping for numeric inputs", () => {
    const settings = { decimal_places: 2, number_thousands_separator: "comma" };
    expect(formatOrgNumber(1234.5, settings)).toBe("1,234.50");
    expect(
      formatOrgNumber(1234.5, settings, { useGrouping: false }),
    ).toBe("1234.50");
    expect(
      formatOrgNumber(1234.5, { ...settings, decimal_places: 0 }, {
        useGrouping: false,
      }),
    ).toBe("1235");
  });

  it("preserves input values whose stored precision exceeds the setting", () => {
    const settings = { decimal_places: 0 };
    expect(formatOrgInputNumber(1234, settings)).toBe("1234");
    expect(formatOrgInputNumber(1234.5, settings)).toBe("1234.5");
    expect(formatOrgInputNumber(12.345, { decimal_places: 2 })).toBe("12.345");
  });
});
