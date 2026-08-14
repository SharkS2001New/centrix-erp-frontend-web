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
  PaginationBar,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";

const PENDING_OT_EXPORT_COLUMNS = [
  { key: "work_date", label: "Date" },
  { key: "employee", label: "Employee" },
  { key: "hours", label: "Hours", align: "right" },
  { key: "amount", label: "Amount", align: "right" },
  { key: "notes", label: "Notes" },
];

export function HrPendingOvertimeScreen() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission(P.hr.pending_overtime.approve) || hasPermission(P.hr.manage);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ot, emp] = await Promise.all([
        apiRequest("/employee-overtime", {
          searchParams: { "filter[status]": "pending", per_page: pageSize, page },
        }),
        apiRequest("/employees", { searchParams: { per_page: 200 } }),
      ]);
      setRows(ot.data ?? []);
      setTotal(Number(ot.meta?.total ?? ot.total ?? ot.data?.length ?? 0));
      setEmployees(emp.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load pending overtime");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useTabAwareDataLoad(load);

  function employeeName(row) {
    const emp = employees.find((e) => e.id === row.employee_id) ?? row.employee;
    return emp ? composeEmployeeDisplayName(emp) : "—";
  }

  async function fetchAllPendingRows() {
    const all = [];
    let p = 1;
    for (;;) {
      const data = await apiRequest("/employee-overtime", {
        searchParams: { "filter[status]": "pending", per_page: 200, page: p },
      });
      const batch = data.data ?? [];
      all.push(...batch);
      const n = Number(data.meta?.total ?? all.length);
      if (all.length >= n || batch.length === 0) break;
      p += 1;
      if (p > 100) break;
    }
    return all.map((r) => ({
      work_date: formatShortDate(r.work_date),
      employee: employeeName(r),
      hours: r.hours,
      amount: formatHrKesFull(r.amount),
      notes: r.notes || "",
    }));
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

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
          <CatalogListExport
            title="Pending overtimes"
            filename="pending-overtimes"
            columns={PENDING_OT_EXPORT_COLUMNS}
            totalCount={total}
            getInlineRows={fetchAllPendingRows}
            disabled={loading}
          />
        </div>
      }
    >
      {loading && rows.length === 0 ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-600">No pending overtime.</p>
      ) : (
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
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
      <PaginationBar
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
        pageSizeOptions={[10, 25, 50, 100]}
      />
    </CatalogPageShell>
  );
}
