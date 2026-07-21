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
import { useSettingsApi } from "@/contexts/settings-api-context";

export function AccountCodesPanel({
  saving,
  setSaving,
  setError,
  setMessage,
  form: controlledForm,
  onFormChange,
  hideSaveButton = false,
  compact = false,
}) {
  const { organizationApiPath } = useSettingsApi();
  const isControlled = controlledForm !== undefined;
  const [internalForm, setInternalForm] = useState(accountingSettingsFromApi({}));
  const [loading, setLoading] = useState(!isControlled);

  const form = isControlled ? controlledForm : internalForm;

  const updateForm = useCallback(
    (updater) => {
      const apply = (current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        onFormChange?.(next);
        return next;
      };
      if (controlledForm) {
        onFormChange?.(apply(controlledForm));
      } else {
        setInternalForm(apply);
      }
    },
    [controlledForm, onFormChange],
  );

  const load = useCallback(async () => {
    if (isControlled) return;
    setLoading(true);
    try {
      const res = await apiRequest(organizationApiPath("/accounting/settings"));
      const next = accountingSettingsFromApi(res);
      setInternalForm(next);
      onFormChange?.(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load GL account codes");
    } finally {
      setLoading(false);
    }
  }, [isControlled, onFormChange, organizationApiPath, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(organizationApiPath("/accounting/settings"), {
        method: "PATCH",
        body: accountingSettingsPayload(form),
      });
      const next = accountingSettingsFromApi(res);
      updateForm(next);
      setMessage("GL account codes saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save account codes");
    } finally {
      setSaving(false);
    }
  }

  if (loading || (isControlled && !form)) {
    return <p className="text-sm text-slate-500">Loading account codes…</p>;
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {!compact ? (
        <p className="text-sm text-slate-600">
          Map operational events to chart of account codes used by auto-journal posting.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACCOUNT_CODE_FIELDS.map(({ key, label }) => (
          <Field key={key} label={label}>
            <input
              className={inputClassName()}
              value={form.account_codes?.[key] ?? ""}
              onChange={(e) =>
                updateForm((f) => ({
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
                  updateForm((f) => ({
                    ...f,
                    payment_method_accounts: { ...f.payment_method_accounts, [key]: e.target.value },
                  }))
                }
              />
            </Field>
          ))}
        </div>
      </div>
      {!hideSaveButton ? (
        <PrimaryButton type="button" onClick={save} disabled={saving} showIcon={false}>
          {saving ? "Saving…" : "Save account codes"}
        </PrimaryButton>
      ) : null}
    </div>
  );
}
