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
      subtitle="Set how many tokens a completed sale uses when that order is saved online. Offline sales wait until sync. Reading stays free."
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
          <h2 className="text-sm font-semibold text-slate-900">Sale cost</h2>
          <p className="mt-1 text-sm text-slate-600">
            One completed sale uses this many tokens when the order is saved online. An offline till sale is charged when sync uploads it. Uploading the same order again does not charge it again.
          </p>
          <div className="mt-4 max-w-xs">
            <Field label="Tokens per sale">
              <input className={inputClass} type="number" min="0" max="1000" value={policy.sale_tokens ?? 1} onChange={(e) => patch({ sale_tokens: Number(e.target.value) })} />
            </Field>
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
