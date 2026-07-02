"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { formatSaleKes } from "@/lib/sales";
import { formatTripProfitMargin } from "@/lib/trip-status";
import { useConfirm } from "@/lib/use-confirm";

const EMPTY_FORM = {
  expense_group_id: "",
  description: "",
  expense_amount: "",
  expense_date: new Date().toISOString().slice(0, 10),
  payment_method_id: "",
};

function expenseLabel(expense, groups = []) {
  const group = groups.find((row) => Number(row.id) === Number(expense.expense_group_id));
  return group?.group_name || expense.description || "Expense";
}

export function TripExpensesPanel({
  tripId,
  tripDate = null,
  financialSummary = null,
  onChanged = null,
  readOnly = false,
}) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [expenses, setExpenses] = useState([]);
  const [groups, setGroups] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const loadExpenses = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const res = await apiRequest("/expenses", {
        searchParams: {
          per_page: 100,
          "filter[dispatch_trip_id]": tripId,
        },
      });
      setExpenses(res.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load trip expenses");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  const loadMeta = useCallback(async () => {
    try {
      const [groupsRes, methodsRes] = await Promise.all([
        apiRequest("/expense-groups", { searchParams: { per_page: 200 } }),
        apiRequest("/payment-methods", { searchParams: { per_page: 100 } }),
      ]);
      setGroups(groupsRes.data ?? []);
      setPaymentMethods(methodsRes.data ?? []);
    } catch {
      // Non-blocking — form will show validation if lists are empty.
    }
  }, []);

  useEffect(() => {
    loadExpenses();
    loadMeta();
  }, [loadExpenses, loadMeta]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      expense_date: tripDate?.slice?.(0, 10) ?? current.expense_date,
    }));
  }, [tripDate]);

  async function saveExpense(e) {
    e.preventDefault();
    if (!user?.branch_id) {
      setFormError("Your user profile is missing a branch.");
      return;
    }
    if (!form.expense_group_id) {
      setFormError("Select an expense type (e.g. Fuel).");
      return;
    }
    if (!form.payment_method_id) {
      setFormError("Select a payment method.");
      return;
    }
    const amount = parseFloat(form.expense_amount);
    if (!amount || amount <= 0) {
      setFormError("Enter a valid amount.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await apiRequest("/expenses", {
        method: "POST",
        body: {
          branch_id: user.branch_id,
          expense_group_id: Number(form.expense_group_id),
          dispatch_trip_id: Number(tripId),
          description: form.description.trim() || null,
          expense_amount: amount,
          expense_date: form.expense_date,
          payment_method_id: Number(form.payment_method_id),
          billable_status: 1,
        },
      });
      notifySuccess("Trip expense recorded.");
      setForm({
        ...EMPTY_FORM,
        expense_date: tripDate?.slice?.(0, 10) ?? EMPTY_FORM.expense_date,
      });
      setShowForm(false);
      await loadExpenses();
      onChanged?.();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not save expense");
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(expense) {
    const ok = await confirm({
      title: "Remove trip expense",
      message: `Remove ${expenseLabel(expense, groups)} (${formatSaleKes(expense.expense_amount)}) from this trip?`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/expenses/${expense.id}`, { method: "DELETE" });
      notifySuccess("Expense removed.");
      await loadExpenses();
      onChanged?.();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  const summary = financialSummary ?? {};
  const totalExpenses = summary.total_expenses ?? expenses.reduce(
    (sum, row) => sum + Number(row.expense_amount ?? 0),
    0,
  );

  return (
    <section className="theme-panel rounded-xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Trip expenses</h2>
          <p className="mt-1 text-sm text-slate-600">
            Record fuel, tolls, and other run costs here. They are deducted from trip profit on the loading sheet and trip summary.
          </p>
        </div>
        {!readOnly ? (
          <button
            type="button"
            onClick={() => setShowForm((open) => !open)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-[#185FA5] hover:text-[#185FA5]"
          >
            {showForm ? "Cancel" : "Add expense"}
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3">
          <p className="text-xs uppercase text-slate-500">Gross profit</p>
          <p className="mt-1 font-semibold text-slate-900">
            {formatSaleKes(summary.total_profit ?? 0)}
            <span className="ml-1 text-sm font-normal text-slate-500">
              {formatTripProfitMargin(summary.profit_margin_percent)}
            </span>
          </p>
        </div>
        <div className="rounded-lg border border-slate-100 bg-slate-50/70 px-4 py-3">
          <p className="text-xs uppercase text-slate-500">Trip expenses</p>
          <p className="mt-1 font-semibold text-slate-900">{formatSaleKes(totalExpenses)}</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-4 py-3">
          <p className="text-xs uppercase text-emerald-700">Net profit</p>
          <p className="mt-1 font-semibold text-emerald-900">
            {formatSaleKes(summary.net_profit ?? summary.total_profit ?? 0)}
            <span className="ml-1 text-sm font-normal text-emerald-700">
              {formatTripProfitMargin(summary.net_profit_margin_percent ?? summary.profit_margin_percent)}
            </span>
          </p>
        </div>
      </div>

      {showForm && !readOnly ? (
        <form onSubmit={saveExpense} className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Expense type">
              <select
                className={inputClassName()}
                value={form.expense_group_id}
                onChange={(e) => setForm((f) => ({ ...f, expense_group_id: e.target.value }))}
              >
                <option value="">Select…</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.group_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (KES)">
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClassName()}
                value={form.expense_amount}
                onChange={(e) => setForm((f) => ({ ...f, expense_amount: e.target.value }))}
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                className={inputClassName()}
                value={form.expense_date}
                onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
              />
            </Field>
            <Field label="Payment method">
              <select
                className={inputClassName()}
                value={form.payment_method_id}
                onChange={(e) => setForm((f) => ({ ...f, payment_method_id: e.target.value }))}
              >
                <option value="">Select…</option>
                {paymentMethods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.payment_method_name ?? method.method_name ?? method.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2 lg:col-span-4">
              <Field label="Notes (optional)">
                <input
                  type="text"
                  className={inputClassName()}
                  placeholder="e.g. Diesel refill at route start"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </Field>
            </div>
          </div>
          {formError ? <p className="mt-3 text-sm text-red-600">{formError}</p> : null}
          <div className="mt-4">
            <PrimaryButton type="submit" showIcon={false} disabled={saving}>
              Save expense
            </PrimaryButton>
          </div>
        </form>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        {loading ? (
          <p className="px-4 py-6 text-sm text-slate-500">Loading expenses…</p>
        ) : expenses.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            No expenses recorded for this trip yet. Add fuel and other costs to see net profit.
          </p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Expense</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                {!readOnly ? <th className="px-4 py-3 font-medium text-right"> </th> : null}
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-900">{expenseLabel(expense, groups)}</td>
                  <td className="px-4 py-3 text-slate-600">{expense.expense_date?.slice?.(0, 10) ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {formatSaleKes(expense.expense_amount)}
                  </td>
                  {!readOnly ? (
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => deleteExpense(expense)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
