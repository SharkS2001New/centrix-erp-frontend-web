import { describe, expect, it } from "vitest";
import {
  ApiError,
  ATTENDANCE_AGENT_TIMEOUT_MESSAGE,
  NETWORK_CONNECTIVITY_MESSAGE,
  isStaleWorkspaceChannelError,
  isNetworkFetchError,
  isOrgSettingsApiPath,
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

  it("returns Server is down for Centrix AI path fetch failures while online", () => {
    expect(
      userFacingNetworkErrorMessage(
        new TypeError("Failed to fetch"),
        NETWORK_CONNECTIVITY_MESSAGE,
        "/ai/chat",
      ),
    ).toBe("Server is down");
  });
});

describe("isStaleWorkspaceChannelError", () => {
  const message =
    "This session was started from POS and cannot access this part of the system. Sign in with an allowed channel.";

  it("ignores channel denials from requests made during a workspace session rotation", () => {
    expect(
      isStaleWorkspaceChannelError({
        status: 403,
        message,
        isAuthRequest: false,
        hasSession: true,
        sessionRotated: true,
      }),
    ).toBe(true);
  });

  it("preserves ordinary permission errors and auth-switch failures", () => {
    expect(
      isStaleWorkspaceChannelError({
        status: 403,
        message,
        isAuthRequest: false,
        hasSession: true,
        sessionRotated: false,
      }),
    ).toBe(false);
    expect(
      isStaleWorkspaceChannelError({
        status: 403,
        message,
        isAuthRequest: true,
        hasSession: true,
        sessionRotated: true,
      }),
    ).toBe(false);
  });
});

describe("isOrgSettingsApiPath", () => {
  it("disables browser caching for organization configuration and settings reads", () => {
    expect(isOrgSettingsApiPath("/admin/organizations/42")).toBe(true);
    expect(isOrgSettingsApiPath("/api/v1/admin/organizations/42?include=modules")).toBe(true);
    expect(isOrgSettingsApiPath("/admin/organizations/42/settings/general")).toBe(true);
    expect(isOrgSettingsApiPath("/erp/settings/general")).toBe(true);
  });

  it("does not classify the organization list or unrelated organization routes as settings", () => {
    expect(isOrgSettingsApiPath("/admin/organizations")).toBe(false);
    expect(isOrgSettingsApiPath("/admin/organizations/42/cache")).toBe(false);
  });
});


