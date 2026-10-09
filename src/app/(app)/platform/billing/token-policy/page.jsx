"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]";

export default function TokenPolicyPage() {
  const [policy, setPolicy] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest("/admin/billing-policy");
      setPolicy(res.data ?? null);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load the token policy.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patch(partial) {
    setPolicy((current) => ({ ...current, ...partial }));
  }

  function patchAction(index, partial) {
    setPolicy((current) => {
      const actions = [...(current?.actions ?? [])];
      actions[index] = { ...actions[index], ...partial };
      return { ...current, actions };
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await apiRequest("/admin/billing-policy", { method: "PUT", body: policy });
      setPolicy(res.data ?? policy);
      notifySuccess(res.message || "Billing policy saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save the token policy.");
    } finally {
      setSaving(false);
    }
  }

  if (!policy) {
    return (
      <CatalogPageShell title="Token & usage policies" subtitle="Loading the published token rules.">
        <p className="text-sm text-slate-500">Loading policy…</p>
      </CatalogPageShell>
    );
  }

  const offline = policy.offline ?? {};

  return (
    <CatalogPageShell
      title="Token & usage policies"
      subtitle="These defaults apply until you save new values. Saving them does not start charging a token per action."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing & plans", href: "/platform/billing" },
          { label: "Token & usage policies" },
        ]}
      />

      <div className="space-y-6">
        <section className="theme-panel grid gap-4 rounded-xl border p-5 shadow-sm md:grid-cols-3">
          <Field label="Value of 1 token (KES)">
            <input className={inputClass} type="number" min="1" value={policy.token_value_kes} onChange={(e) => patch({ token_value_kes: Number(e.target.value) })} />
          </Field>
          <Field label="Tokens in a pack">
            <input className={inputClass} type="number" min="1" value={policy.token_pack_tokens} onChange={(e) => patch({ token_pack_tokens: Number(e.target.value) })} />
          </Field>
          <Field label="Pack price (KES)">
            <input className={inputClass} type="number" min="0" value={policy.token_pack_price_kes} onChange={(e) => patch({ token_pack_price_kes: Number(e.target.value) })} />
          </Field>
        </section>

        <section className="theme-panel grid gap-4 rounded-xl border p-5 shadow-sm md:grid-cols-2">
          <Field label="Token expiry">
            <select className={inputClass} value={policy.expiry_policy} onChange={(e) => patch({ expiry_policy: e.target.value })}>
              <option value="admin">Until an administrator changes it</option>
              <option value="never">Tokens do not expire</option>
              <option value="90_days">90 days after purchase</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First low-balance %">
              <input className={inputClass} type="number" min="0" max="100" value={policy.low_balance_first_percent} onChange={(e) => patch({ low_balance_first_percent: Number(e.target.value) })} />
            </Field>
            <Field label="Second low-balance %">
              <input className={inputClass} type="number" min="0" max="100" value={policy.low_balance_second_percent} onChange={(e) => patch({ low_balance_second_percent: Number(e.target.value) })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={Boolean(policy.grace_enabled)} onChange={(e) => patch({ grace_enabled: e.target.checked })} />
            Allow a small grace balance
          </label>
          <Field label="Grace tokens (max 100)">
            <input className={inputClass} type="number" min="0" max="100" value={policy.grace_max_tokens} onChange={(e) => patch({ grace_max_tokens: Number(e.target.value) })} />
          </Field>
        </section>

        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Action costs</h2>
            <button
              type="button"
              className="text-sm font-medium text-[#185FA5]"
              onClick={() => patch({ actions: [...(policy.actions ?? []), { key: "", label: "", tokens: 0, notes: "" }] })}
            >
              Add action
            </button>
          </div>
          <div className="space-y-3">
            {(policy.actions ?? []).map((action, index) => (
              <div key={`${action.key}-${index}`} className="grid gap-2 md:grid-cols-[1.4fr_0.4fr_1fr_auto]">
                <input className={inputClass} placeholder="Action" value={action.label} onChange={(e) => patchAction(index, { label: e.target.value })} />
                <input className={inputClass} type="number" min="0" value={action.tokens} onChange={(e) => patchAction(index, { tokens: Number(e.target.value) })} />
                <input className={inputClass} placeholder="Notes" value={action.notes ?? ""} onChange={(e) => patchAction(index, { notes: e.target.value })} />
                <button
                  type="button"
                  className="text-sm text-red-700"
                  onClick={() => patch({ actions: policy.actions.filter((_, row) => row !== index) })}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="theme-panel grid gap-4 rounded-xl border p-5 shadow-sm md:grid-cols-4">
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-4">
            <input
              type="checkbox"
              checked={Boolean(offline.enabled)}
              onChange={(e) => patch({ offline: { ...offline, enabled: e.target.checked } })}
            />
            Offline allowance (saved only — signed grants are not issued yet)
          </label>
          <Field label="Max allowance">
            <input className={inputClass} type="number" min="0" value={offline.max_allowance ?? 0} onChange={(e) => patch({ offline: { ...offline, max_allowance: Number(e.target.value) } })} />
          </Field>
          <Field label="Grant hours">
            <input className={inputClass} type="number" min="1" value={offline.grant_hours ?? 24} onChange={(e) => patch({ offline: { ...offline, grant_hours: Number(e.target.value) } })} />
          </Field>
          <Field label="Sync within hours">
            <input className={inputClass} type="number" min="1" value={offline.sync_hours ?? 72} onChange={(e) => patch({ offline: { ...offline, sync_hours: Number(e.target.value) } })} />
          </Field>
        </section>

        <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save policy"}
        </PrimaryButton>
      </div>
    </CatalogPageShell>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}
