"use client";

import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { AccountingAutoPostPanel } from "@/components/admin/accounting-auto-post-panel";
import { AccountCodesPanel } from "@/components/admin/account-codes-panel";
import { toastErrorSetter, toastMessageSetter } from "@/lib/notify";
import { useState } from "react";

export default function AccountingSettingsPage() {
  const [saving, setSaving] = useState(false);
  const setError = toastErrorSetter;
  const setMessage = toastMessageSetter;

  return (
    <CatalogPageShell title="Accounting Settings" subtitle="Auto-posting and GL foundation">
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <AccountingAutoPostPanel
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          setMessage={setMessage}
        />
      </section>

      <section className="mt-6 theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">GL account codes</h2>
        <div className="mt-4">
          <AccountCodesPanel saving={saving} setSaving={setSaving} setError={setError} setMessage={setMessage} />
        </div>
      </section>
    </CatalogPageShell>
  );
}
