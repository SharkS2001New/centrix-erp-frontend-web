import { describe, expect, it } from "vitest";
import { humanizeKraDeviceErrorMessage } from "./kra-device-errors";

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
});
