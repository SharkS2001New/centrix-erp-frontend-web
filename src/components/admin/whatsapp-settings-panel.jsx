"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { whatsappFormFromApi, whatsappPayloadFromForm } from "@/lib/whatsapp-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { useSettingsApi } from "@/contexts/settings-api-context";
import { fetchBranchesCached, fetchUsersCached } from "@/lib/reference-data-cache";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  WhatsappMetaSetupGuideModal,
  WhatsappMetaSetupGuideTrigger,
} from "@/components/admin/whatsapp-meta-setup-guide-modal";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

export function WhatsappSettingsPanel({ saving, setSaving, setError, setMessage, onAfterSave }) {
  const { refreshCapabilities } = useAuth();
  const { settingsPath, organizationApiPath } = useSettingsApi();
  const afterSave = onAfterSave ?? (() => refreshCapabilities({ force: true }));
  const [form, setForm] = useState(whatsappFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const usersPath = organizationApiPath("/users");
    const branchesPath = organizationApiPath("/branches");
    Promise.all([
      apiRequest(settingsPath("whatsapp")),
      fetchUsersCached(undefined, { path: usersPath }).catch(() => []),
      branchesPath === "/branches"
        ? fetchBranchesCached().catch(() => [])
        : apiRequest(branchesPath, { searchParams: { per_page: 200 } })
            .then((r) => r.data ?? [])
            .catch(() => []),
    ])
      .then(([res, usersData, branchesData]) => {
        setForm(whatsappFormFromApi(res));
        setUsers(Array.isArray(usersData) ? usersData : []);
        setBranches(Array.isArray(branchesData) ? branchesData : []);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load WhatsApp settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath, organizationApiPath]);

  async function copyWebhookUrl() {
    if (!form.webhook_url) return;
    try {
      await navigator.clipboard.writeText(form.webhook_url);
      notifySuccess("Webhook URL copied.");
    } catch {
      notifyError("Could not copy webhook URL.");
    }
  }

  async function saveWhatsappSettings() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(settingsPath("whatsapp"), {
        method: "PATCH",
        body: whatsappPayloadFromForm(form),
      });
      setForm(whatsappFormFromApi(res));
      if (afterSave) await afterSave();
      setMessage("WhatsApp settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save WhatsApp settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="theme-panel rounded-xl border p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="theme-heading text-lg font-medium">WhatsApp ordering</h2>
          <p className="theme-subtext mt-1 text-sm">
            Each organization connects its own WhatsApp Business account from Meta. You enter your own phone number
            ID and access token below — credentials are stored per organization and never shared with other tenants.
            The webhook URL is the same for everyone; copy it into your Meta Developer app so inbound messages reach
            Centrix (your phone number ID tells the platform which organization owns each message).
          </p>
        </div>
        {!loading ? (
          <WhatsappMetaSetupGuideTrigger onClick={() => setGuideOpen(true)} className="shrink-0" />
        ) : null}
      </div>

      <WhatsappMetaSetupGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        webhookUrl={form.webhook_url}
      />

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="mt-6 space-y-4">
          {!form.platform_enabled ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              WhatsApp ordering is not enabled for this organization. Contact your platform administrator to turn
              it on.
            </div>
          ) : (
            <>
              <Field label="Webhook URL (read-only)">
                <div className="flex gap-2">
                  <input className={inputClassName()} value={form.webhook_url} readOnly />
                  <PrimaryButton type="button" showIcon={false} onClick={() => void copyWebhookUrl()} disabled={!form.webhook_url}>
                    Copy
                  </PrimaryButton>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Paste this into <strong>Meta Developer → your app → WhatsApp → Configuration → Webhook</strong>.
                  Every organization uses this same URL. The verify token is set by the platform administrator.
                </p>
              </Field>

              <Toggle
                checked={form.enabled}
                onChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
                label="Enable WhatsApp ordering"
                description="When on, inbound messages to your configured phone number ID are handled by the order bot."
              />

              {form.enabled ? (
                <>
                  <Field label="Bot / agent name">
                    <input
                      className={inputClassName()}
                      value={form.agent_name}
                      onChange={(e) => setForm((f) => ({ ...f, agent_name: e.target.value }))}
                      placeholder="e.g. Omega"
                      maxLength={80}
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Shown when customers say Hi or Hello: “My name is … I am a powered WhatsApp Agent from
                      CentrixERP.” Falls back to your organization name if left blank.
                    </p>
                  </Field>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Your Meta credentials
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      From <strong>Meta Developer → your WhatsApp app</strong>: copy your Phone Number ID and a
                      permanent or system-user access token. These belong to your organization only.
                      <button
                        type="button"
                        onClick={() => setGuideOpen(true)}
                        className="ml-1 font-medium text-[#185FA5] hover:underline"
                      >
                        Step-by-step guide
                      </button>
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Display phone (optional)">
                      <input
                        className={inputClassName()}
                        value={form.display_phone}
                        onChange={(e) => setForm((f) => ({ ...f, display_phone: e.target.value }))}
                        placeholder="+2547…"
                      />
                    </Field>

                    <Field label="Phone number ID *">
                      <input
                        className={inputClassName()}
                        value={form.phone_number_id}
                        onChange={(e) => setForm((f) => ({ ...f, phone_number_id: e.target.value }))}
                        placeholder="From Meta developer console"
                      />
                    </Field>

                    <Field label="WABA ID (optional)">
                      <input
                        className={inputClassName()}
                        value={form.waba_id}
                        onChange={(e) => setForm((f) => ({ ...f, waba_id: e.target.value }))}
                      />
                    </Field>

                    <Field label="Graph API version">
                      <input
                        className={inputClassName()}
                        value={form.graph_api_version}
                        onChange={(e) => setForm((f) => ({ ...f, graph_api_version: e.target.value }))}
                        placeholder="v21.0"
                      />
                    </Field>

                    <Field label="Order service account *">
                      <select
                        className={inputClassName()}
                        value={form.bot_user_id}
                        onChange={(e) => setForm((f) => ({ ...f, bot_user_id: e.target.value }))}
                      >
                        <option value="">Select ERP user</option>
                        {users.map((user) => (
                          <option key={user.id} value={String(user.id)}>
                            {user.full_name} ({user.username})
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">
                        A normal Centrix user in your organization — not a separate Meta bot. WhatsApp orders are
                        created in the ERP as if this user placed them (audit trail, permissions, branch). Create
                        a dedicated account such as <em>whatsapp_orders</em> with permission to create sales orders.
                      </p>
                    </Field>

                    <Field label="Default branch (optional)">
                      <select
                        className={inputClassName()}
                        value={form.branch_id}
                        onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}
                      >
                        <option value="">Bot user&apos;s branch</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={String(branch.id)}>
                            {branch.branch_name}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <div className="sm:col-span-2">
                      <Field label="Meta access token *">
                        <input
                          type="password"
                          className={inputClassName()}
                          value={form.access_token}
                          onChange={(e) => setForm((f) => ({ ...f, access_token: e.target.value }))}
                          placeholder={form.access_token_set ? form.access_token_hint || "••••••••" : "EAA…"}
                          autoComplete="off"
                        />
                        {form.access_token_set && !form.access_token ? (
                          <p className="mt-1 text-xs text-slate-500">
                            Leave blank to keep the current token ({form.access_token_hint}).
                          </p>
                        ) : null}
                      </Field>
                    </div>
                  </div>

                  <div
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      form.configured
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-amber-200 bg-amber-50 text-amber-900"
                    }`}
                  >
                    {form.configured
                      ? "WhatsApp ordering is configured and ready to receive messages."
                      : "Complete phone number ID, access token, and order service account, then save to activate."}
                  </div>
                </>
              ) : null}

              <PrimaryButton type="button" onClick={saveWhatsappSettings} disabled={saving}>
                {saving ? "Saving…" : "Save WhatsApp settings"}
              </PrimaryButton>
            </>
          )}
        </div>
      )}
    </section>
  );
}
