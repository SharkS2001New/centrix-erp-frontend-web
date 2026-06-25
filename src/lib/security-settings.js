export const SECURITY_DEFAULTS = {
  screen_lock_minutes: 5,
  session_idle_minutes: 60,
  require_strong_passwords: false,
  password_min_length: 8,
  password_expiry_enabled: true,
  password_expiry_days: 90,
  password_expiry_max_skips: 2,
};

export function mergeSecuritySettings(moduleSettings) {
  return { ...SECURITY_DEFAULTS, ...(moduleSettings?.security ?? {}) };
}

export function securityFormFromApi(res) {
  const security = mergeSecuritySettings({ security: res?.security ?? res });
  return {
    screen_lock_minutes: String(security.screen_lock_minutes ?? 5),
    session_idle_minutes: String(security.session_idle_minutes ?? 60),
    require_strong_passwords: Boolean(security.require_strong_passwords),
    password_min_length: String(security.password_min_length ?? 8),
    password_expiry_enabled: Boolean(security.password_expiry_enabled),
    password_expiry_days: String(security.password_expiry_days ?? 90),
    password_expiry_max_skips: String(security.password_expiry_max_skips ?? 2),
  };
}

export function securityPayloadFromForm(form) {
  const screenLock = Number(form.screen_lock_minutes) || 5;
  const sessionIdle = Number(form.session_idle_minutes) || 60;

  return {
    screen_lock_minutes: screenLock,
    session_idle_minutes: sessionIdle,
    require_strong_passwords: Boolean(form.require_strong_passwords),
    password_min_length: Number(form.password_min_length) || 8,
    password_expiry_enabled: Boolean(form.password_expiry_enabled),
    password_expiry_days: Number(form.password_expiry_days) || 90,
    password_expiry_max_skips: Number(form.password_expiry_max_skips) || 2,
  };
}

export function validateSecurityForm(form) {
  const screenLock = Number(form.screen_lock_minutes);
  const sessionIdle = Number(form.session_idle_minutes);
  const expiryDays = Number(form.password_expiry_days);
  const maxSkips = Number(form.password_expiry_max_skips);

  if (!Number.isFinite(screenLock) || screenLock < 1 || screenLock > 120) {
    return "Screen lock must be between 1 and 120 minutes.";
  }
  if (!Number.isFinite(sessionIdle) || sessionIdle < 5 || sessionIdle > 480) {
    return "Sign-out timeout must be between 5 and 480 minutes.";
  }
  if (screenLock >= sessionIdle) {
    return "Screen lock must be less than the sign-out timeout.";
  }
  if (!Number.isFinite(expiryDays) || expiryDays < 30 || expiryDays > 730) {
    return "Password expiry must be between 30 and 730 days.";
  }
  if (!Number.isFinite(maxSkips) || maxSkips < 0 || maxSkips > 10) {
    return "Password expiry reminders can be skipped at most 10 times.";
  }

  return null;
}

/** @typedef {{ enabled?: boolean, expired?: boolean, forced?: boolean, skips_remaining?: number, skip_count?: number, max_skips?: number, expiry_days?: number, expires_at?: string|null, days_until_expiry?: number|null }} PasswordExpiryStatus */

export function isPasswordExpiryForced(user, passwordExpiry) {
  if (user?.must_change_password) return true;
  return Boolean(passwordExpiry?.forced);
}

export function shouldPromptPasswordExpiry(user, passwordExpiry) {
  if (user?.must_change_password) return false;
  if (!passwordExpiry?.enabled) return false;
  if (!passwordExpiry?.expired) return false;
  return !passwordExpiry?.forced;
}
