"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import {
  AUTO_POST_TOGGLES,
  accountingSettingsFromApi,
  accountingSettingsPayload,
} from "@/lib/accounting-settings";
import { isProductionApp } from "@/lib/app-environment";
import { PrimaryButton } from "@/components/catalog/catalog-shared";

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="theme-heading block text-sm font-medium">{label}</span>
        {description ? <span className="theme-subtext mt-0.5 block text-xs">{description}</span> : null}
      </span>
    </label>
  );
}

export function AccountingAutoPostPanel({
  saving,
  setSaving,
  setError,
  setMessage,
  compact = false,
  hideSaveButton = false,
  onFormChange,
}) {
  const [form, setForm] = useState(accountingSettingsFromApi({}));
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(true);

  const updateForm = useCallback(
    (updater) => {
      setForm((current) => {
        const next = typeof updater === "function" ? updater(current) : updater;
        onFormChange?.(next);
        return next;
      });
    },
    [onFormChange],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/accounting/settings");
      const next = accountingSettingsFromApi(res);
      setForm(next);
      onFormChange?.(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setCanManage(false);
      } else {
        setError(e instanceof ApiError ? e.message : "Failed to load accounting settings");
      }
    } finally {
      setLoading(false);
    }
  }, [setError, onFormChange]);

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
      onFormChange?.(accountingSettingsFromApi(res));
      setMessage("Accounting auto-post settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save accounting settings");
    } finally {
      setSaving(false);
    }
  }

  async function seedChart() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest("/accounting/seed-chart-of-accounts", { method: "POST" });
      setForm((f) => {
        const next = { ...f, chart_seeded: true };
        onFormChange?.(next);
        return next;
      });
      setMessage("Standard chart of accounts seeded.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to seed chart of accounts");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="theme-subtext text-sm">Loading accounting settings…</p>;
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact ? (
        <p className="theme-subtext text-sm">
          Control which operational events create posted journal entries in the built-in ledger.
        </p>
      ) : null}

      <div className="space-y-3">
        {AUTO_POST_TOGGLES.map((toggle) => (
          <Toggle
            key={toggle.key}
            label={toggle.label}
            description={toggle.description}
            checked={Boolean(form[toggle.key])}
            onChange={(v) => updateForm((f) => ({ ...f, [toggle.key]: v }))}
          />
        ))}
        <Toggle
          label="Require approval to post manual journal entries"
          description="Users without accounting manager access must submit drafts for approval before posting."
          checked={Boolean(form.journal_entry_approval_enabled)}
          onChange={(v) => updateForm((f) => ({ ...f, journal_entry_approval_enabled: v }))}
        />
      </div>

      {!form.chart_seeded && !isProductionApp() ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Standard GL accounts are not fully seeded.{" "}
          {canManage ? (
            <button type="button" className="font-medium underline" onClick={() => void seedChart()}>
              Seed standard chart of accounts
            </button>
          ) : (
            "Ask an administrator to seed the chart of accounts."
          )}
        </p>
      ) : !form.chart_seeded && isProductionApp() ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Standard GL accounts are not fully configured. Contact your administrator or support to
          complete chart setup.
        </p>
      ) : null}

      {canManage && !hideSaveButton ? (
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save auto-post settings"}
          </PrimaryButton>
          {!compact ? (
            <>
              <Link href="/accounting/account-mappings" className="text-sm font-medium text-[#185FA5] hover:underline">
                Account mappings
              </Link>
              <Link href="/accounting/export-queue" className="text-sm font-medium text-[#185FA5] hover:underline">
                Export queue
              </Link>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
