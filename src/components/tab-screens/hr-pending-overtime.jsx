"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { P } from "@/lib/permission-codes";
import { useAuth } from "@/contexts/auth-context";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  formatShortDate,
} from "@/components/catalog/catalog-shared";

export function HrPendingOvertimeScreen() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(P.hr.manage);
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ot, emp] = await Promise.all([
        apiRequest("/employee-overtime", {
          searchParams: { "filter[status]": "pending", per_page: 200 },
        }),
        apiRequest("/employees", { searchParams: { per_page: 200 } }),
      ]);
      setRows(ot.data ?? []);
      setEmployees(emp.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load pending overtime");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(load);

  function employeeName(row) {
    const emp = employees.find((e) => e.id === row.employee_id) ?? row.employee;
    return emp ? composeEmployeeDisplayName(emp) : "—";
  }

  async function approve(id) {
    setBusyId(id);
    try {
      await apiRequest(`/employee-overtime/${id}/approve`, { method: "POST" });
      notifySuccess("Overtime approved. It now appears on the Overtime page.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not approve");
    } finally {
      setBusyId(null);
    }
  }

  async function deny(id) {
    setBusyId(id);
    try {
      await apiRequest(`/employee-overtime/${id}/deny`, { method: "POST" });
      notifySuccess("Denied. The overtime was removed and clock-out was set to shift end.");
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not deny");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <CatalogPageShell
      title="Pending overtimes"
      subtitle="Late clock-out past shift end is logged here. Approve to pay it, or deny to drop it and reset clock-out to the shift end time."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/hr/overtime" className="text-sm font-medium text-[#185FA5] hover:underline">
            Approved overtime
          </Link>
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">No pending overtime.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">Employee</th>
                <th className="py-2 pr-4 font-medium">Hours</th>
                <th className="py-2 pr-4 font-medium">Amount</th>
                <th className="py-2 pr-4 font-medium">Notes</th>
                {canManage ? <th className="py-2 pr-4 font-medium">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{formatShortDate(r.work_date)}</td>
                  <td className="py-2 pr-4">{employeeName(r)}</td>
                  <td className="py-2 pr-4">{r.hours}</td>
                  <td className="py-2 pr-4">{formatHrKesFull(r.amount)}</td>
                  <td className="py-2 pr-4 text-slate-600">{r.notes || "—"}</td>
                  {canManage ? (
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-2">
                        <PrimaryButton
                          type="button"
                          showIcon={false}
                          onClick={() => approve(r.id)}
                          disabled={busyId === r.id}
                        >
                          Approve
                        </PrimaryButton>
                        <button
                          type="button"
                          className={SECONDARY_BTN_CLASS}
                          onClick={() => deny(r.id)}
                          disabled={busyId === r.id}
                        >
                          Deny
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CatalogPageShell>
  );
}
