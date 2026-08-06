import { describe, expect, it } from "vitest";
import {
  humanizeKraDeviceErrorMessage,
  isKraProductNotRegisteredError,
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
