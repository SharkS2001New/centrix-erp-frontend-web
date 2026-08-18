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

describe("hotel PIN device binding", () => {
  beforeEach(() => {
    storage.clear();
  });

  it("remembers hospitality users who have a screen PIN", async () => {
    const { shouldRememberHotelPinDevice, syncHotelPinDeviceBinding, getHotelPinDeviceBinding } =
      await import("@/lib/hotel-pin-device");

    const user = { id: 9, username: "front.desk", full_name: "Ann", has_login_pin: true };
    const organization = { company_code: "TURI", deployment_profile: "hotel_bar" };
    const capabilities = { industry: "hospitality", deployment_profile: "hotel_bar" };

    expect(shouldRememberHotelPinDevice({ user, organization, capabilities })).toBe(true);
    syncHotelPinDeviceBinding({ user, organization, capabilities });
    expect(getHotelPinDeviceBinding()).toEqual({
      company_code: "TURI",
      username: "front.desk",
      full_name: "Ann",
      user_id: 9,
    });
  });

  it("does not bind retail users even if they have a PIN", async () => {
    const { shouldRememberHotelPinDevice, syncHotelPinDeviceBinding, getHotelPinDeviceBinding } =
      await import("@/lib/hotel-pin-device");

    const user = { id: 2, username: "cashier", has_login_pin: true };
    const organization = { company_code: "DEMO", deployment_profile: "wholesale_retail" };
    const capabilities = { industry: "commerce", deployment_profile: "wholesale_retail" };

    expect(shouldRememberHotelPinDevice({ user, organization, capabilities })).toBe(false);
    syncHotelPinDeviceBinding({ user, organization, capabilities });
    expect(getHotelPinDeviceBinding()).toBeNull();
  });

  it("clears the binding when a hotel user has no PIN", async () => {
    const {
      setHotelPinDeviceBinding,
      syncHotelPinDeviceBinding,
      getHotelPinDeviceBinding,
    } = await import("@/lib/hotel-pin-device");

    setHotelPinDeviceBinding({
      company_code: "TURI",
      username: "front.desk",
      full_name: "Ann",
      user_id: 9,
    });

    syncHotelPinDeviceBinding({
      user: { id: 9, username: "front.desk", has_login_pin: false },
      organization: { company_code: "TURI", deployment_profile: "hotel_bar" },
      capabilities: { industry: "hospitality" },
    });

    expect(getHotelPinDeviceBinding()).toBeNull();
  });

  it("falls back to password when PIN login is not available", async () => {
    const { shouldFallbackHotelPinToPassword } = await import("@/lib/hotel-pin-device");

    expect(
      shouldFallbackHotelPinToPassword({
        body: { errors: { pin: ["PIN sign-in is only available for Hotel & Hospitality."] } },
      }),
    ).toBe(true);
    expect(
      shouldFallbackHotelPinToPassword({
        body: { errors: { pin: ["Incorrect PIN."] } },
      }),
    ).toBe(false);
  });

  it("does not enable PIN unlock for retail organizations", async () => {
    const { pinUnlockEnabled } = await import("@/lib/hotel-pin-device");
    expect(
      pinUnlockEnabled({
        industry: "commerce",
        deployment_profile: "wholesale_retail",
        module_settings: { security: { enable_pin_unlock: true } },
      }),
    ).toBe(false);
  });

  it("enables PIN unlock for hospitality when the org setting is on", async () => {
    const { pinUnlockEnabled } = await import("@/lib/hotel-pin-device");
    expect(
      pinUnlockEnabled({
        industry: "hospitality",
        deployment_profile: "hotel_bar",
        module_settings: { security: { enable_pin_unlock: true } },
      }),
    ).toBe(true);
  });
});
