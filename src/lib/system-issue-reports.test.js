import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./system-issue-api", () => ({
  postSystemIssueReportRaw: vi.fn(async (payload) => ({ id: "rep-1", ...payload })),
}));

describe("system-issue-reports slow gating", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("ignores notification poll paths for slow logs", async () => {
    const { shouldLogSlowRequest, SLOW_REQUEST_THRESHOLD_MS } = await import(
      "./system-issue-reports"
    );
    expect(shouldLogSlowRequest("/notifications/unread-count", SLOW_REQUEST_THRESHOLD_MS)).toBe(
      false,
    );
    expect(shouldLogSlowRequest("/notifications/unread", SLOW_REQUEST_THRESHOLD_MS)).toBe(false);
    expect(shouldLogSlowRequest("/notifications", SLOW_REQUEST_THRESHOLD_MS)).toBe(false);
    expect(shouldLogSlowRequest("/health", SLOW_REQUEST_THRESHOLD_MS)).toBe(false);
    expect(shouldLogSlowRequest("/sales", SLOW_REQUEST_THRESHOLD_MS)).toBe(true);
  });

  it("treats missing/low server time as network-dominated", async () => {
    const { isNetworkDominatedSlowRequest } = await import("./system-issue-reports");
    expect(isNetworkDominatedSlowRequest({ durationMs: 15000, serverMs: null })).toBe(true);
    expect(isNetworkDominatedSlowRequest({ durationMs: 15000, serverMs: 20 })).toBe(true);
    expect(isNetworkDominatedSlowRequest({ durationMs: 15000, serverMs: 4000 })).toBe(true);
    expect(isNetworkDominatedSlowRequest({ durationMs: 15000, serverMs: 12000 })).toBe(false);
  });

  it("does not submit slow reports for network-dominated RTT", async () => {
    const { postSystemIssueReportRaw } = await import("./system-issue-api");
    const { logSlowRequestIssue } = await import("./system-issue-reports");

    await logSlowRequestIssue({
      path: "/sales",
      method: "GET",
      status: 200,
      durationMs: 15000,
      serverMs: 40,
    });
    expect(postSystemIssueReportRaw).not.toHaveBeenCalled();

    await logSlowRequestIssue({
      path: "/sales",
      method: "GET",
      status: 200,
      durationMs: 15000,
      serverMs: 12000,
    });
    expect(postSystemIssueReportRaw).toHaveBeenCalledTimes(1);
    expect(postSystemIssueReportRaw.mock.calls[0][0].kind).toBe("slow");
  });

  it("logs client popup errors even when the user-facing message is generic", async () => {
    const { postSystemIssueReportRaw } = await import("./system-issue-api");
    const { logApiErrorIssue } = await import("./system-issue-reports");

    await logApiErrorIssue({
      path: "/sales/mobile-orders",
      method: "CLIENT",
      status: 0,
      message: "An error occurred in this page. Please report this to your system administrator.",
      apiBody: {
        technical_detail: "Cannot read properties of undefined (reading 'id')",
        exception_class: "ClientError",
      },
      context: {
        technical_detail: "Cannot read properties of undefined (reading 'id')",
      },
    });

    expect(postSystemIssueReportRaw).toHaveBeenCalledTimes(1);
    expect(postSystemIssueReportRaw.mock.calls[0][0].context.technical_detail).toContain(
      "Cannot read properties",
    );
  });
});
