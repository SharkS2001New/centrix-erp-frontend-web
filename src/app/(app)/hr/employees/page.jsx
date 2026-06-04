"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  FilterSelect,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryButton,
  SearchInput,
  StatCard,
  TrashIcon,
} from "@/components/catalog/catalog-shared";
import {
  EmployeeStatusBadge,
  composeEmployeeDisplayName,
  formatHrKesFull,
  formatShiftExpectedHours,
  formatWorkShiftLabel,
} from "@/components/hr/hr-shared";

const PAGE_SIZE = 10;

export default function HrEmployeesPage() {
  const router = useRouter();

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [empRes, deptRes] = await Promise.all([
        apiRequest("/employees", { searchParams: { per_page: 200 } }),
        apiRequest("/departments", { searchParams: { per_page: 200 } }),
      ]);
      setEmployees(empRes.data ?? []);
      setDepartments(deptRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.is_active !== false);
    const totalSalary = active.reduce((sum, e) => sum + Number(e.base_salary ?? 0), 0);
    return {
      total: employees.length,
      active: active.length,
      departments: departments.filter((d) => d.is_active !== false).length,
      payrollCost: totalSalary,
    };
  }, [employees, departments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (statusFilter === "active" && e.is_active === false) return false;
      if (statusFilter === "inactive" && e.is_active !== false) return false;
      if (deptFilter !== "all" && String(e.department_id) !== deptFilter) return false;
      if (q) {
        const hay = `${e.full_name} ${e.first_name} ${e.middle_name} ${e.last_name} ${e.employee_code} ${e.job_title} ${e.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [employees, search, deptFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, deptFilter, statusFilter]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  async function deleteEmployee(employee) {
    if (!window.confirm(`Delete employee "${composeEmployeeDisplayName(employee)}"?`)) return;
    try {
      await apiRequest(`/employees/${employee.id}`, { method: "DELETE" });
      await loadData();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  return (
    <CatalogPageShell
      title="Employees"
      subtitle="Manage staff records and departments"
      action={
        <Link
          href="/hr/employees/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
        >
          Add employee
        </Link>
      }
      banner={
        !loading ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active employees" value={stats.active.toLocaleString()} />
            <StatCard label="Total employees" value={stats.total.toLocaleString()} />
            <StatCard label="Departments" value={stats.departments.toLocaleString()} />
            <StatCard label="Monthly payroll cost" value={formatHrKesFull(stats.payrollCost)} />
          </div>
        ) : null
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="max-w-sm"
          />
          <FilterSelect
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            options={[
              { value: "all", label: "All departments" },
              ...departments.map((d) => ({ value: String(d.id), label: d.department_name })),
            ]}
          />
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        </div>
      }
    >
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading employees…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5">Department</th>
                    <th className="px-4 py-2.5">Shift</th>
                    <th className="px-4 py-2.5">Branch</th>
                    <th className="px-4 py-2.5">Position</th>
                    <th className="px-4 py-2.5 text-right">Salary</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="w-[110px] px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        No employees found.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((employee) => (
                      <tr
                        key={employee.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/hr/employees/${employee.id}`}
                            className="font-medium text-[#185FA5] hover:underline"
                          >
                            {composeEmployeeDisplayName(employee)}
                          </Link>
                          <p className="text-xs text-slate-500">{employee.employee_code}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {employee.department?.department_name ??
                            deptById.get(employee.department_id)?.department_name ??
                            "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {employee.shift ? (
                            <>
                              <span className="block">{formatWorkShiftLabel(employee.shift)}</span>
                              <span className="text-xs text-slate-500">
                                {formatShiftExpectedHours(employee.shift)}
                              </span>
                            </>
                          ) : (
                            <span className="text-amber-700">Not assigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {employee.branch?.branch_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{employee.job_title || "—"}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-800">
                          {formatHrKesFull(employee.base_salary)}
                        </td>
                        <td className="px-4 py-3">
                          <EmployeeStatusBadge active={employee.is_active !== false} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <IconButton
                              label="View"
                              onClick={() => router.push(`/hr/employees/${employee.id}`)}
                            >
                              <ViewIcon />
                            </IconButton>
                            <IconButton
                              label="Edit"
                              onClick={() => router.push(`/hr/employees/${employee.id}/edit`)}
                            >
                              <PencilIcon />
                            </IconButton>
                            <IconButton label="Delete" danger onClick={() => deleteEmployee(employee)}>
                              <TrashIcon />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </CatalogPageShell>
  );
}

function ViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
