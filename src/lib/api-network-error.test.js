import { describe, expect, it } from "vitest";
import {
  ApiError,
  ATTENDANCE_AGENT_TIMEOUT_MESSAGE,
  NETWORK_CONNECTIVITY_MESSAGE,
  isNetworkFetchError,
  userFacingNetworkErrorMessage,
} from "./api";

describe("isNetworkFetchError", () => {
  it("detects Failed to fetch", () => {
    expect(isNetworkFetchError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("detects tagged ApiError", () => {
    expect(
      isNetworkFetchError(
        new ApiError(NETWORK_CONNECTIVITY_MESSAGE, 0, { code: "network_unavailable" }),
      ),
    ).toBe(true);
  });

  it("ignores normal auth errors", () => {
    expect(isNetworkFetchError(new ApiError("Invalid credentials.", 401, null))).toBe(false);
  });
});

describe("userFacingNetworkErrorMessage", () => {
  it("replaces Failed to fetch with a check-internet message", () => {
    expect(userFacingNetworkErrorMessage(new TypeError("Failed to fetch"))).toBe(
      NETWORK_CONNECTIVITY_MESSAGE,
    );
  });

  it("uses attendance agent copy for hikvision refresh paths", () => {
    expect(
      userFacingNetworkErrorMessage(
        new TypeError("Failed to fetch"),
        NETWORK_CONNECTIVITY_MESSAGE,
        "/attendance-clock-devices/3/hikvision/overview",
      ),
    ).toBe(ATTENDANCE_AGENT_TIMEOUT_MESSAGE);
  });
});
