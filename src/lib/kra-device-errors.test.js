import { describe, expect, it } from "vitest";
import {
  humanizeKraDeviceErrorMessage,
  isKraProductNotRegisteredError,
  snippetKraErrorReason,
  suggestKraFailureFix,
} from "./kra-device-errors";

describe("humanizeKraDeviceErrorMessage", () => {
  it("maps 519 communication failures", () => {
    expect(humanizeKraDeviceErrorMessage("519 error code, aborted without a reason")).toMatch(
      /not communicating/i,
    );
  });

  it("maps aborted-without-reason noise", () => {
    expect(humanizeKraDeviceErrorMessage("signal is aborted without a reason")).toMatch(
      /stopped responding/i,
    );
  });

  it("leaves unrelated messages alone", () => {
    expect(humanizeKraDeviceErrorMessage("Cart is empty")).toBeNull();
  });

  it("maps unregistered PLU errors", () => {
    expect(humanizeKraDeviceErrorMessage("337 error code")).toMatch(/not on the KRA device/i);
  });
});

describe("suggestKraFailureFix", () => {
  it("suggests PLU upload for missing products", () => {
    expect(suggestKraFailureFix("NO FIND PLU DATA for item ABC123", { culpritNames: ["Milk"] })).toMatch(
      /upload "Milk" to the KRA device/i,
    );
  });

  it("suggests tax type fix for amount / VAT mismatches", () => {
    expect(
      suggestKraFailureFix(
        "Line amounts do not match the invoice totals, or VAT fields were filled for the wrong tax bracket.",
      ),
    ).toMatch(/VAT \/ tax type/i);
  });
});

describe("snippetKraErrorReason", () => {
  it("keeps short text and trims long reasons to four words", () => {
    expect(snippetKraErrorReason("Device offline")).toBe("Device offline");
    expect(
      snippetKraErrorReason(
        "Line amounts do not match the invoice totals, or VAT fields were filled for the wrong tax bracket.",
      ),
    ).toBe("Line amounts do not…");
  });
});

describe("isKraProductNotRegisteredError", () => {
  it("detects code 337 and registration copy", () => {
    expect(isKraProductNotRegisteredError("337 error code")).toBe(true);
    expect(
      isKraProductNotRegisteredError(
        "One or more products were not found on the KRA device.",
      ),
    ).toBe(true);
  });

  it("ignores unrelated checkout errors", () => {
    expect(isKraProductNotRegisteredError("Cart is empty")).toBe(false);
  });
});
