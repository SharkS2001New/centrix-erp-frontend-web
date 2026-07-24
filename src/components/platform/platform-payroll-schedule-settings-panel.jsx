"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import {
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";

export function PlatformPayrollScheduleSettingsPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enforce, setEnforce] = useState(true);
  const [hints, setHints] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/payroll-schedule-settings");
      const settings = res.settings ?? {};
      setEnforce(settings.enforce_month_end_run_schedule !== false);
      setHints(res.hints ?? {});
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load payroll schedule settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest("/admin/payroll-schedule-settings", {
        method: "PUT",
        body: {
          enforce_month_end_run_schedule: Boolean(enforce),
        },
      });
      const settings = res.settings ?? {};
      setEnforce(settings.enforce_month_end_run_schedule !== false);
      setHints(res.hints ?? {});
      notifySuccess("Payroll schedule settings saved.");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="theme-panel rounded-xl border p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-[15px] font-medium text-slate-900">Payroll run calendar</h2>
        <p className="mt-1 text-sm text-slate-500">
          Platform-wide rule for when tenant organizations may generate payroll runs.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={enforce}
              onChange={(e) => setEnforce(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-slate-900">
                Enforce month-end payroll schedule
              </span>
              <span className="mt-0.5 block text-xs text-slate-600">
                {enforce
                  ? hints.enforce_on ||
                    "On (default): payroll only on the last day of the month, or in the grace window after month end."
                  : hints.enforce_off ||
                    "Off: tenants may run payroll for the current or any past month at any time."}
              </span>
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </PrimaryButton>
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={saving}
              onClick={() => void load()}
            >
              Reset
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
