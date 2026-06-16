"use client";

import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { AccountingAutoPostPanel } from "@/components/admin/accounting-auto-post-panel";
import { AccountCodesPanel } from "@/components/admin/account-codes-panel";
import { useState } from "react";

export default function AccountingSettingsPage() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  return (
    <CatalogPageShell title="Accounting Settings" subtitle="Auto-posting and GL foundation">
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <AccountingAutoPostPanel
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          setMessage={setMessage}
        />
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">GL account codes</h2>
        <div className="mt-4">
          <AccountCodesPanel saving={saving} setSaving={setSaving} setError={setError} setMessage={setMessage} />
        </div>
      </section>
    </CatalogPageShell>
  );
}
