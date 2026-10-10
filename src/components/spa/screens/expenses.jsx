"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import { datePart, ksh, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { Badge, Button, Card, Field, Modal, PageHeader, Table, inputClass } from "@/components/spa/ui";

const CATEGORIES = ["Rent", "Utilities", "Supplies", "Salaries", "Marketing", "Other"];

export function ExpensesScreen() {
  const spa = useSpa();
  const [editing, setEditing] = useState(null);
  const today = todayISO();
  const month = today.slice(0, 7);
  const approved = spa.expenses.filter((item) => item.status === "approved");
  const daily = approved.filter((item) => item.date === today).reduce((sum, item) => sum + item.amount, 0);
  const monthly = approved.filter((item) => datePart(item.date).startsWith(month)).reduce((sum, item) => sum + item.amount, 0);

  return (
    <div>
      <PageHeader title="Expenses" detail="What the branch spent, and what still needs approval.">
        <Button onClick={() => setEditing({ category: "Supplies", amount: "", method: "M-Pesa", date: today, reference: "", notes: "", status: "pending" })}>Add expense</Button>
      </PageHeader>
      <section className="mb-4 grid gap-3 sm:grid-cols-2">
        <Card><p className="text-xs uppercase text-slate-400">Approved today</p><p className="mt-2 text-2xl font-semibold">{ksh(daily)}</p></Card>
        <Card><p className="text-xs uppercase text-slate-400">Approved this month</p><p className="mt-2 text-2xl font-semibold">{ksh(monthly)}</p></Card>
      </section>
      <Table columns={["Date", "Category", "Amount", "Method", "Reference", "Status", ""]} rows={spa.expenses} render={(expense) => (
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
                <button type="button" className="mr-3 text-sm text-[#1677F2]" onClick={() => { spa.setExpenseStatus(expense.id, "approved"); toast.success("Expense approved."); }}>Approve</button>
                <button type="button" className="text-sm text-red-600" onClick={() => { spa.setExpenseStatus(expense.id, "rejected"); toast.success("Expense rejected."); }}>Reject</button>
              </>
            ) : <button type="button" className="text-sm text-[#1677F2]" onClick={() => setEditing(expense)}>Edit</button>}
          </td>
        </tr>
      )} />
      {editing ? <ExpenseForm expense={editing} onClose={() => setEditing(null)} onSave={(expense) => {
        const error = spa.saveExpense(expense);
        if (error) toast.error(error);
        else { toast.success("Expense saved."); setEditing(null); }
      }} /> : null}
    </div>
  );
}

function ExpenseForm({ expense, onClose, onSave }) {
  const [form, setForm] = useState(expense);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <Modal title={expense.id ? "Edit expense" : "Add expense"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category"><select className={inputClass} value={form.category} onChange={set("category")}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></Field>
        <Field label="Amount (KSh)"><input className={inputClass} type="number" min="1" value={form.amount} onChange={set("amount")} /></Field>
        <Field label="Payment method"><select className={inputClass} value={form.method} onChange={set("method")}><option>Cash</option><option>M-Pesa</option><option>Card</option><option>Bank</option></select></Field>
        <Field label="Date"><input className={inputClass} type="date" value={form.date} onChange={set("date")} /></Field>
        <Field label="Reference"><input className={inputClass} value={form.reference} onChange={set("reference")} /></Field>
        <Field label="Notes"><input className={inputClass} value={form.notes} onChange={set("notes")} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Close</Button><Button onClick={() => onSave(form)}>Save</Button></div>
    </Modal>
  );
}
