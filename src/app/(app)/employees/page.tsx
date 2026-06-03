"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { Employee, Paginated } from "@/types/api";

export default function EmployeesPage() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Paginated<Employee>>("/employees", { searchParams: { per_page: 50 } })
      .then((res) => setRows(res.data ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Employees</h1>
      <p className="mt-1 text-sm text-slate-400">HR & Payroll · GET /employees</p>

      {loading && <p className="mt-6 text-slate-500">Loading…</p>}
      {error && (
        <p className="mt-6 rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3 text-right">Salary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                    No employees yet — create via API or seed data.
                  </td>
                </tr>
              ) : (
                rows.map((e) => (
                  <tr key={e.id} className="bg-slate-900/40">
                    <td className="px-4 py-3 text-slate-400">{e.employee_code ?? e.id}</td>
                    <td className="px-4 py-3 text-white">{e.full_name}</td>
                    <td className="px-4 py-3 text-slate-300">{e.job_title ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-300">
                      {e.base_salary ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
