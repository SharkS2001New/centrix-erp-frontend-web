export const LOGIN_CHANNELS = [
  { value: "backoffice", label: "Backoffice (web ERP)" },
  { value: "pos", label: "POS" },
  { value: "mobile", label: "Mobile app" },
];

export const DEFAULT_LOGIN_CHANNELS = LOGIN_CHANNELS.map((c) => c.value);

export function normalizeLoginChannels(channels) {
  if (!Array.isArray(channels) || channels.length === 0) {
    return [...DEFAULT_LOGIN_CHANNELS];
  }
  const allowed = new Set(DEFAULT_LOGIN_CHANNELS);
  const normalized = [...new Set(channels.filter((c) => allowed.has(c)))];
  return normalized.length > 0 ? normalized : [...DEFAULT_LOGIN_CHANNELS];
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

/** Web ERP sign-in always uses the backoffice channel. */
export const WEB_LOGIN_CHANNEL = "backoffice";
