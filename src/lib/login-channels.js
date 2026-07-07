export const LOGIN_CHANNELS = [
  { value: "backoffice", label: "Backoffice (web ERP)" },
  { value: "pos", label: "POS (external terminal)" },
  { value: "mobile", label: "Mobile app (field sales / driver)" },
  { value: "manager", label: "Manager app" },
];

export const DEFAULT_LOGIN_CHANNELS = LOGIN_CHANNELS.map((c) => c.value);

/** @param {import("@/contexts/auth-context").Capabilities | null | undefined} capabilities */
export function allowedLoginChannelValues(capabilities) {
  if (Array.isArray(capabilities?.allowed_login_channels) && capabilities.allowed_login_channels.length > 0) {
    return new Set(capabilities.allowed_login_channels);
  }

  const allowed = new Set();
  if (capabilities?.modules?.["sales.backend"] !== false) {
    allowed.add("backoffice");
  }
  if (capabilities?.modules?.["sales.pos"]) {
    allowed.add("pos");
  }
  if (
    (
      capabilities?.mobile_orders_enabled !== false &&
      capabilities?.modules?.["sales.mobile"] &&
      capabilities?.module_settings?.sales?.enable_mobile_orders !== false
    ) ||
    capabilities?.driver_mobile_enabled === true
  ) {
    allowed.add("mobile");
  }
  if (
    capabilities?.modules?.["sales.backend"] !== false &&
    capabilities?.module_settings?.sales?.enable_manager_app !== false
  ) {
    allowed.add("manager");
  }

  return allowed.size > 0 ? allowed : new Set(["backoffice"]);
}

/** @param {import("@/contexts/auth-context").Capabilities | null | undefined} capabilities */
export function availableLoginChannelsFromCapabilities(capabilities) {
  const allowed = allowedLoginChannelValues(capabilities);
  return LOGIN_CHANNELS.filter((channel) => allowed.has(channel.value));
}

/** @param {import("@/contexts/auth-context").Capabilities | null | undefined} capabilities */
export function defaultLoginChannelsForCapabilities(capabilities) {
  return [...allowedLoginChannelValues(capabilities)];
}

export function normalizeLoginChannels(channels, allowedValues = null) {
  const allowed = allowedValues ?? new Set(DEFAULT_LOGIN_CHANNELS);
  if (!Array.isArray(channels) || channels.length === 0) {
    const fallback = [...allowed];
    return fallback.length > 0 ? fallback : [...DEFAULT_LOGIN_CHANNELS];
  }
  const normalized = [...new Set(channels.filter((c) => allowed.has(c)))];
  if (normalized.length > 0) {
    return normalized;
  }
  const fallback = [...allowed];
  return fallback.length > 0 ? fallback : [...DEFAULT_LOGIN_CHANNELS];
}

export function formatLoginChannels(channels) {
  const normalized = normalizeLoginChannels(channels);
  const labels = new Map(LOGIN_CHANNELS.map((c) => [c.value, c.label]));
  return normalized.map((c) => labels.get(c) ?? c).join(", ");
}

export function isMobileOnlyLogin(channels) {
  const normalized = normalizeLoginChannels(channels);
  return normalized.length === 1 && normalized[0] === "mobile";
}

/** Web ERP sign-in always uses the backoffice API channel (workspace picker routes users after login). */
export const WEB_LOGIN_CHANNEL = "backoffice";

/** @deprecated POS is a workspace, not a separate login. Kept for API/mobile channel labels. */
export const POS_LOGIN_CHANNEL = "pos";

/** Default home for the POS workspace. */
export const POS_HOME_PATH = "/pos";
