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

export default function HrCashAdvancesPage() {
  const { hasPermission } = useAuth();
  const canApprove = canApproveCashAdvances({ hasPermission });

  return (
    <HrCrudPage
      title="Cash advances"
      subtitle="Salary advances recovered through payroll"
      addButtonLabel="Add advance"
      drawerWide
      apiPath="/employee-cash-advances"
      loadExtra={async () => {
        const res = await apiRequest("/employees", { searchParams: { per_page: 200 } });
        return { employees: res.data ?? [] };
      }}
      columns={[
        {
          key: "employee_id",
          label: "Employee",
          render: (r, { employees = [] }) => {
            const emp = employees.find((e) => e.id === r.employee_id);
            return emp ? composeEmployeeDisplayName(emp) : "—";
          },
        },
        {
          key: "advance_date",
          label: "Date",
          render: (r) => formatShortDate(r.advance_date),
        },
        { key: "amount", label: "Advanced", render: (r) => formatHrKesFull(r.amount) },
        { key: "balance", label: "Balance", render: (r) => formatHrKesFull(r.balance) },
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
        { key: "status", label: "Status" },
      ]}
      renderRowActions={(row, { reload }) => {
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

        if (!reminder && !approval) return null;
        return (
          <>
            {reminder}
            {approval}
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
        status: row?.status ?? "open",
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
          status: form.status,
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
              value={form.amount}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  amount: e.target.value,
                  balance: p.balance === "" ? e.target.value : p.balance,
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
          <HrSelectField
            label="Status"
            value={form.status}
            onChange={(v) => setForm((p) => ({ ...p, status: v }))}
            options={[
              { value: "pending", label: "Pending approval" },
              { value: "open", label: "Open" },
              { value: "repaid", label: "Repaid" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
        </>
      )}
    />
  );
}
