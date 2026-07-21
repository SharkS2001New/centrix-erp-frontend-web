"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AccountingAutoPostPanel } from "@/components/admin/accounting-auto-post-panel";
import { AccountCodesPanel } from "@/components/admin/account-codes-panel";
import { ExternalAccountingIntegrationPanel } from "@/components/admin/external-accounting-integration-panel";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { useSettingsApi, useSettingsAfterSave } from "@/contexts/settings-api-context";
import {
  accountingSettingsFromApi,
  accountingSettingsPayload,
} from "@/lib/accounting-settings";
import {
  financeFormFromApi,
  financePayloadFromForm,
} from "@/lib/finance-settings";
import { notifySuccess } from "@/lib/notify";

export function PlatformAccountingSettingsPanel({
  saving,
  setSaving,
  setError,
  setMessage,
  onAfterSave,
}) {
  const { settingsPath, organizationApiPath } = useSettingsApi();
  const afterSave = useSettingsAfterSave(onAfterSave);
  const [financeForm, setFinanceForm] = useState(financeFormFromApi({}));
  const [autoPostForm, setAutoPostForm] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiRequest(settingsPath("finance")),
      apiRequest(organizationApiPath("/accounting/settings")),
    ])
      .then(([financeRes, accountingRes]) => {
        setFinanceForm(financeFormFromApi(financeRes));
        setAutoPostForm(accountingSettingsFromApi(accountingRes));
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : "Failed to load accounting settings");
      })
      .finally(() => setLoading(false));
  }, [organizationApiPath, setError, settingsPath]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const financeRes = await apiRequest(settingsPath("finance"), {
        method: "PATCH",
        body: financePayloadFromForm(financeForm, { includeMpesa: false, includeAccounting: true }),
      });
      setFinanceForm(financeFormFromApi(financeRes));

      if (autoPostForm) {
        const accountingRes = await apiRequest(organizationApiPath("/accounting/settings"), {
          method: "PATCH",
          body: accountingSettingsPayload(autoPostForm),
        });
        setAutoPostForm(accountingSettingsFromApi(accountingRes));
      }

      if (afterSave) await afterSave();
      notifySuccess("Accounting settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save accounting settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <p className="text-sm text-slate-500">Loading accounting settings…</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="theme-heading text-lg font-medium">Accounting settings</h2>
        <p className="theme-subtext mt-1 text-sm">
          Organization-level books configuration: ledger mode, auto-posting, and default GL account codes. Managed
          here by platform administrators to prevent accidental changes in day-to-day accounting work.
        </p>

        <div className="mt-5 space-y-4">
          <Field label="Accounting source">
            <select
              className={inputClassName()}
              value={financeForm.accounting_mode ?? "native"}
              onChange={(e) =>
                setFinanceForm((f) => ({
                  ...f,
                  accounting_mode: e.target.value,
                  accounting_provider: e.target.value === "external" ? f.accounting_provider || "quickbooks" : "",
                }))
              }
            >
              <option value="native">Built-in ledger (this system)</option>
              <option value="external">External accounting system</option>
            </select>
          </Field>

          {financeForm.accounting_mode === "external" ? (
            <>
              <Field label="External provider">
                <select className={inputClassName()} value="quickbooks" disabled onChange={() => {}}>
                  <option value="quickbooks">QuickBooks Online</option>
                </select>
              </Field>
              <Field label="Sync direction">
                <select
                  className={inputClassName()}
                  value={financeForm.accounting_sync_direction ?? "export"}
                  onChange={(e) =>
                    setFinanceForm((f) => ({ ...f, accounting_sync_direction: e.target.value }))
                  }
                >
                  <option value="export">Export journals from POS → external system</option>
                  <option value="import">Import chart of accounts from external system</option>
                  <option value="bidirectional">Two-way sync (planned)</option>
                </select>
              </Field>
              {financeForm.accounting_provider === "quickbooks" ? (
                <div className="space-y-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-4">
                  <h4 className="theme-heading text-sm font-medium">QuickBooks API credentials</h4>
                  <p className="theme-subtext text-xs">
                    From your Intuit Developer app. Register the redirect URI below in the Intuit portal.
                  </p>
                  {financeForm.quickbooks_status ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium uppercase dark:bg-slate-800">
                        {financeForm.quickbooks_status.environment ?? "sandbox"}
                      </span>
                      <span
                        className={
                          financeForm.quickbooks_status.ready
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800"
                            : "rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800"
                        }
                      >
                        {financeForm.quickbooks_status.ready ? "Credentials ready" : "Incomplete"}
                      </span>
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Client ID">
                      <input
                        className={inputClassName()}
                        value={financeForm.quickbooks?.client_id ?? ""}
                        onChange={(e) =>
                          setFinanceForm((f) => ({
                            ...f,
                            quickbooks: { ...f.quickbooks, client_id: e.target.value },
                          }))
                        }
                        placeholder="Intuit app Client ID"
                      />
                    </Field>
                    <Field label="Client secret">
                      <input
                        type="password"
                        className={inputClassName()}
                        value={financeForm.quickbooks?.client_secret ?? ""}
                        onChange={(e) =>
                          setFinanceForm((f) => ({
                            ...f,
                            quickbooks: { ...f.quickbooks, client_secret: e.target.value },
                          }))
                        }
                        placeholder="Leave blank to keep existing"
                      />
                    </Field>
                    <Field label="Environment">
                      <select
                        className={inputClassName()}
                        value={financeForm.quickbooks?.environment ?? "sandbox"}
                        onChange={(e) =>
                          setFinanceForm((f) => ({
                            ...f,
                            quickbooks: { ...f.quickbooks, environment: e.target.value },
                          }))
                        }
                      >
                        <option value="sandbox">Sandbox (testing)</option>
                        <option value="production">Production (live books)</option>
                      </select>
                    </Field>
                    <Field label="Redirect URI">
                      <input
                        className={inputClassName()}
                        value={financeForm.quickbooks?.redirect_uri ?? ""}
                        onChange={(e) =>
                          setFinanceForm((f) => ({
                            ...f,
                            quickbooks: { ...f.quickbooks, redirect_uri: e.target.value },
                          }))
                        }
                        placeholder="https://your-api.example.com/api/v1/accounting/quickbooks/callback"
                      />
                    </Field>
                  </div>
                  {financeForm.quickbooks_status?.issues?.length ? (
                    <ul className="list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                      {financeForm.quickbooks_status.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {financeForm.accounting_mode === "external" && financeForm.accounting_provider ? (
                <ExternalAccountingIntegrationPanel
                  provider={financeForm.accounting_provider}
                  saving={saving}
                  setMessage={setMessage}
                  setError={setError}
                />
              ) : null}
            </>
          ) : (
            <AccountingAutoPostPanel
              compact
              hideSaveButton
              onFormChange={setAutoPostForm}
              saving={saving}
              setSaving={setSaving}
              setError={setError}
              setMessage={setMessage}
            />
          )}
        </div>
      </section>

      {financeForm.accounting_mode !== "external" ? (
        <section className="theme-panel rounded-xl border p-6 shadow-sm">
          <h3 className="text-lg font-medium text-slate-900">GL account codes</h3>
          <div className="mt-4">
            <AccountCodesPanel
              compact
              hideSaveButton
              form={autoPostForm}
              onFormChange={setAutoPostForm}
              saving={saving}
              setSaving={setSaving}
              setError={setError}
              setMessage={setMessage}
            />
          </div>
        </section>
      ) : null}

      <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void save()}>
        {saving ? "Saving…" : "Save accounting settings"}
      </PrimaryButton>
    </div>
  );
}
