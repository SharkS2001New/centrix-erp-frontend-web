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

describe("pos device ownership for previous-order edit", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("stamps and matches the current device id", async () => {
    const {
      getPosDeviceIdentifier,
      resolveSalePosDeviceId,
      saleBelongsToCurrentPosDevice,
    } = await import("@/lib/pos-device");

    const deviceId = getPosDeviceIdentifier();
    expect(deviceId).toBeTruthy();
    expect(getPosDeviceIdentifier()).toBe(deviceId);

    const sale = {
      id: 12,
      fulfillment_meta: { pos_device_id: deviceId },
    };
    expect(resolveSalePosDeviceId(sale)).toBe(deviceId);
    expect(saleBelongsToCurrentPosDevice(sale)).toBe(true);
  });

  it("blocks sales stamped to another device when there is no local copy", async () => {
    const { getPosDeviceIdentifier, saleBelongsToCurrentPosDevice, POS_OTHER_DEVICE_EDIT_BLOCK_MESSAGE } =
      await import("@/lib/pos-device");

    getPosDeviceIdentifier();
    expect(
      saleBelongsToCurrentPosDevice({
        id: 9,
        fulfillment_meta: { pos_device_id: "other-pc-uuid" },
      }),
    ).toBe(false);
    expect(POS_OTHER_DEVICE_EDIT_BLOCK_MESSAGE).toMatch(/another device/i);
  });

  it("allows IndexedDB local pending and synced-mirror rows on this machine", async () => {
    const { saleBelongsToCurrentPosDevice } = await import("@/lib/pos-device");

    expect(
      saleBelongsToCurrentPosDevice({
        id: "offline:abc",
        offline_pending_sync: true,
      }),
    ).toBe(true);
    expect(
      saleBelongsToCurrentPosDevice({
        id: 88,
        _local_synced_mirror: true,
        offline_client_uuid: "uuid-1",
      }),
    ).toBe(true);
    expect(
      saleBelongsToCurrentPosDevice({
        id: 88,
        offline_client_uuid: "uuid-1",
      }),
    ).toBe(true);
  });

  it("allows knownLocal even when the server stamp is missing or foreign", async () => {
    const { getPosDeviceIdentifier, saleBelongsToCurrentPosDevice } =
      await import("@/lib/pos-device");

    getPosDeviceIdentifier();
    expect(
      saleBelongsToCurrentPosDevice(
        { id: 44, order_num: 10 },
        { knownLocal: true },
      ),
    ).toBe(true);
    expect(
      saleBelongsToCurrentPosDevice(
        { id: 44, fulfillment_meta: { pos_device_id: "other-pc" } },
        { knownLocal: true },
      ),
    ).toBe(true);
  });

  it("allows unstamped cloud-synced server rows on this till after upload", async () => {
    const { getPosDeviceIdentifier, saleBelongsToCurrentPosDevice } =
      await import("@/lib/pos-device");

    getPosDeviceIdentifier();
    expect(saleBelongsToCurrentPosDevice({ id: 44, order_num: 10 })).toBe(true);
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
