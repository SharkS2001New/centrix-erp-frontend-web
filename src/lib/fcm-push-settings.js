export function fcmPushFormFromApi(res) {
  const effective = res?.effective ?? {};
  const settings = res?.settings ?? {};

  return {
    enabled: settings.enabled ?? effective.enabled ?? false,
    fcm_project_id: settings.fcm_project_id || effective.fcm_project_id || "",
    ignore_local_tokens: settings.ignore_local_tokens ?? effective.ignore_local_tokens ?? true,
    credentials_json: "",
    clear_credentials: false,
    credentials_set: Boolean(res?.credentials_set),
    credentials_client_email: res?.credentials_client_email ?? "",
    credentials_source: res?.credentials_source ?? null,
    env_fallback_active: Boolean(res?.env_fallback_active),
    diagnostics: res?.diagnostics ?? {},
    apps: res?.apps ?? {},
    test_user_id: "",
    test_app: "manager",
  };
}

export function fcmPushPayloadFromForm(form) {
  const payload = {
    enabled: form.enabled,
    fcm_project_id: form.fcm_project_id || "",
    ignore_local_tokens: form.ignore_local_tokens,
  };

  if (form.clear_credentials) {
    payload.clear_credentials = true;
  } else if (form.credentials_json && !form.credentials_json.startsWith("••••")) {
    payload.credentials_json = form.credentials_json;
  }

  return payload;
}
