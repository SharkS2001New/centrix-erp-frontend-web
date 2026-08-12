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

  it("blocks sales stamped to another device", async () => {
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

  it("allows unstamped local pending outbox rows on this till", async () => {
    const { saleBelongsToCurrentPosDevice } = await import("@/lib/pos-device");

    expect(
      saleBelongsToCurrentPosDevice({
        id: "offline:abc",
        offline_pending_sync: true,
      }),
    ).toBe(true);
    expect(
      saleBelongsToCurrentPosDevice(
        { id: 44, order_num: 10 },
        { allowUnstampedLocalOutbox: false },
      ),
    ).toBe(false);
  });
});
