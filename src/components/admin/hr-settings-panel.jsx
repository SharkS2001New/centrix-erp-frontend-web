"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { hrPayrollFormFromApi, hrPayrollPayloadFromForm } from "@/lib/hr-settings";
import { OrganizationLeaveSettingsEditor } from "@/components/hr/organization-leave-settings-editor";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { useSettingsApi } from "@/contexts/settings-api-context";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
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

export function HrSettingsPanel({ saving, setSaving, setError, setMessage }) {
  const { settingsPath } = useSettingsApi();
  const [form, setForm] = useState(hrPayrollFormFromApi({}));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiRequest(settingsPath("hr"))
      .then((res) => setForm(hrPayrollFormFromApi(res)))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load HR settings"))
      .finally(() => setLoading(false));
  }, [setError, settingsPath]);

  async function handleSavePayroll(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest(settingsPath("hr"), {
        method: "PATCH",
        body: hrPayrollPayloadFromForm(form),
      });
      setForm(hrPayrollFormFromApi(res));
      setMessage("HR & payroll settings saved.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save HR settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <OrganizationLeaveSettingsEditor isAdmin />

      <form onSubmit={handleSavePayroll}>
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Payroll schedule</h2>
          <p className="mt-1 text-sm text-slate-500">
            When payroll runs are allowed and how long a run can be deleted after creation.
          </p>
          {loading ? (
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          ) : (
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Pay frequency">
                <select
                  className={inputClassName()}
                  value={form.pay_frequency}
                  onChange={(e) => setForm((f) => ({ ...f, pay_frequency: e.target.value }))}
                >
                  <option value="monthly">Monthly (Kenya standard)</option>
                </select>
              </Field>
              <Field label="Grace days after month end">
                <input
                  type="number"
                  min="1"
                  max="31"
                  className={inputClassName()}
                  value={form.grace_days_after_month_end}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, grace_days_after_month_end: e.target.value }))
                  }
                />
                <p className="mt-1 text-xs text-slate-500">
                  Days into the next month when last month&apos;s payroll may still run.
                </p>
              </Field>
              <Field label="Delete lock (minutes)">
                <input
                  type="number"
                  min="1"
                  max="1440"
                  className={inputClassName()}
                  value={form.payroll_run_delete_lock_minutes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, payroll_run_delete_lock_minutes: e.target.value }))
                  }
                />
                <p className="mt-1 text-xs text-slate-500">
                  Payroll runs can only be deleted within this window after creation.
                </p>
              </Field>
            </div>
          )}

          <h3 className="mt-8 text-sm font-medium text-slate-900">Processing defaults</h3>
          <p className="mt-1 text-sm text-slate-500">
            Applied when a payroll run is processed unless overridden on the run screen.
          </p>
          {!loading ? (
            <div className="mt-4 space-y-3">
              <Toggle
                label="Auto-calculate statutory deductions"
                description="Compute PAYE, NSSF, SHIF, and housing levy from gross pay using Kenya rates."
                checked={form.auto_calculate_statutory}
                onChange={(v) => setForm((f) => ({ ...f, auto_calculate_statutory: v }))}
              />
              <Toggle
                label="Close HR cycle on process"
                description="Mark attendance, leave, overtime, and cash advances as settled for the pay period."
                checked={form.close_cycle_on_process}
                onChange={(v) => setForm((f) => ({ ...f, close_cycle_on_process: v }))}
              />
              <Toggle
                label="Include overtime in payroll"
                checked={form.include_overtime_in_payroll}
                onChange={(v) => setForm((f) => ({ ...f, include_overtime_in_payroll: v }))}
              />
              <Toggle
                label="Include other deductions"
                description="Organization deductions and employee-specific deductions on each line."
                checked={form.include_other_deductions_in_payroll}
                onChange={(v) => setForm((f) => ({ ...f, include_other_deductions_in_payroll: v }))}
              />
              <Toggle
                label="Require payroll approval"
                description="When enabled, processed runs should be approved before marking as paid (future workflow)."
                checked={form.require_payroll_approval}
                onChange={(v) => setForm((f) => ({ ...f, require_payroll_approval: v }))}
              />
            </div>
          ) : null}

          <h3 className="mt-8 text-sm font-medium text-slate-900">Attendance &amp; employees</h3>
          {!loading ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Standard work hours per day">
                  <input
                    type="number"
                    min="1"
                    max="24"
                    step="0.5"
                    className={inputClassName()}
                    value={form.standard_work_hours_per_day}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, standard_work_hours_per_day: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Overtime rate multiplier">
                  <input
                    type="number"
                    min="1"
                    max="5"
                    step="0.1"
                    className={inputClassName()}
                    value={form.overtime_rate_multiplier}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, overtime_rate_multiplier: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Default probation (months)">
                  <input
                    type="number"
                    min="0"
                    max="24"
                    className={inputClassName()}
                    value={form.default_probation_months}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, default_probation_months: e.target.value }))
                    }
                  />
                </Field>
              </div>
              <Toggle
                label="Require attendance before payroll"
                description="Block payroll processing for employees with missing attendance in the pay period."
                checked={form.require_attendance_for_payroll}
                onChange={(v) => setForm((f) => ({ ...f, require_attendance_for_payroll: v }))}
              />
              <Toggle
                label="Enable employee cash advances"
                description="Allow recording cash advances against employees in HR."
                checked={form.enable_cash_advance_deductions}
                onChange={(v) => setForm((f) => ({ ...f, enable_cash_advance_deductions: v }))}
              />
              <Toggle
                label="Deduct cash advances on payroll"
                description="Include outstanding cash advance repayments when processing payroll."
                checked={form.deduct_cash_advances_on_payroll}
                disabled={!form.enable_cash_advance_deductions}
                onChange={(v) => setForm((f) => ({ ...f, deduct_cash_advances_on_payroll: v }))}
              />
            </div>
          ) : null}

          <div className="mt-6">
            <PrimaryButton type="submit" disabled={loading || saving} showIcon={false}>
              {saving ? "Saving…" : "Save payroll settings"}
            </PrimaryButton>
          </div>
        </section>
      </form>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
        <p className="font-medium text-slate-800">Kenya statutory rates</p>
        <p className="mt-1">
          PAYE bands, NSSF, SHIF, and housing levy rates are system-configured in{" "}
          <code className="text-xs">config/kenya_payroll.php</code> and shown on the HR payroll
          screen. Update those files when legislation changes.
        </p>
      </section>
    </div>
  );
}
