"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  FormDrawer,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { formatHrKesFull } from "@/components/hr/hr-shared";
import { P } from "@/lib/permission-codes";
import { notifyError } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

const EMPTY_KPI_FORM = {
  label: "",
  kpi_code: "",
  period_start: "",
  period_end: "",
  target_value: "",
  actual_value: "",
  unit: "",
  notes: "",
};

function formatMetricValue(metric) {
  if (metric.value == null || metric.value === "") return "—";
  if (metric.unit === "KES") return formatHrKesFull(metric.value);
  if (metric.unit === "%") return `${metric.value}%`;
  return `${metric.value} ${metric.unit ?? ""}`.trim();
}

function progressTone(pct) {
  if (pct == null) return "bg-slate-200";
  if (pct >= 100) return "bg-emerald-500";
  if (pct >= 75) return "bg-[#185FA5]";
  if (pct >= 50) return "bg-amber-500";
  return "bg-red-500";
}

export function EmployeeKpisPanel({ employeeId }) {
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  const canManage = hasPermission(P.hr.kpis.create) || hasPermission(P.hr.employees.edit);

  const [computed, setComputed] = useState([]);
  const [tracked, setTracked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_KPI_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest(`/employees/${employeeId}/kpis`);
      setComputed(data.computed ?? []);
      setTracked(data.tracked ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load KPIs");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_KPI_FORM);
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setForm({
      label: row.label ?? "",
      kpi_code: row.kpi_code ?? "",
      period_start: row.period_start ?? "",
      period_end: row.period_end ?? "",
      target_value: row.target_value != null ? String(row.target_value) : "",
      actual_value: row.actual_value != null ? String(row.actual_value) : "",
      unit: row.unit ?? "",
      notes: row.notes ?? "",
    });
    setFormError(null);
    setDrawerOpen(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.label.trim()) {
      setFormError("KPI label is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const body = {
      label: form.label.trim(),
      kpi_code: form.kpi_code.trim() || null,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      target_value: form.target_value === "" ? null : Number(form.target_value),
      actual_value: form.actual_value === "" ? null : Number(form.actual_value),
      unit: form.unit.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editing) {
        await apiRequest(`/employees/${employeeId}/kpis/${editing.id}`, {
          method: "PUT",
          body,
        });
      } else {
        await apiRequest(`/employees/${employeeId}/kpis`, {
          method: "POST",
          body,
        });
      }
      setDrawerOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    const ok = await confirm({
      title: "Delete KPI",
      message: `Delete KPI "${row.label}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/employees/${employeeId}/kpis/${row.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <div className="theme-panel rounded-xl border p-5 shadow-sm lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-medium text-slate-900">Performance KPIs</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Auto-calculated metrics plus custom targets you track for this employee.
          </p>
        </div>
        {canManage ? (
          <PrimaryButton type="button" onClick={openCreate}>
            Add KPI target
          </PrimaryButton>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading KPIs…</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {computed.map((metric) => (
              <div
                key={metric.key}
                className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-3"
                title={metric.hint}
              >
                <p className="text-xs text-slate-500">{metric.label}</p>
                <p className="mt-1 text-lg font-medium text-slate-900">
                  {formatMetricValue(metric)}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-medium text-slate-800">Tracked targets</h3>
            {tracked.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No custom KPI targets yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2 font-medium">KPI</th>
                      <th className="px-2 py-2 font-medium">Period</th>
                      <th className="px-2 py-2 font-medium text-right">Target</th>
                      <th className="px-2 py-2 font-medium text-right">Actual</th>
                      <th className="px-2 py-2 font-medium">Progress</th>
                      {canManage ? <th className="px-2 py-2 font-medium" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {tracked.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="px-2 py-2">
                          <span className="font-medium text-slate-800">{row.label}</span>
                          {row.notes ? (
                            <span className="mt-0.5 block text-xs text-slate-500">{row.notes}</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-slate-600">
                          {row.period_start || row.period_end
                            ? `${row.period_start ?? "…"} → ${row.period_end ?? "…"}`
                            : "Ongoing"}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-700">
                          {row.target_value != null
                            ? `${row.target_value}${row.unit ? ` ${row.unit}` : ""}`
                            : "—"}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-slate-700">
                          {row.actual_value != null
                            ? `${row.actual_value}${row.unit ? ` ${row.unit}` : ""}`
                            : "—"}
                        </td>
                        <td className="px-2 py-2">
                          {row.progress_pct != null ? (
                            <div className="flex min-w-[120px] items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                                <div
                                  className={`h-full ${progressTone(row.progress_pct)}`}
                                  style={{ width: `${Math.min(row.progress_pct, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-600">{row.progress_pct}%</span>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        {canManage ? (
                          <td className="px-2 py-2 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              className="text-[#185FA5] hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(row)}
                              className="ml-3 text-red-600 hover:underline"
                            >
                              Delete
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit KPI target" : "Add KPI target"}
        wide
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <Field label="Label">
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
              required
              className={inputClassName()}
              placeholder="e.g. Monthly sales target"
            />
          </Field>
          <Field label="Code (optional)">
            <input
              type="text"
              value={form.kpi_code}
              onChange={(e) => setForm((p) => ({ ...p, kpi_code: e.target.value }))}
              className={`${inputClassName()} font-mono`}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Period start">
              <input
                type="date"
                value={form.period_start}
                onChange={(e) => setForm((p) => ({ ...p, period_start: e.target.value }))}
                className={inputClassName()}
              />
            </Field>
            <Field label="Period end">
              <input
                type="date"
                value={form.period_end}
                onChange={(e) => setForm((p) => ({ ...p, period_end: e.target.value }))}
                className={inputClassName()}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target">
              <input
                type="number"
                min="0"
                step="any"
                value={form.target_value}
                onChange={(e) => setForm((p) => ({ ...p, target_value: e.target.value }))}
                className={inputClassName()}
              />
            </Field>
            <Field label="Actual">
              <input
                type="number"
                min="0"
                step="any"
                value={form.actual_value}
                onChange={(e) => setForm((p) => ({ ...p, actual_value: e.target.value }))}
                className={inputClassName()}
              />
            </Field>
          </div>
          <Field label="Unit">
            <input
              type="text"
              value={form.unit}
              onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
              className={inputClassName()}
              placeholder="%, KES, days, score…"
            />
          </Field>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              className={inputClassName()}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
            >
              Cancel
            </button>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add KPI"}
            </PrimaryButton>
          </div>
        </form>
      </FormDrawer>
    </div>
  );
}
