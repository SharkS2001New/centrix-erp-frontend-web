import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("@/lib/api", () => ({
  apiRequest: (...args) => apiRequest(...args),
  ApiError: class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  },
}));

describe("branch reference data cache", () => {
  beforeEach(async () => {
    apiRequest.mockReset();
    const { clearOrgCache } = await import("@/lib/org-cache");
    clearOrgCache();
  });

  it("keeps branches when organization IDs differ only by type", async () => {
    apiRequest.mockResolvedValue({
      data: [
        { id: 21, organization_id: "7", branch_name: "Head Office" },
        { id: 22, organization_id: "8", branch_name: "Other organization" },
      ],
    });

    const { fetchBranchesCached } = await import("@/lib/reference-data-cache");

    await expect(fetchBranchesCached(7)).resolves.toEqual([
      { id: 21, organization_id: "7", branch_name: "Head Office" },
    ]);
  });
});
