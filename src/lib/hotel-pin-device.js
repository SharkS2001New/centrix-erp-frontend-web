import { isHotelCatalogueContext } from "@/lib/catalog-mode";
import { isHospitalityIndustry } from "@/lib/org-settings-tabs";
import { mergeSecuritySettings } from "@/lib/security-settings";

export const HOTEL_PIN_DEVICE_STORAGE_KEY = "centrix.hotel_pin_device_v1";

/**
 * After a hotel user with a screen PIN signs in once, remember them on this
 * browser so later visits ask for PIN instead of username and password.
 */

function hasStorage() {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

export function pinUnlockEnabled(capabilities) {
  if (!isHospitalityIndustry(capabilities) && !isHotelCatalogueContext(capabilities)) {
    return false;
  }
  return mergeSecuritySettings(capabilities?.module_settings).enable_pin_unlock !== false;
}

export function shouldRememberHotelPinDevice({ user, organization, capabilities } = {}) {
  if (!user?.has_login_pin) return false;
  if (!pinUnlockEnabled(capabilities)) return false;
  if (isHotelCatalogueContext(capabilities)) return true;
  return organization?.deployment_profile === "hotel_bar";
}

export function getHotelPinDeviceBinding() {
  if (!hasStorage()) return null;
  try {
    const raw = localStorage.getItem(HOTEL_PIN_DEVICE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const companyCode = String(parsed?.company_code ?? "")
      .trim()
      .toUpperCase();
    const username = String(parsed?.username ?? "").trim();
    if (!companyCode || !username) return null;
    return {
      company_code: companyCode,
      username,
      full_name: String(parsed?.full_name ?? "").trim() || username,
      user_id: parsed?.user_id ?? null,
    };
  } catch {
    return null;
  }
}

export function setHotelPinDeviceBinding(payload) {
  if (!hasStorage()) return;
  const companyCode = String(payload?.company_code ?? "")
    .trim()
    .toUpperCase();
  const username = String(payload?.username ?? "").trim();
  if (!companyCode || !username) return;
  localStorage.setItem(
    HOTEL_PIN_DEVICE_STORAGE_KEY,
    JSON.stringify({
      company_code: companyCode,
      username,
      full_name: String(payload?.full_name ?? "").trim() || username,
      user_id: payload?.user_id ?? null,
    }),
  );
}

export function clearHotelPinDeviceBinding() {
  if (!hasStorage()) return;
  localStorage.removeItem(HOTEL_PIN_DEVICE_STORAGE_KEY);
}

export function syncHotelPinDeviceBinding({ user, organization, capabilities } = {}) {
  if (!shouldRememberHotelPinDevice({ user, organization, capabilities })) {
    clearHotelPinDeviceBinding();
    return null;
  }

  const companyCode = String(organization?.company_code ?? "")
    .trim()
    .toUpperCase();
  const username = String(user?.username || user?.email || "").trim();
  if (!companyCode || !username) {
    clearHotelPinDeviceBinding();
    return null;
  }

  const binding = {
    company_code: companyCode,
    username,
    full_name: String(user?.full_name ?? "").trim() || username,
    user_id: user?.id ?? null,
  };
  setHotelPinDeviceBinding(binding);
  return binding;
}

export function shouldFallbackHotelPinToPassword(error) {
  const pinErrors = error?.body?.errors?.pin;
  const messages = [
    ...(Array.isArray(pinErrors) ? pinErrors : []),
    error?.message,
  ]
    .join(" ")
    .toLowerCase();
  return (
    messages.includes("only available") ||
    messages.includes("does not have a screen pin") ||
    messages.includes("turned off")
  );
}
