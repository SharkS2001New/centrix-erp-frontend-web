"use client";

import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { canApproveCashAdvances } from "@/lib/approval-permissions";
import {
  Field,
  formatShortDate,
  inputClassName,
  parseDecimalInput,
} from "@/components/catalog/catalog-shared";
import { HrCrudPage, HrSelectField } from "@/components/hr/hr-crud-page";
import { composeEmployeeDisplayName, formatHrKesFull } from "@/components/hr/hr-shared";
import { ApprovalReminderButton } from "@/components/approval-reminder-button";
import { printCashAdvanceVoucher } from "@/components/hr/cash-advance-voucher-print";
import { notifySuccess } from "@/lib/notify";

function PrintIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function statusLabel(status) {
  switch (status) {
    case "pending":
      return "Pending approval";
    case "open":
      return "Open";
    case "repaid":
      return "Repaid";
    case "cancelled":
      return "Cancelled";
    default:
      return status || "—";
  }
}

export function HrCashAdvancesScreen() {
  const { hasPermission, user, organization, generalSettings } = useAuth();
  const canApprove = canApproveCashAdvances({ hasPermission });

  function printVoucher(advance, employees = []) {
    const employee =
      advance?.employee ??
      employees.find((e) => Number(e.id) === Number(advance?.employee_id)) ??
      null;
    printCashAdvanceVoucher({
      advance,
      employee,
      organization,
      generalSettings: typeof generalSettings === "function" ? generalSettings() : generalSettings,
      printedByUser: user,
      preparedByName: advance?.prepared_by_name || user?.full_name || user?.username,
      approvedByName: advance?.approved_by_name || null,
    });
  }

  return (
    <HrCrudPage
      title="Cash advances"
      subtitle="Salary advances recovered through payroll — new advances go to a manager with approval rights"
      addButtonLabel="Add advance"
      drawerWide
      drawerCreateTitle="Request cash advance"
      apiPath="/employee-cash-advances"
      loadExtra={async () => {
        const res = await apiRequest("/employees", {
          searchParams: { per_page: 200, fields: "lean" },
        });
        return { employees: res.data ?? [] };
      }}
      onCreated={(created) => {
        notifySuccess("Cash advance submitted for manager approval");
        printVoucher(created, []);
      }}
      columns={[
        {
          key: "employee_id",
          label: "Employee",
          render: (r, { employees = [] }) => {
            const emp = r.employee ?? employees.find((e) => e.id === r.employee_id);
            return emp ? composeEmployeeDisplayName(emp) : "—";
          },
        },
        {
          key: "advance_date",
          label: "Date",
          render: (r) => formatShortDate(r.advance_date),
        },
        { key: "amount", label: "Advanced", render: (r) => formatHrKesFull(r.amount) },
        { key: "balance", label: "Outstanding", render: (r) => formatHrKesFull(r.balance) },
        {
          key: "next_deduction",
          label: "Next payroll deduction",
          render: (r) => {
            const next =
              r.next_deduction_amount != null
                ? Number(r.next_deduction_amount)
                : r.status === "open"
                  ? Number(r.balance ?? 0)
                  : 0;
            if (r.status !== "open" || next <= 0) return "—";
            return formatHrKesFull(next);
          },
        },
        {
          key: "repayment_mode",
          label: "Repayment",
          render: (r) => {
            const mode = r.repayment_mode === "fixed_per_cycle" ? "fixed_per_cycle" : "full_next_cycle";
            return mode === "full_next_cycle"
              ? "Full balance next cycle"
              : `${formatHrKesFull(r.repayment_amount)} / payroll`;
          },
        },
        {
          key: "status",
          label: "Status",
          render: (r) => statusLabel(r.status),
        },
      ]}
      renderRowActions={(row, { reload, employees }) => {
        const reminder = row.action_request?.can_remind ? (
          <ApprovalReminderButton
            actionRequestId={row.action_request.id}
            canRemind
            onReminded={reload}
            className="mr-3"
          />
        ) : null;
        const approval =
          canApprove && row.status === "pending" ? (
            <>
              <button
                type="button"
                className="text-emerald-700 hover:underline"
                onClick={async () => {
                  await apiRequest(`/employee-cash-advances/${row.id}/approve`, { method: "POST" });
                  reload();
                }}
              >
                Approve
              </button>
              <button
                type="button"
                className="ml-3 text-red-600 hover:underline"
                onClick={async () => {
                  await apiRequest(`/employee-cash-advances/${row.id}/reject`, { method: "POST" });
                  reload();
                }}
              >
                Reject
              </button>
            </>
          ) : null;
        const printBtn = (
          <button
            type="button"
            className="ml-3 inline-flex items-center gap-1.5 text-slate-700 hover:underline"
            onClick={() => printVoucher(row, employees)}
          >
            <PrintIcon />
            Print
          </button>
        );

        return (
          <>
            {reminder}
            {approval}
            {printBtn}
          </>
        );
      }}
      buildEmptyForm={(_, row) => ({
        employee_id: row?.employee_id != null ? String(row.employee_id) : "",
        advance_date: row?.advance_date?.slice?.(0, 10) ?? new Date().toISOString().slice(0, 10),
        amount: row?.amount != null ? String(row.amount) : "",
        balance: row?.balance != null ? String(row.balance) : "",
        repayment_mode: row?.repayment_mode ?? "full_next_cycle",
        repayment_amount:
          row?.repayment_amount != null ? String(row.repayment_amount) : "",
        notes: row?.notes ?? "",
      })}
      buildBody={(form, orgId) => {
        const amount = parseDecimalInput(form.amount);
        const balance =
          form.balance !== "" ? parseDecimalInput(form.balance) : amount;
        return {
          employee_id: Number(form.employee_id),
          organization_id: orgId,
          advance_date: form.advance_date,
          amount,
          balance: balance > 0 ? balance : amount,
          repayment_mode: form.repayment_mode,
          repayment_amount:
            form.repayment_mode === "fixed_per_cycle" && form.repayment_amount
              ? parseDecimalInput(form.repayment_amount)
              : null,
          notes: form.notes.trim() || null,
        };
      }}
      validateForm={(form) => {
        if (!form.employee_id) return "Select an employee.";
        if (!form.amount) return "Amount is required.";
        if (
          form.repayment_mode === "fixed_per_cycle" &&
          (!form.repayment_amount || parseDecimalInput(form.repayment_amount) <= 0)
        ) {
          return "Enter repayment amount per payroll cycle.";
        }
        return null;
      }}
      renderFormFields={(form, setForm, extra) => (
        <>
          <HrSelectField
            label="Employee"
            value={form.employee_id}
            onChange={(v) => setForm((p) => ({ ...p, employee_id: v }))}
            required
            options={(extra.employees ?? []).map((e) => ({
              value: String(e.id),
              label: composeEmployeeDisplayName(e),
            }))}
          />
          <Field label="Advance date">
            <input
              type="date"
              value={form.advance_date}
              onChange={(e) => setForm((p) => ({ ...p, advance_date: e.target.value }))}
              className={inputClassName()}
            />
          </Field>
          <Field label="Amount (KES)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  amount: e.target.value,
                  balance: e.target.value,
                }))
              }
              className={inputClassName()}
            />
          </Field>
          <Field label="Repayment">
            <select
              value={form.repayment_mode}
              onChange={(e) => setForm((p) => ({ ...p, repayment_mode: e.target.value }))}
              className={inputClassName()}
            >
              <option value="full_next_cycle">Deduct full balance on next payroll</option>
              <option value="fixed_per_cycle">Fixed amount each payroll cycle</option>
            </select>
          </Field>
          {form.repayment_mode === "fixed_per_cycle" && (
            <Field label="Amount per payroll cycle (KES)">
              <input
                type="number"
                min="0"
                value={form.repayment_amount}
                onChange={(e) => setForm((p) => ({ ...p, repayment_amount: e.target.value }))}
                required
                className={inputClassName()}
              />
            </Field>
          )}
          <Field label="Notes / reason">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={3}
              className={inputClassName()}
              placeholder="Reason for the advance (shown on the voucher)"
            />
          </Field>
          {!extra.editingRow ? (
            <p className="text-xs text-slate-500">
              This request will be sent for approval to the employee&apos;s manager (if they have
              cash-advance approval rights), otherwise to all users with approval rights. A printable
              voucher opens after save for wet-ink signature and stamp.
            </p>
          ) : null}
        </>
      )}
    />
  );
}
