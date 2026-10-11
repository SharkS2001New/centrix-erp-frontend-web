"use client";

import { useState } from "react";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { RecordFormActions, RecordFormPage, useRecordExit } from "@/components/record-form-page";
import { toast } from "@/lib/toast";
import { datePart, ksh, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { useAppRouter } from "@/lib/use-app-router";
import { Badge, Card, Empty, Field, MobileFields, PageHeader, SpaSelect, Table, inputClass, primaryLinkClass, toOptions } from "@/components/spa/ui";

const CATEGORIES = ["Rent", "Utilities", "Supplies", "Salaries", "Marketing", "Other"];

export function ExpensesScreen() {
  const spa = useSpa();
  const router = useAppRouter();
  const today = todayISO();
  const month = today.slice(0, 7);
  const approved = spa.expenses.filter((item) => item.status === "approved");
  const daily = approved.filter((item) => item.date === today).reduce((sum, item) => sum + item.amount, 0);
  const monthly = approved.filter((item) => datePart(item.date).startsWith(month)).reduce((sum, item) => sum + item.amount, 0);

  return (
    <div>
      <PageHeader title="Expenses" detail="What the branch spent, and what still needs approval.">
        <AppNavLink href="/spa/expenses/new" className={primaryLinkClass}>Add expense</AppNavLink>
      </PageHeader>
      <section className="mb-4 grid gap-3 sm:grid-cols-2">
        <Card><p className="text-xs uppercase text-slate-400">Approved today</p><p className="mt-2 break-words text-xl font-semibold sm:text-2xl">{ksh(daily)}</p></Card>
        <Card><p className="text-xs uppercase text-slate-400">Approved this month</p><p className="mt-2 break-words text-xl font-semibold sm:text-2xl">{ksh(monthly)}</p></Card>
      </section>
      <Table columns={["Date", "Category", "Amount", "Method", "Reference", "Status", ""]} rows={spa.expenses} rowKey={(expense) => expense.id} onCreate={() => router.push("/spa/expenses/new")} createLabel="Add expense" card={(expense) => (
        <>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{expense.category}</p>
              <p className="theme-subtext text-sm">{ksh(expense.amount)}</p>
            </div>
            <Badge tone={expense.status === "approved" ? "green" : expense.status === "rejected" ? "red" : "amber"}>{expense.status}</Badge>
          </div>
          <MobileFields rows={[{ label: "Date", value: expense.date }, { label: "Method", value: expense.method }, { label: "Reference", value: expense.reference || "—" }]} />
          <div className="mt-3 flex gap-3">
            {expense.status === "pending" ? (
              <>
                <button type="button" className="text-sm text-[var(--theme-accent-text)]" onClick={() => { spa.setExpenseStatus(expense.id, "approved"); toast.success("Expense approved."); }}>Approve</button>
                <button type="button" className="text-sm text-red-600" onClick={() => { spa.setExpenseStatus(expense.id, "rejected"); toast.success("Expense rejected."); }}>Reject</button>
              </>
            ) : <AppNavLink href={`/spa/expenses/${expense.id}/edit`} className="text-sm text-[var(--theme-accent-text)]">Edit</AppNavLink>}
          </div>
        </>
      )} render={(expense) => (
        <tr key={expense.id} className="border-b border-slate-50">
          <td className="px-4 py-3">{expense.date}</td>
          <td className="px-4 py-3 font-medium">{expense.category}</td>
          <td className="px-4 py-3">{ksh(expense.amount)}</td>
          <td className="px-4 py-3">{expense.method}</td>
          <td className="px-4 py-3">{expense.reference || "—"}</td>
          <td className="px-4 py-3"><Badge tone={expense.status === "approved" ? "green" : expense.status === "rejected" ? "red" : "amber"}>{expense.status}</Badge></td>
          <td className="px-4 py-3 text-right">
            {expense.status === "pending" ? (
              <>
                <button type="button" className="mr-3 text-sm text-[var(--theme-accent-text)]" onClick={() => { spa.setExpenseStatus(expense.id, "approved"); toast.success("Expense approved."); }}>Approve</button>
                <button type="button" className="text-sm text-red-600" onClick={() => { spa.setExpenseStatus(expense.id, "rejected"); toast.success("Expense rejected."); }}>Reject</button>
              </>
            ) : <AppNavLink href={`/spa/expenses/${expense.id}/edit`} className="text-sm text-[var(--theme-accent-text)]">Edit</AppNavLink>}
          </td>
        </tr>
      )}       />
    </div>
  );
}

export function ExpenseFormScreen({ id }) {
  const spa = useSpa();
  const existing = id ? spa.expenses.find((item) => item.id === id) : null;
  const title = id ? "Edit expense" : "Add expense";
  const { exitTo } = useRecordExit(title);
  const [form, setForm] = useState(() => existing || { category: "Supplies", amount: "", method: "M-Pesa", date: todayISO(), reference: "", notes: "", status: "pending" });
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  if (id && !existing) return <Empty title="Expense not found" detail="It may have been removed from this browser's sample data." />;
  function save(event) {
    event.preventDefault();
    const error = spa.saveExpense(form);
    if (error) toast.error(error);
    else {
      toast.success("Expense saved.");
      exitTo("/spa/expenses");
    }
  }
  return (
    <RecordFormPage title={title} backHref="/spa/expenses">
      <form onSubmit={save}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category"><SpaSelect value={form.category} onChange={set("category")} options={toOptions(CATEGORIES)} /></Field>
        <Field label="Amount (KSh)"><input className={inputClass} type="number" min="1" value={form.amount} onChange={set("amount")} /></Field>
        <Field label="Payment method"><SpaSelect value={form.method} onChange={set("method")} options={toOptions(["Cash", "M-Pesa", "Card", "Bank"])} /></Field>
        <Field label="Date"><input className={inputClass} type="date" value={form.date} onChange={set("date")} /></Field>
        <Field label="Reference"><input className={inputClass} value={form.reference} onChange={set("reference")} /></Field>
        <Field label="Notes"><input className={inputClass} value={form.notes} onChange={set("notes")} /></Field>
      </div>
      <RecordFormActions backHref="/spa/expenses" />
      </form>
    </RecordFormPage>
  );
}
