import { describe, expect, it } from "vitest";
import {
  activeGeneralSettings,
  generalFormFromApi,
  generalPayloadFromForm,
  setActiveGeneralSettings,
} from "@/lib/general-settings";
import { formatOrgCurrency, formatOrgNumber } from "@/lib/format";
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
    setActiveGeneralSettings(null);
  });
});
