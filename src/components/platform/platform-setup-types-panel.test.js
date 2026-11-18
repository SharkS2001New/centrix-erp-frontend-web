import { describe, expect, it } from "vitest";
import { setupProfileSupportsPayroll } from "./platform-setup-types-panel";

describe("setupProfileSupportsPayroll", () => {
  it("uses the current HR application setting instead of stale application IDs", () => {
    expect(
      setupProfileSupportsPayroll({
        applications: { hr: false },
        application_ids: ["hr"],
      }),
    ).toBe(false);
    expect(setupProfileSupportsPayroll({ applications: { hr: true } })).toBe(true);
  });
});
