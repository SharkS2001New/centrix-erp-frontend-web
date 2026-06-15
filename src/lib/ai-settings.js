/** @param {object} capabilities erp/capabilities payload */
export function isAiAssistantAvailable(capabilities) {
  return Boolean(capabilities?.ai_assistant?.available);
}

/** @param {object} capabilities */
export function isAiAssistantEnabledForOrg(capabilities) {
  return Boolean(capabilities?.ai_assistant?.enabled);
}

export function aiFormFromApi(res) {
  const settings = res?.settings ?? res?.ai ?? {};
  return {
    enabled: Boolean(settings.enabled),
    provider: settings.provider ?? "openai",
    model: settings.model ?? "",
    api_key: "",
    base_url: settings.base_url ?? "",
    api_key_set: Boolean(settings.api_key_set),
    api_key_hint: settings.api_key_hint ?? "",
    available: Boolean(res?.available),
  };
}

export function aiPayloadFromForm(form) {
  const payload = {
    enabled: form.enabled,
    provider: form.provider,
    model: form.model || null,
    base_url: form.base_url || null,
  };
  if (form.api_key && !form.api_key.startsWith("••••")) {
    payload.api_key = form.api_key;
  }
  return payload;
}
