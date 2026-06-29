export const EMPTY_LEGACY_ARCHIVE_FORM = {
  enabled: false,
  database: "",
  host: "",
  port: "",
  username: "",
  password: "",
  label: "LightStores archive",
  cutover_date: "",
  legacy_company_code: "",
  password_configured: false,
};

/** @param {object} res GET /settings/legacy-archive */
export function legacyArchiveFormFromApi(res) {
  const la = res?.legacy_archive ?? {};
  return {
    enabled: Boolean(la.enabled),
    database: la.database ?? "",
    host: la.host ?? "",
    port: la.port != null && la.port !== "" ? String(la.port) : "",
    username: la.username ?? "",
    password: "",
    label: la.label ?? "LightStores archive",
    cutover_date: la.cutover_date ?? "",
    legacy_company_code: la.legacy_company_code ?? "",
    password_configured: Boolean(la.password_configured),
  };
}

/** @param {typeof EMPTY_LEGACY_ARCHIVE_FORM} form */
export function legacyArchivePayloadFromForm(form) {
  const body = {
    enabled: form.enabled,
    database: form.database.trim() || null,
    label: form.label.trim() || null,
    cutover_date: form.cutover_date || null,
    legacy_company_code: form.legacy_company_code.trim() || null,
    host: form.host.trim() || null,
    port: form.port.trim() ? Number(form.port) : null,
    username: form.username.trim() || null,
  };

  if (form.password.trim()) {
    body.password = form.password;
  }

  return body;
}

/** Whether platform super admin enabled legacy archive for this tenant. */
export function isLegacyArchiveEnabled(capabilities) {
  return Boolean(capabilities?.legacy_archive_enabled);
}
