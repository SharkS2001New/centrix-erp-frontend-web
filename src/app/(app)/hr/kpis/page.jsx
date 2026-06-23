"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  FormDrawer,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { P } from "@/lib/permission-codes";

const EMPTY_ORG_KPI = {
  label: "",
  kpi_code: "",
  period_start: "",
  period_end: "",
  target_value: "",
  unit: "",
  notes: "",
  is_active: true,
  assign_to_active: true,
};

function progressTone(status) {
  if (status === "met") return "bg-emerald-500 text-emerald-800";
  if (status === "in_progress") return "bg-amber-100 text-amber-800";
  if (status === "not_met") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-600";
}

function statusLabel(status) {
  if (status === "met") return "Target met";
  if (status === "in_progress") return "In progress";
  if (status === "not_met") return "Below target";
  return "No actual yet";
}

export default function HrKpisPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission(P.hr.kpis.view);
  const canManage = hasPermission(P.hr.kpis.create) || hasPermission(P.hr.kpis.edit);

  const [tab, setTab] = useState("organization");
  const [orgKpis, setOrgKpis] = useState([]);
  const [selectedKpiId, setSelectedKpiId] = useState(null);
  const [achievement, setAchievement] = useState(null);
  const [loading, setLoading] = useState(true);
  const [achievementLoading, setAchievementLoading] = useState(false);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_ORG_KPI);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [assigningId, setAssigningId] = useState(null);

  const loadOrgKpis = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest("/organization-kpis");
      const rows = res.data ?? [];
      setOrgKpis(rows);
      if (rows.length && !selectedKpiId) {
        setSelectedKpiId(rows[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load KPIs");
    } finally {
      setLoading(false);
    }
  }, [selectedKpiId]);

  const loadAchievement = useCallback(async (kpiId) => {
    if (!kpiId) {
      setAchievement(null);
      return;
    }
    setAchievementLoading(true);
    try {
      const data = await apiRequest(`/organization-kpis/${kpiId}/achievement`);
      setAchievement(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load achievement data");
    } finally {
      setAchievementLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) loadOrgKpis();
  }, [canView, loadOrgKpis]);

  useEffect(() => {
    if (tab === "achievement" && selectedKpiId) {
      loadAchievement(selectedKpiId);
    }
  }, [tab, selectedKpiId, loadAchievement]);

  const selectedKpi = useMemo(
    () => orgKpis.find((k) => k.id === selectedKpiId) ?? null,
    [orgKpis, selectedKpiId],
  );

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_ORG_KPI);
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
      unit: row.unit ?? "",
      notes: row.notes ?? "",
      is_active: row.is_active !== false,
      assign_to_active: false,
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
      unit: form.unit.trim() || null,
      notes: form.notes.trim() || null,
      is_active: form.is_active !== false,
    };
    try {
      if (editing) {
        await apiRequest(`/organization-kpis/${editing.id}`, {
          method: "PUT",
          body: { ...body, sync_assigned: true },
        });
      } else {
        await apiRequest("/organization-kpis", {
          method: "POST",
          body: { ...body, assign_to_active: form.assign_to_active !== false },
        });
      }
      setDrawerOpen(false);
      await loadOrgKpis();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete organization KPI "${row.label}"? Assigned employee KPI rows will remain but lose the link.`)) {
      return;
    }
    try {
      await apiRequest(`/organization-kpis/${row.id}`, { method: "DELETE" });
      if (selectedKpiId === row.id) {
        setSelectedKpiId(null);
        setAchievement(null);
      }
      await loadOrgKpis();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleAssign(row) {
    setAssigningId(row.id);
    try {
      await apiRequest(`/organization-kpis/${row.id}/assign`, { method: "POST" });
      await loadOrgKpis();
      if (tab === "achievement" && selectedKpiId === row.id) {
        await loadAchievement(row.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setAssigningId(null);
    }
  }

  if (!canView) {
    return null;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Employee KPIs</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Set organization-wide targets for all staff, track who has met them, and manage individual KPIs from employee profiles.
          </p>
        </div>
        {canManage ? (
          <PrimaryButton type="button" onClick={openCreate}>
            Add organization KPI
          </PrimaryButton>
        ) : null}
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {[
          { id: "organization", label: "Organization targets" },
          { id: "achievement", label: "Achievement tracker" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-[#185FA5] text-[#185FA5]"
                : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading KPIs…</p>
      ) : tab === "organization" ? (
        <div className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">KPI</th>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium text-right">Target</th>
                <th className="px-4 py-3 font-medium text-right">Assigned</th>
                <th className="px-4 py-3 font-medium text-right">Met</th>
                <th className="px-4 py-3 font-medium text-right">In progress</th>
                <th className="px-4 py-3 font-medium text-right">Not met</th>
                {canManage ? <th className="px-4 py-3 font-medium" /> : null}
              </tr>
            </thead>
            <tbody>
              {orgKpis.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 8 : 7} className="px-4 py-8 text-center text-slate-500">
                    No organization KPIs yet. Create one to assign the same target to all active employees.
                  </td>
                </tr>
              ) : (
                orgKpis.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedKpiId(row.id);
                          setTab("achievement");
                        }}
                        className="font-medium text-[#185FA5] hover:underline text-left"
                      >
                        {row.label}
                      </button>
                      {row.kpi_code ? (
                        <span className="mt-0.5 block font-mono text-xs text-slate-500">{row.kpi_code}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.period_start || row.period_end
                        ? `${row.period_start ?? "…"} → ${row.period_end ?? "…"}`
                        : "Ongoing"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {row.target_value != null
                        ? `${row.target_value}${row.unit ? ` ${row.unit}` : ""}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{row.assigned_count ?? 0}</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{row.met_count ?? 0}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{row.in_progress_count ?? 0}</td>
                    <td className="px-4 py-3 text-right text-red-700">{row.not_met_count ?? 0}</td>
                    {canManage ? (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleAssign(row)}
                          disabled={assigningId === row.id}
                          className="text-[#185FA5] hover:underline disabled:opacity-50"
                        >
                          {assigningId === row.id ? "Assigning…" : "Assign all"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="ml-3 text-[#185FA5] hover:underline"
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
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Organization KPI">
              <select
                value={selectedKpiId ?? ""}
                onChange={(e) => setSelectedKpiId(Number(e.target.value) || null)}
                className={inputClassName()}
              >
                <option value="">Select KPI…</option>
                {orgKpis.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            {selectedKpi && canManage ? (
              <PrimaryButton
                type="button"
                onClick={() => handleAssign(selectedKpi)}
                disabled={assigningId === selectedKpi.id}
              >
                {assigningId === selectedKpi.id ? "Assigning…" : "Assign to all active employees"}
              </PrimaryButton>
            ) : null}
          </div>

          {achievementLoading ? (
            <p className="text-sm text-slate-500">Loading achievement data…</p>
          ) : achievement ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ["Assigned", achievement.summary?.assigned, "text-slate-900"],
                  ["Target met", achievement.summary?.met, "text-emerald-700"],
                  ["In progress", achievement.summary?.in_progress, "text-amber-700"],
                  ["Below target", achievement.summary?.not_met, "text-red-700"],
                  ["No actual yet", achievement.summary?.no_data, "text-slate-600"],
                ].map(([label, value, tone]) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value ?? 0}</p>
                  </div>
                ))}
              </div>

              <div className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                      <th className="px-4 py-3 font-medium">Employee</th>
                      <th className="px-4 py-3 font-medium">Department</th>
                      <th className="px-4 py-3 font-medium text-right">Target</th>
                      <th className="px-4 py-3 font-medium text-right">Actual</th>
                      <th className="px-4 py-3 font-medium">Progress</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(achievement.employees ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          No employees assigned yet. Use &quot;Assign to all active employees&quot; to create KPI rows for every active staff member.
                        </td>
                      </tr>
                    ) : (
                      achievement.employees.map((row) => (
                        <tr key={row.employee_kpi_id} className="border-b border-slate-100">
                          <td className="px-4 py-3">
                            <Link
                              href={`/hr/employees/${row.employee_id}`}
                              className="font-medium text-[#185FA5] hover:underline"
                            >
                              {row.employee_name}
                            </Link>
                            <span className="mt-0.5 block text-xs text-slate-500">{row.employee_code}</span>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.department_name ?? "—"}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            {row.target_value != null
                              ? `${row.target_value}${row.unit ? ` ${row.unit}` : ""}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            {row.actual_value != null
                              ? `${row.actual_value}${row.unit ? ` ${row.unit}` : ""}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {row.progress_pct != null ? (
                              <div className="flex min-w-[120px] items-center gap-2">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className={`h-full ${row.status === "met" ? "bg-emerald-500" : row.status === "in_progress" ? "bg-amber-500" : "bg-red-500"}`}
                                    style={{ width: `${Math.min(row.progress_pct, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-slate-600">{row.progress_pct}%</span>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${progressTone(row.status)}`}>
                              {statusLabel(row.status)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Select an organization KPI to see achievement by employee.</p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Individual KPI targets can also be added on each{" "}
        <Link href="/hr/employees" className="text-[#185FA5] hover:underline">
          employee profile
        </Link>
        . Terminated or suspended employees are excluded when assigning organization KPIs; setting employment status to terminated also disables linked user login.
      </div>

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit organization KPI" : "Add organization KPI"}
        wide
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
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
            <Field label="Target (all employees)">
              <input
                type="number"
                min="0"
                step="any"
                value={form.target_value}
                onChange={(e) => setForm((p) => ({ ...p, target_value: e.target.value }))}
                className={inputClassName()}
              />
            </Field>
            <Field label="Unit">
              <input
                type="text"
                value={form.unit}
                onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                className={inputClassName()}
                placeholder="%, KES, units…"
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              className={inputClassName()}
            />
          </Field>
          {!editing ? (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.assign_to_active !== false}
                onChange={(e) => setForm((p) => ({ ...p, assign_to_active: e.target.checked }))}
              />
              Assign this target to all active employees now
            </label>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
            >
              Cancel
            </button>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create KPI"}
            </PrimaryButton>
          </div>
        </form>
      </FormDrawer>
    </div>
  );
}
