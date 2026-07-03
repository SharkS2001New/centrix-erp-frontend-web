"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { P } from "@/lib/permission-codes";
import { useOrgFormat } from "@/lib/org-format";
import { normalizeCustomerInvoice } from "@/lib/customer-invoices";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
} from "@/components/catalog/catalog-shared";

export default function CustomerInvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id;
  const { hasPermission } = useAuth();
  const { currency, date } = useOrgFormat();
  const canPay =
    hasPermission(P.payments.customer_payments.manage)
    || hasPermission(P.payments.customer_invoices.manage)
    || hasPermission(P.accounting.accounts_receivable.view);

  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [payForm, setPayForm] = useState({ amount_paid: "", payment_method_id: "", reference_number: "" });
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inv, payRes, methodsRes] = await Promise.all([
        apiRequest(`/customer-invoices/${invoiceId}`),
        apiRequest("/customer-invoice-payments", {
          searchParams: { "filter[customer_invoice_id]": invoiceId, per_page: 100 },
        }),
        apiRequest("/payment-methods", { searchParams: { per_page: 50, "filter[is_active]": 1 } }),
      ]);
      setInvoice(normalizeCustomerInvoice(inv));
      setPayments(payRes.data ?? []);
      setMethods(methodsRes.data ?? []);
      const balance = Number(inv.invoice_total ?? 0) - Number(inv.amount_paid ?? 0);
      setPayForm((f) => ({ ...f, amount_paid: balance > 0 ? String(balance) : "" }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load invoice");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function recordPayment(e) {
    e.preventDefault();
    if (!invoice) return;
    setPaySaving(true);
    setPayError(null);
    try {
      await apiRequest("/customer-invoice-payments", {
        method: "POST",
        body: {
          customer_invoice_id: invoice.id,
          customer_num: invoice.customer_num,
          payment_method_id: Number(payForm.payment_method_id),
          amount_paid: Number(payForm.amount_paid),
          reference_number: payForm.reference_number || null,
          date_paid: new Date().toISOString().slice(0, 10),
        },
      });
      await load();
    } catch (e) {
      setPayError(e instanceof ApiError ? e.message : "Payment failed");
    } finally {
      setPaySaving(false);
    }
  }

  if (loading) {
    return (
      <CatalogPageShell title="Customer invoice">
        <p className="text-sm text-slate-500">Loading…</p>
      </CatalogPageShell>
    );
  }

  if (!invoice) {
    return (
      <CatalogPageShell title="Customer invoice">
        <p className="text-sm text-red-600">{error ?? "Invoice not found"}</p>
      </CatalogPageShell>
    );
  }

  const balance = Number(invoice.invoice_total ?? 0) - Number(invoice.amount_paid ?? 0);

  return (
    <CatalogPageShell
      title={invoice.invoice_number}
      subtitle={`Customer #${invoice.customer_num} · ${date(invoice.invoice_date)}`}
    >
      <Link href="/accounting/customer-invoices" className="text-sm text-[#185FA5] hover:underline">
        ← All invoices
      </Link>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-500">Invoice total</p>
          <p className="mt-1 text-xl font-semibold">{currency(invoice.invoice_total)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-500">Amount paid</p>
          <p className="mt-1 text-xl font-semibold">{currency(invoice.amount_paid)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-slate-500">Balance due</p>
          <p className="mt-1 text-xl font-semibold text-amber-700">{currency(balance)}</p>
        </div>
      </div>

      {invoice.sale_id ? (
        <p className="mt-4 text-sm">
          Linked order:{" "}
          <Link href={`/sales/orders/${invoice.sale_id}`} className="text-[#185FA5] hover:underline">
            #{invoice.sale_id}
          </Link>
        </p>
      ) : null}

      <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium text-slate-900">Payments</h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No payments recorded.</p>
        ) : (
          <ul className="mt-3 divide-y text-sm">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between py-2">
                <span>
                  {date(p.date_paid)} · {p.reference_number || "—"}
                </span>
                <span className="font-medium">{currency(p.amount_paid)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canPay && balance > 0 ? (
        <section className="mt-6 rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="font-medium text-slate-900">Record payment</h2>
          <form onSubmit={recordPayment} className="mt-3 grid max-w-md gap-3">
            <Field label="Amount">
              <input
                type="number"
                min="0.01"
                step="0.01"
                className={inputClassName()}
                value={payForm.amount_paid}
                onChange={(e) => setPayForm((f) => ({ ...f, amount_paid: e.target.value }))}
                required
              />
            </Field>
            <Field label="Payment method">
              <select
                className={inputClassName()}
                value={payForm.payment_method_id}
                onChange={(e) => setPayForm((f) => ({ ...f, payment_method_id: e.target.value }))}
                required
              >
                <option value="">Select…</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.method_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reference">
              <input
                className={inputClassName()}
                value={payForm.reference_number}
                onChange={(e) => setPayForm((f) => ({ ...f, reference_number: e.target.value }))}
              />
            </Field>
            {payError ? <p className="text-sm text-red-600">{payError}</p> : null}
            <PrimaryButton type="submit" disabled={paySaving} showIcon={false}>
              {paySaving ? "Saving…" : "Record payment"}
            </PrimaryButton>
          </form>
        </section>
      ) : null}
    </CatalogPageShell>
  );
}
