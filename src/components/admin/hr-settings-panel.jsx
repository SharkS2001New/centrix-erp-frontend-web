"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { hrPayrollFormFromApi, hrPayrollPayloadFromForm } from "@/lib/hr-settings";
import { OrganizationLeaveSettingsEditor } from "@/components/hr/organization-leave-settings-editor";
import { AttendanceClockDevicesSettings } from "@/components/hr/attendance-clock-devices-settings";
import { AttendanceMobileDevicesPanel } from "@/components/hr/attendance-mobile-devices-panel";
import { CompanyPremisesPanel } from "@/components/hr/company-premises-panel";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { SettingsSubTabBar, useSettingsSubTab } from "@/components/admin/settings-sub-tabs";
import { useSettingsApi } from "@/contexts/settings-api-context";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 ${
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
        <span className="theme-heading block text-sm font-medium">{label}</span>
        {description ? <span className="theme-subtext mt-0.5 block text-xs">{description}</span> : null}
      </span>
    </label>
  );
}

export function HrSettingsPanel({ saving, setSaving, setError, setMessage }) {
  const { settingsPath } = useSettingsApi();
  const [form, setForm] = useState(hrPayrollFormFromApi({}));
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("leave");

  const visibleTabs = useMemo(
    () => [
      { id: "leave", label: "Time off" },
      { id: "payroll", label: "Payroll" },
      { id: "attendance", label: "Attendance" },
      { id: "devices", label: "Clock-in devices" },
    ],
    [],
  );

  useSettingsSubTab(activeTab, setActiveTab, visibleTabs);

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
      <section className="theme-panel rounded-xl border p-6 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">HR &amp; payroll settings</h2>
        <p className="mt-1 text-sm text-slate-500">
          Leave policies, payroll schedule, attendance rules, and clock-in devices for your organization.
        </p>

        <div className="mt-5 space-y-5">
          <SettingsSubTabBar
            tabs={visibleTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            ariaLabel="HR settings"
          />

          {activeTab === "leave" ? <OrganizationLeaveSettingsEditor isAdmin /> : null}

          {activeTab === "payroll" || activeTab === "attendance" ? (
            <form onSubmit={handleSavePayroll} className="space-y-6">
              {activeTab === "payroll" ? (
                loading ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    <div>
                      <h3 className="text-sm font-medium text-slate-900">Processing defaults</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Applied when a payroll run is processed unless overridden on the run screen.
                      </p>
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
                          onChange={(v) =>
                            setForm((f) => ({ ...f, include_other_deductions_in_payroll: v }))
                          }
                        />
                      </div>
                    </div>
                  </>
                )
              ) : null}

              {activeTab === "attendance" ? (
                loading ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : (
                  <>
                    <div>
                      <h3 className="text-sm font-medium text-slate-900">How staff clock in</h3>
                      <div className="mt-4 space-y-4">
                        <Field label="Attendance method">
                          <select
                            className={inputClassName()}
                            value={form.attendance_capture_mode}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, attendance_capture_mode: e.target.value }))
                            }
                          >
                            <option value="clock_device">Clock device (fingerprint terminals)</option>
                            <option value="company_mobile">Company mobile (shared phone)</option>
                          </select>
                          <p className="mt-1 text-xs text-slate-500">
                            Choose one method for your organization. Configure devices on the Clock-in
                            devices tab after saving.
                          </p>
                        </Field>
                        {form.attendance_capture_mode === "company_mobile" ? (
                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Phone verification">
                              <select
                                className={inputClassName()}
                                value={form.company_mobile_verification_method}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    company_mobile_verification_method: e.target.value,
                                  }))
                                }
                              >
                                <option value="face_or_fingerprint">Face scan or fingerprint</option>
                                <option value="face">Face scan only</option>
                                <option value="fingerprint">Fingerprint only</option>
                              </select>
                            </Field>
                            <Field label="Geofence radius (metres)">
                              <input
                                type="number"
                                min="1"
                                max="500"
                                className={inputClassName()}
                                value={form.company_premises_radius_metres}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    company_premises_radius_metres: e.target.value,
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Face match threshold">
                              <input
                                type="number"
                                min="0.5"
                                max="0.99"
                                step="0.01"
                                className={inputClassName()}
                                value={form.company_face_match_threshold}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    company_face_match_threshold: e.target.value,
                                  }))
                                }
                                disabled={form.company_mobile_verification_method === "fingerprint"}
                              />
                            </Field>
                            <Field label="Fingerprint match threshold">
                              <input
                                type="number"
                                min="0.5"
                                max="0.99"
                                step="0.01"
                                className={inputClassName()}
                                value={form.company_fingerprint_match_threshold}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    company_fingerprint_match_threshold: e.target.value,
                                  }))
                                }
                                disabled={form.company_mobile_verification_method === "face"}
                              />
                            </Field>
                            <label className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2">
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={form.company_fingerprint_auto_enroll_on_clock !== false}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    company_fingerprint_auto_enroll_on_clock: e.target.checked,
                                  }))
                                }
                                disabled={form.company_mobile_verification_method === "face"}
                              />
                              <span>
                                Allow fingerprint enrollment on first clock-in. When off, only employees
                                with an enrolled fingerprint in the system can mark attendance.
                              </span>
                            </label>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-slate-900">Work hours &amp; employees</h3>
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
                          <Field label="Default lunch minutes">
                            <input
                              type="number"
                              min="0"
                              max="240"
                              className={inputClassName()}
                              value={form.default_lunch_minutes}
                              onChange={(e) =>
                                setForm((f) => ({ ...f, default_lunch_minutes: e.target.value }))
                              }
                            />
                          </Field>
                        </div>
                        <Toggle
                          label="Lunch break is paid"
                          description="Lunch counts as paid time (expected hours = full shift span). Clock-out for lunch is not treated as lost time."
                          checked={form.lunch_break_is_paid}
                          onChange={(v) => setForm((f) => ({ ...f, lunch_break_is_paid: v }))}
                        />
                        <Toggle
                          label="Default: lunch required on new shifts"
                          description="New work shifts inherit this. Each shift can still override lunch length for weekdays and Sat/holiday hours."
                          checked={form.default_lunch_required}
                          onChange={(v) => setForm((f) => ({ ...f, default_lunch_required: v }))}
                        />
                        <Toggle
                          label="Require attendance before payroll"
                          description="Block payroll processing for employees with missing attendance in the pay period."
                          checked={form.require_attendance_for_payroll}
                          onChange={(v) =>
                            setForm((f) => ({ ...f, require_attendance_for_payroll: v }))
                          }
                        />
                        <Toggle
                          label="Enable employee cash advances"
                          description="Allow recording cash advances against employees in HR."
                          checked={form.enable_cash_advance_deductions}
                          onChange={(v) =>
                            setForm((f) => ({ ...f, enable_cash_advance_deductions: v }))
                          }
                        />
                        <Toggle
                          label="Deduct cash advances on payroll"
                          description="Include outstanding cash advance repayments when processing payroll."
                          checked={form.deduct_cash_advances_on_payroll}
                          disabled={!form.enable_cash_advance_deductions}
                          onChange={(v) =>
                            setForm((f) => ({ ...f, deduct_cash_advances_on_payroll: v }))
                          }
                        />
                      </div>
                    </div>
                  </>
                )
              ) : null}

              <PrimaryButton type="submit" disabled={loading || saving} showIcon={false}>
                {saving ? "Saving…" : "Save HR settings"}
              </PrimaryButton>
            </form>
          ) : null}

          {activeTab === "devices" && !loading ? (
            form.attendance_capture_mode === "clock_device" ? (
              <AttendanceClockDevicesSettings />
            ) : (
              <div className="space-y-4">
                <CompanyPremisesPanel embedded />
                <AttendanceMobileDevicesPanel embedded />
              </div>
            )
          ) : null}
        </div>
      </section>

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
