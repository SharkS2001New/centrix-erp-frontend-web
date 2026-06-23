"use client";

import { EmployeeLeaveHub } from "@/components/hr/employee-leave-hub";
import { useState } from "react";

export function KenyaLeavePolicyAside({ defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <aside className="theme-panel rounded-xl border shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 p-5 text-left"
        aria-expanded={open}
      >
        <div>
          <h2 className="text-[15px] font-medium text-slate-900">Kenya leave policy</h2>
          <p className="mt-1 text-sm text-slate-500">
            Annual and sick leave accrue from hire date. Off days are assigned manually.
          </p>
        </div>
        <span className="mt-0.5 shrink-0 text-slate-400" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <dl className="space-y-4 border-t border-slate-100 px-5 pb-5 pt-4 text-sm">
          <div>
            <dt className="font-medium text-slate-900">Annual leave</dt>
            <dd className="mt-1 text-slate-600">
              <strong>21 working days</strong> after{" "}
              <strong>12 consecutive months</strong> of service. Accrues at{" "}
              <strong>1.75 days per month</strong> before the first full year.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Sick leave</dt>
            <dd className="mt-1 text-slate-600">
              <strong>14 days</strong> per year (7 full pay + 7 half pay) after{" "}
              <strong>2 months</strong> of service.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">Off days</dt>
            <dd className="mt-1 text-slate-600">
              Employer rest days — not auto-accrued. Expand an employee below to see utilization
              and assign new dates.
            </dd>
          </div>
        </dl>
      ) : null}
    </aside>
  );
}

export function LeaveAssignmentSection({
  employees: employeesProp = [],
  onAssignmentSaved,
  balanceRefreshKey = 0,
}) {
  return (
    <EmployeeLeaveHub
      employees={employeesProp}
      refreshKey={balanceRefreshKey}
      onSaved={onAssignmentSaved}
    />
  );
}
