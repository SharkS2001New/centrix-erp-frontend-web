"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  ACCOUNT_CODE_FIELDS,
  PAYMENT_METHOD_ACCOUNT_FIELDS,
  accountingSettingsFromApi,
  accountingSettingsPayload,
} from "@/lib/accounting-settings";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";

export function AccountCodesPanel({ saving, setSaving, setError, setMessage }) {
  const [form, setForm] = useState(accountingSettingsFromApi({}));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/accounting/settings");
      setForm(accountingSettingsFromApi(res));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load GL account codes");
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest("/accounting/settings", {
        method: "PATCH",
        body: accountingSettingsPayload(form),
      });
      setForm(accountingSettingsFromApi(res));
      setMessage("GL account codes saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save account codes");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-slate-500">Loading account codes…</p>;

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">
        Map operational events to chart of account codes used by auto-journal posting.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACCOUNT_CODE_FIELDS.map(({ key, label }) => (
          <Field key={key} label={label}>
            <input
              className={inputClassName()}
              value={form.account_codes?.[key] ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  account_codes: { ...f.account_codes, [key]: e.target.value },
                }))
              }
            />
          </Field>
        ))}
      </div>
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Payment method accounts</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PAYMENT_METHOD_ACCOUNT_FIELDS.map(({ key, label }) => (
            <Field key={key} label={label}>
              <input
                className={inputClassName()}
                value={form.payment_method_accounts?.[key] ?? ""}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    payment_method_accounts: { ...f.payment_method_accounts, [key]: e.target.value },
                  }))
                }
              />
            </Field>
          ))}
        </div>
      </div>
      <PrimaryButton type="button" onClick={save} disabled={saving} showIcon={false}>
        {saving ? "Saving…" : "Save account codes"}
      </PrimaryButton>
    </div>
  );
}
