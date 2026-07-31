import { describe, expect, it } from "vitest";
import {
  formatPrintPhones,
  resolveDocumentPrintPhones,
  resolveDocumentPrintPhonesLine,
} from "@/lib/document-print-phones";

describe("document print phones", () => {
  const organization = {
    primary_tel: "0700 111 111",
    secondary_tel: "0700 222 222",
  };

  it("formats Tel 1 / Tel 2", () => {
    expect(formatPrintPhones({ tel1: "A", tel2: "B" })).toBe("A / B");
    expect(formatPrintPhones({ tel1: "A", tel2: "" })).toBe("A");
  });

  it("thermal and A4 invoice always use company profile phones", () => {
    const salesSettings = {
      use_same_print_phones_for_proforma: false,
      proforma_print_phones: { tel1: "999", tel2: "" },
    };
    expect(
      resolveDocumentPrintPhones({
        documentType: "receipt",
        organization,
        salesSettings,
      }),
    ).toEqual({ tel1: "0700 111 111", tel2: "0700 222 222" });
    expect(
      resolveDocumentPrintPhones({
        documentType: "invoice",
        organization,
        salesSettings,
      }),
    ).toEqual({ tel1: "0700 111 111", tel2: "0700 222 222" });
  });

  it("proforma can use dedicated phones when use-same is off", () => {
    const line = resolveDocumentPrintPhonesLine({
      documentType: "proforma",
      organization,
      salesSettings: {
        use_same_print_phones_for_proforma: false,
        proforma_print_phones: { tel1: "0800 333 333", tel2: "0800 444 444" },
      },
    });
    expect(line).toBe("0800 333 333 / 0800 444 444");
  });

  it("proforma falls back to company phones when use-same is on", () => {
    const line = resolveDocumentPrintPhonesLine({
      documentType: "proforma",
      organization,
      salesSettings: {
        use_same_print_phones_for_proforma: true,
        proforma_print_phones: { tel1: "0800 333 333", tel2: "" },
      },
    });
    expect(line).toBe("0700 111 111 / 0700 222 222");
  });

  it("lpo can use dedicated phones independently", () => {
    const lpo = resolveDocumentPrintPhonesLine({
      documentType: "lpo",
      organization,
      procurementSettings: {
        use_same_print_phones_for_lpo: false,
        lpo_print_phones: { tel1: "LPO-1", tel2: "LPO-2" },
      },
    });
    expect(lpo).toBe("LPO-1 / LPO-2");
  });

  it("other branded docs use general other_print_phones", () => {
    const line = resolveDocumentPrintPhonesLine({
      documentType: "other",
      organization,
      generalSettings: {
        use_same_print_phones_for_other: false,
        other_print_phones: { tel1: "OTHER-1", tel2: "" },
      },
    });
    expect(line).toBe("OTHER-1");
  });
});
