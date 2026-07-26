import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-config", () => ({
  useCookieAuth: false,
  apiFetchCredentials: () => "same-origin",
}));

vi.mock("@/lib/api-base-url", () => ({
  apiV1BaseUrl: () => "https://api.example.test/api/v1",
}));

describe("endServerAuthSession", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("posts bearer logout with keepalive and waits for the server", async () => {
    const { endServerAuthSession } = await import("@/lib/end-auth-session");
    const result = await endServerAuthSession({ token: "tok_abc", timeoutMs: 2000 });

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/auth/logout",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        headers: expect.objectContaining({
          Authorization: "Bearer tok_abc",
        }),
      }),
    );
  });

  it("skips bearer logout when there is no token", async () => {
    const { endServerAuthSession } = await import("@/lib/end-auth-session");
    const result = await endServerAuthSession({ token: null });

    expect(result).toEqual({ ok: true, skipped: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns timedOut when the server is slow, without aborting keepalive", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true, status: 200 }), 500);
          }),
      ),
    );

    const { endServerAuthSession } = await import("@/lib/end-auth-session");
    const result = await endServerAuthSession({ token: "tok_abc", timeoutMs: 50 });

    expect(result).toEqual({ ok: false, timedOut: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ keepalive: true }),
    );
  });
});

describe("endServerAuthSession cookie mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/auth-config", () => ({
      useCookieAuth: true,
      apiFetchCredentials: () => "include",
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, status: 204 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("posts cookie logout with credentials include", async () => {
    const { endServerAuthSession } = await import("@/lib/end-auth-session");
    const result = await endServerAuthSession({ timeoutMs: 2000 });

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.example.test/api/v1/auth/logout",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        keepalive: true,
      }),
    );
  });
});
