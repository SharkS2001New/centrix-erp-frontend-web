export const SECURITY_DEFAULTS = {
  screen_lock_minutes: 5,
  session_idle_minutes: 60,
  require_strong_passwords: false,
  password_min_length: 8,
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
  };
}

export function validateSecurityForm(form) {
  const screenLock = Number(form.screen_lock_minutes);
  const sessionIdle = Number(form.session_idle_minutes);

  if (!Number.isFinite(screenLock) || screenLock < 1 || screenLock > 120) {
    return "Screen lock must be between 1 and 120 minutes.";
  }
  if (!Number.isFinite(sessionIdle) || sessionIdle < 5 || sessionIdle > 480) {
    return "Sign-out timeout must be between 5 and 480 minutes.";
  }
  if (screenLock >= sessionIdle) {
    return "Screen lock must be less than the sign-out timeout.";
  }

  return null;
}
