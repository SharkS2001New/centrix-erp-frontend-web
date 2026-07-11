/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import {
  classifyLatency,
  formatSlowLatencyMessage,
  parseServerDurationMs,
} from "./latency-split";

describe("latency-split", () => {
  it("classifies dominant network delay", () => {
    const split = classifyLatency({ clientRttMs: 6000, serverMs: 12 });
    expect(split.likely).toBe("network");
    expect(split.network_estimate_ms).toBe(5988);
    expect(formatSlowLatencyMessage({ mode: "ping", clientRttMs: 6000, serverMs: 12 })).toContain(
      "Likely user network",
    );
  });

  it("classifies dominant API delay", () => {
    const split = classifyLatency({ clientRttMs: 5200, serverMs: 4800 });
    expect(split.likely).toBe("api");
    expect(formatSlowLatencyMessage({ mode: "request", clientRttMs: 5200, serverMs: 4800 })).toContain(
      "Likely API slow",
    );
  });

  it("parses server duration from body and headers", () => {
    expect(parseServerDurationMs(null, { server_ms: 15 })).toBe(15);

    const headers = new Map([
      ["X-Response-Time", "22ms"],
      ["Server-Timing", 'app;desc="Centrix API";dur=18.4'],
    ]);
    const res = { headers: { get: (key) => headers.get(key) ?? headers.get(key.toLowerCase()) ?? null } };
    expect(parseServerDurationMs(res)).toBe(22);
  });
});
