import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampPosOrderBusinessDate,
  normalizePosOrderDate,
  todayPosOrderDate,
  posOfflineDbNameForOwner,
  resolveActivePosOfflineDbName,
  setPosOfflineDbOwner,
  enablePosOfflinePerCashierDb,
  POS_OFFLINE_DB_NAME_LEGACY,
  POS_OFFLINE_PER_CASHIER_LS_KEY,
} from "@/lib/pos-offline-db";

const memoryLocalStorage = (() => {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(String(key), String(value));
    },
    removeItem: (key) => {
      map.delete(String(key));
    },
    clear: () => map.clear(),
  };
})();

vi.stubGlobal("localStorage", memoryLocalStorage);

describe("normalizePosOrderDate", () => {
  it("keeps plain Y-m-d business dates", () => {
    expect(normalizePosOrderDate("2026-08-03")).toBe("2026-08-03");
  });

  it("uses Africa/Nairobi calendar date for UTC ISO timestamps", () => {
    // 2026-08-03 23:30 UTC = 2026-08-04 02:30 in Nairobi
    expect(normalizePosOrderDate("2026-08-03T23:30:00.000Z")).toBe("2026-08-04");
    // 2026-08-03 10:00 UTC = 2026-08-03 13:00 in Nairobi
    expect(normalizePosOrderDate("2026-08-03T10:00:00.000Z")).toBe("2026-08-03");
  });
});

describe("clampPosOrderBusinessDate", () => {
  it("clamps a future POS date to today in Nairobi", () => {
    const today = todayPosOrderDate();
    expect(clampPosOrderBusinessDate("2099-12-31")).toBe(today);
  });
});

describe("per-cashier IndexedDB naming", () => {
  beforeEach(async () => {
    localStorage.removeItem(POS_OFFLINE_PER_CASHIER_LS_KEY);
    await setPosOfflineDbOwner({ organizationId: null, userId: null });
  });

  it("builds a stable per-cashier database name", () => {
    expect(posOfflineDbNameForOwner({ organization_id: 3, user_id: 12 })).toBe(
      `${POS_OFFLINE_DB_NAME_LEGACY}-o3-u12`,
    );
  });

  it("keeps the shared legacy DB until Z enables per-cashier mode", async () => {
    await setPosOfflineDbOwner({ organizationId: 3, userId: 12 });
    expect(resolveActivePosOfflineDbName()).toBe(POS_OFFLINE_DB_NAME_LEGACY);
  });

  it("routes to the cashier DB only after per-cashier mode is enabled", async () => {
    enablePosOfflinePerCashierDb();
    await setPosOfflineDbOwner({ organizationId: 3, userId: 12 });
    expect(resolveActivePosOfflineDbName()).toBe(`${POS_OFFLINE_DB_NAME_LEGACY}-o3-u12`);

    await setPosOfflineDbOwner({ organizationId: 3, userId: 99 });
    expect(resolveActivePosOfflineDbName()).toBe(`${POS_OFFLINE_DB_NAME_LEGACY}-o3-u99`);
  });
});
