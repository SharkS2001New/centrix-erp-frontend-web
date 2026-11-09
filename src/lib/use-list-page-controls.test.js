import { beforeEach, describe, expect, it } from "vitest";
import {
  LIST_PAGE_SIZE_STORAGE_KEY,
  readStoredPageSize,
  resolveListPageSize,
} from "@/lib/use-list-page-controls";
import { reportCacheMatchesPageSize } from "@/lib/reports/report-page-size";

function installLocalStorageMock() {
  const storage = new Map();
  global.window = globalThis;
  global.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => {
      storage.set(key, String(value));
    },
    removeItem: (key) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  };
  return storage;
}

describe("resolveListPageSize", () => {
  beforeEach(() => {
    installLocalStorageMock().clear();
  });

  it("applies stored preference on first resolve so first fetch is not default-sized", () => {
    localStorage.setItem(LIST_PAGE_SIZE_STORAGE_KEY, "50");
    expect(resolveListPageSize(20, { maxSize: 50 }).pageSize).toBe(50);
    expect(readStoredPageSize(20)).toBe(50);
  });

  it("clamps stored 100 down to report maxSize 50", () => {
    localStorage.setItem(LIST_PAGE_SIZE_STORAGE_KEY, "100");
    expect(resolveListPageSize(20, { maxSize: 50 }).pageSize).toBe(50);
  });
});

describe("reportCacheMatchesPageSize", () => {
  it("rejects oversized legacy cache rows that would flash then shrink", () => {
    expect(reportCacheMatchesPageSize({ rows: new Array(50).fill({}) }, 20)).toBe(false);
    expect(reportCacheMatchesPageSize({ pageSize: 50, rows: new Array(50).fill({}) }, 20)).toBe(false);
    expect(reportCacheMatchesPageSize({ pageSize: 20, rows: new Array(20).fill({}) }, 20)).toBe(true);
  });
});
