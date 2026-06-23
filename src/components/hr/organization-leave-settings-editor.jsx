"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, SearchInput, inputClassName } from "@/components/catalog/catalog-shared";

export function OrganizationLeaveSettingsEditor({ isAdmin }) {
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest("/organization-leave-settings");
      setForm({
        annual_leave_days: String(data.annual_leave_days ?? 21),
        monthly_accrual_days: String(data.monthly_accrual_days ?? 1.75),
        months_for_full_annual: String(data.months_for_full_annual ?? 12),
        sick_leave_days: String(data.sick_leave_days ?? 14),
        sick_leave_full_pay_days: String(data.sick_leave_full_pay_days ?? 7),
        sick_leave_half_pay_days: String(data.sick_leave_half_pay_days ?? 7),
        months_before_sick_eligibility: String(data.months_before_sick_eligibility ?? 2),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function save(e) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await apiRequest("/organization-leave-settings", {
        method: "PUT",
        body: {
          annual_leave_days: Number(form.annual_leave_days),
          monthly_accrual_days: Number(form.monthly_accrual_days),
          months_for_full_annual: Number(form.months_for_full_annual),
          sick_leave_days: Number(form.sick_leave_days),
          sick_leave_full_pay_days: Number(form.sick_leave_full_pay_days),
          sick_leave_half_pay_days: Number(form.sick_leave_half_pay_days),
          months_before_sick_eligibility: Number(form.months_before_sick_eligibility),
        },
      });
      setSuccess("Organization leave defaults saved. Accrual applies to all employees.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) return null;

  return (
    <section className="theme-panel rounded-xl border p-5 shadow-sm">
      <h2 className="text-[15px] font-medium text-slate-900">Organization leave defaults</h2>
      <p className="mt-1 text-sm text-slate-500">
        Kenya statutory defaults for <strong>all employees</strong>. Balances accrue from hire
        date; remaining days appear on the assignments tab.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : form ? (
        <form onSubmit={save} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Annual leave days (full year)">
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.annual_leave_days}
                onChange={(e) => setForm((p) => ({ ...p, annual_leave_days: e.target.value }))}
                required
                className={inputClassName()}
              />
            </Field>
            <Field label="Monthly accrual (before full year)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.monthly_accrual_days}
                onChange={(e) => setForm((p) => ({ ...p, monthly_accrual_days: e.target.value }))}
                required
                className={inputClassName()}
              />
            </Field>
            <Field label="Months for full annual leave">
              <input
                type="number"
                min="1"
                step="1"
                value={form.months_for_full_annual}
                onChange={(e) =>
                  setForm((p) => ({ ...p, months_for_full_annual: e.target.value }))
                }
                required
                className={inputClassName()}
              />
            </Field>
            <Field label="Sick leave days (per year)">
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.sick_leave_days}
                onChange={(e) => setForm((p) => ({ ...p, sick_leave_days: e.target.value }))}
                required
                className={inputClassName()}
              />
            </Field>
            <Field label="Sick leave — full pay days">
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.sick_leave_full_pay_days}
                onChange={(e) =>
                  setForm((p) => ({ ...p, sick_leave_full_pay_days: e.target.value }))
                }
                required
                className={inputClassName()}
              />
            </Field>
            <Field label="Months before sick leave">
              <input
                type="number"
                min="0"
                step="1"
                value={form.months_before_sick_eligibility}
                onChange={(e) =>
                  setForm((p) => ({ ...p, months_before_sick_eligibility: e.target.value }))
                }
                required
                className={inputClassName()}
              />
            </Field>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              {success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save organization defaults"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
