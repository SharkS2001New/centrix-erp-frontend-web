"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import {
  platformWhatsappFormFromApi,
  platformWhatsappPayloadFromForm,
} from "@/lib/whatsapp-settings";
import { notifyError, notifySuccess } from "@/lib/notify";

function WhatsappFields({ form, setForm, loading, saving, onSave, onCopy }) {
  return (
    <section className="max-w-2xl theme-panel rounded-xl border p-6 shadow-sm">
      <h2 className="text-sm font-semibold theme-heading">Platform webhook</h2>
      <p className="mt-1 text-sm theme-subtext">
        Register this callback URL once in the Meta WhatsApp Cloud API app. Incoming messages are routed to the
        correct organization by matching the phone number ID each tenant saves in their settings.
      </p>

      {loading ? (
        <p className="mt-4 text-sm theme-subtext">Loading…</p>
      ) : (
        <div className="mt-5 space-y-4">
          <Field label="Webhook URL">
            <div className="flex gap-2">
              <input className={inputClassName()} value={form.webhook_url} readOnly />
              <PrimaryButton type="button" showIcon={false} onClick={() => void onCopy()}>
                Copy
              </PrimaryButton>
            </div>
            <p className="mt-1 text-xs theme-subtext">
              Callback path: <span className="font-mono">/api/v1/webhooks/whatsapp</span>
            </p>
          </Field>

          <Field label="Webhook verify token">
            <input
              type="password"
              className={inputClassName()}
              value={form.webhook_verify_token}
              onChange={(e) => setForm((f) => ({ ...f, webhook_verify_token: e.target.value }))}
              placeholder={
                form.webhook_verify_token_set
                  ? form.webhook_verify_token_hint || "••••••••"
                  : "Choose a secret token"
              }
              autoComplete="off"
            />
            {form.webhook_verify_token_set && !form.webhook_verify_token ? (
              <p className="mt-1 text-xs theme-subtext">
                Leave blank to keep the current token ({form.webhook_verify_token_hint}). Enter the same value in
                Meta when subscribing the webhook.
              </p>
            ) : (
              <p className="mt-1 text-xs theme-subtext">
                Used during Meta webhook verification (hub.verify_token). Shared across all organizations.
              </p>
            )}
          </Field>

          <Field label="Default Graph API version">
            <input
              className={inputClassName()}
              value={form.graph_api_version}
              onChange={(e) => setForm((f) => ({ ...f, graph_api_version: e.target.value }))}
              placeholder="v21.0"
            />
            <p className="mt-1 text-xs theme-subtext">
              Organizations can override this in their own WhatsApp settings if needed.
            </p>
          </Field>

          <PrimaryButton type="button" showIcon={false} onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : "Save platform settings"}
          </PrimaryButton>
        </div>
      )}
    </section>
  );
}

export function PlatformWhatsappScreen({ embedded = false } = {}) {
  const [form, setForm] = useState(platformWhatsappFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/whatsapp/settings");
      setForm(platformWhatsappFormFromApi(res));
    } catch {
      setForm(platformWhatsappFormFromApi({}));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await apiRequest("/admin/whatsapp/settings", {
        method: "PATCH",
        body: platformWhatsappPayloadFromForm(form),
      });
      setForm(platformWhatsappFormFromApi(res));
      notifySuccess("Platform WhatsApp settings saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to save platform WhatsApp settings.");
    } finally {
      setSaving(false);
    }
  }

  async function copyWebhookUrl() {
    if (!form.webhook_url) return;
    try {
      await navigator.clipboard.writeText(form.webhook_url);
      notifySuccess("Webhook URL copied.");
    } catch {
      notifyError("Could not copy webhook URL.");
    }
  }

  const fields = (
    <WhatsappFields
      form={form}
      setForm={setForm}
      loading={loading}
      saving={saving}
      onSave={saveSettings}
      onCopy={copyWebhookUrl}
    />
  );

  if (embedded) {
    return fields;
  }

  return (
    <CatalogPageShell
      title="WhatsApp"
      subtitle="Shared webhook URL and verify token for all tenant organizations. Each org configures its own Meta credentials under Administration → Organization settings."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "WhatsApp" }]} />
      {fields}
    </CatalogPageShell>
  );
}
