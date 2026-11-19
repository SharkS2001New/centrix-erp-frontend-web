import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LicensePaybillInstructions } from "@/components/shared/license-paybill-instructions";

describe("LicensePaybillInstructions", () => {
  it("only shows monthly and yearly payment amounts", () => {
    const markup = renderToStaticMarkup(createElement(LicensePaybillInstructions, {
      paybill: {
        short_code: "123456",
        monthly_price: 500,
        yearly_price: 5000,
        token_pack_price: 1000,
      },
    }));

    expect(markup).toContain("Monthly");
    expect(markup).toContain("Yearly");
    expect(markup.toLowerCase()).not.toContain("token");
  });
});
