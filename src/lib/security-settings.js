export const SECURITY_DEFAULTS = {
  session_idle_minutes: 30,
  require_strong_passwords: false,
  password_min_length: 8,
};

export function mergeSecuritySettings(moduleSettings) {
  return { ...SECURITY_DEFAULTS, ...(moduleSettings?.security ?? {}) };
}

export function securityFormFromApi(res) {
  const security = mergeSecuritySettings({ security: res?.security ?? res });
  return {
    session_idle_minutes: String(security.session_idle_minutes ?? 30),
    require_strong_passwords: Boolean(security.require_strong_passwords),
    password_min_length: String(security.password_min_length ?? 8),
  };
}

export function securityPayloadFromForm(form) {
  return {
    session_idle_minutes: Number(form.session_idle_minutes) || 30,
    require_strong_passwords: Boolean(form.require_strong_passwords),
    password_min_length: Number(form.password_min_length) || 8,
  };
}
