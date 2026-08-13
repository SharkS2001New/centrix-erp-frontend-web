import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map();

vi.stubGlobal("localStorage", {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => {
    storage.set(key, String(value));
  },
  removeItem: (key) => {
    storage.delete(key);
  },
});

describe("pos device identifier", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("stamps and resolves the current device id", async () => {
    const {
      getPosDeviceIdentifier,
      resolveSalePosDeviceId,
    } = await import("@/lib/pos-device");

    const deviceId = getPosDeviceIdentifier();
    expect(deviceId).toBeTruthy();
    expect(getPosDeviceIdentifier()).toBe(deviceId);

    const sale = {
      id: 12,
      fulfillment_meta: { pos_device_id: deviceId },
    };
    expect(resolveSalePosDeviceId(sale)).toBe(deviceId);
  });

  it("detects local IndexedDB outbox rows", async () => {
    const { isLocalPosOutboxSaleRow } = await import("@/lib/pos-device");

    expect(
      isLocalPosOutboxSaleRow({
        id: "offline:abc",
        offline_pending_sync: true,
      }),
    ).toBe(true);
    expect(
      isLocalPosOutboxSaleRow({
        id: 88,
        _local_synced_mirror: true,
        offline_client_uuid: "uuid-1",
      }),
    ).toBe(true);
  });

  it("sends this computer's device id on restore-to-cart (does not spoof the receipt stamp)", async () => {
    const { getPosDeviceIdentifier, posDeviceIdForRestoreRequest } =
      await import("@/lib/pos-device");

    const deviceId = getPosDeviceIdentifier();
    expect(
      posDeviceIdForRestoreRequest({
        fulfillment_meta: { pos_device_id: "receipt-pc-uuid" },
      }),
    ).toBe(deviceId);
  });
});
