"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { Field, inputClassName, PrimaryButton } from "@/components/catalog/catalog-shared";
import { formatCustomerKes } from "@/components/customers/customer-form";
import { notifyError, notifySuccess } from "@/lib/notify";

/**
 * Collect AR payment against a customer's open invoices (FIFO by default).
 *
 * @param {object} props
 * @param {object} props.customer
 * @param {() => void} props.onClose
 * @param {(customer: object) => void} props.onSuccess
 */
export function CollectCustomerPaymentModal({ customer, onClose, onSuccess }) {
  const outstanding = Number(customer?.current_balance ?? 0);
  const [methods, setMethods] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    amount_paid: outstanding > 0 ? outstanding.toFixed(2) : "",
    payment_method_id: "",
    customer_invoice_id: "",
    reference_number: "",
    cheque_number: "",
    date_paid: new Date().toISOString().slice(0, 10),
    notes: customer?.customer_name ? `Received from ${customer.customer_name}` : "",
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiRequest("/payment-methods", {
        searchParams: { per_page: 50, "filter[is_active]": 1 },
      }).catch(() => ({ data: [] })),
      apiRequest("/customer-invoices", {
        searchParams: {
          customer_num: customer.customer_num,
          per_page: 100,
        },
      }).catch(() => ({ data: [] })),
    ])
      .then(([methodsRes, invoicesRes]) => {
        if (cancelled) return;
        setMethods((methodsRes.data ?? methodsRes ?? []).filter((m) => m.is_active !== false));
        const open = (invoicesRes.data ?? []).filter((inv) => {
          const status = Number(inv.payment_status);
          const due =
            inv.balance_due != null
              ? Number(inv.balance_due)
              : Number(inv.invoice_total ?? 0) - Number(inv.amount_paid ?? 0);
          return (status === 0 || status === 1) && due > 0.009;
        });
        setInvoices(open);
        const liveOutstanding = open.reduce((sum, inv) => {
          const due =
            inv.balance_due != null
              ? Number(inv.balance_due)
              : Number(inv.invoice_total ?? 0) - Number(inv.amount_paid ?? 0);
          return sum + Math.max(0, due);
        }, 0);
        setForm((f) => ({
          ...f,
          amount_paid: liveOutstanding > 0 ? liveOutstanding.toFixed(2) : f.amount_paid,
        }));
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : "Failed to load payment options.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customer?.customer_num]);

  const selectedInvoiceBalance = useMemo(() => {
    if (!form.customer_invoice_id) return null;
    const inv = invoices.find((i) => String(i.id) === String(form.customer_invoice_id));
    if (!inv) return null;
    return inv.balance_due != null
      ? Number(inv.balance_due)
      : Number(inv.invoice_total ?? 0) - Number(inv.amount_paid ?? 0);
  }, [form.customer_invoice_id, invoices]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        amount_paid: Number(form.amount_paid),
        payment_method_id: Number(form.payment_method_id),
        date_paid: form.date_paid || undefined,
        notes: form.notes?.trim() || undefined,
        reference_number: form.reference_number?.trim() || undefined,
        cheque_number: form.cheque_number?.trim() || undefined,
      };
      if (form.customer_invoice_id) {
        payload.customer_invoice_id = Number(form.customer_invoice_id);
      }

      const result = await apiRequest(`/customers/${customer.customer_num}/payments`, {
        method: "POST",
        body: payload,
      });
      notifySuccess(
        `Collected ${formatCustomerKes(result.amount_applied)} from ${customer.customer_name}`,
      );
      onSuccess?.(result.customer ?? customer);
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Could not record customer payment.";
      setError(message);
      notifyError(message);
    } finally {
      setSaving(false);
    }
  }

  const maxAmount =
    selectedInvoiceBalance != null && selectedInvoiceBalance > 0
      ? selectedInvoiceBalance
      : outstanding;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="collect-customer-payment-title"
        className="theme-panel w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="collect-customer-payment-title" className="text-lg font-semibold text-slate-900">
              Collect payment
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {customer.customer_name} · Outstanding {formatCustomerKes(outstanding)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <Field label="Amount">
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                max={maxAmount > 0 ? maxAmount.toFixed(2) : undefined}
                className={inputClassName()}
                value={form.amount_paid}
                onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value }))}
              />
            </Field>

            <Field label="Payment method">
              <select
                required
                className={inputClassName()}
                value={form.payment_method_id}
                onChange={(e) => setForm((f) => ({ ...f, payment_method_id: e.target.value }))}
              >
                <option value="">Select method</option>
                {methods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.method_name || m.name || m.method_code}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Apply to invoice (optional)">
              <select
                className={inputClassName()}
                value={form.customer_invoice_id}
                onChange={(e) => {
                  const id = e.target.value;
                  const inv = invoices.find((i) => String(i.id) === String(id));
                  const due = inv
                    ? inv.balance_due != null
                      ? Number(inv.balance_due)
                      : Number(inv.invoice_total ?? 0) - Number(inv.amount_paid ?? 0)
                    : null;
                  setForm((f) => ({
                    ...f,
                    customer_invoice_id: id,
                    amount_paid:
                      due != null && due > 0 ? due.toFixed(2) : f.amount_paid,
                  }));
                }}
              >
                <option value="">Oldest unpaid first (auto)</option>
                {invoices.map((inv) => {
                  const due =
                    inv.balance_due != null
                      ? Number(inv.balance_due)
                      : Number(inv.invoice_total ?? 0) - Number(inv.amount_paid ?? 0);
                  return (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number || `Invoice #${inv.id}`} · {formatCustomerKes(due)}
                    </option>
                  );
                })}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Leave blank to allocate across unpaid invoices, oldest first.
              </p>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date paid">
                <input
                  type="date"
                  className={inputClassName()}
                  value={form.date_paid}
                  onChange={(e) => setForm((f) => ({ ...f, date_paid: e.target.value }))}
                />
              </Field>
              <Field label="Reference">
                <input
                  className={inputClassName()}
                  value={form.reference_number}
                  onChange={(e) => setForm((f) => ({ ...f, reference_number: e.target.value }))}
                  placeholder="M-Pesa / bank / cheque ref"
                />
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                className={inputClassName()}
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <PrimaryButton type="submit" showIcon={false} disabled={saving || invoices.length === 0}>
                {saving ? "Recording…" : "Collect payment"}
              </PrimaryButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
