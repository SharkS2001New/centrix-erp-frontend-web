"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, FormModal, inputClassName, parseDecimalInput } from "@/components/catalog/catalog-shared";
import { cartTotals, formatSaleKes, getPaymentMethodKind } from "@/lib/sales";

const WALK_IN = { customer_num: null, label: "Walk-in" };

export function CheckoutModal({
  open,
  onClose,
  cart,
  saving,
  error,
  onCheckout,
}) {
  const [customers, setCustomers] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [customerNum, setCustomerNum] = useState("");
  const [paymentMethodCode, setPaymentMethodCode] = useState("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [reference, setReference] = useState("");

  const totals = useMemo(() => cartTotals(cart?.lines), [cart?.lines]);
  const selectedMethod = paymentMethods.find(
    (m) => String(m.method_code).toUpperCase() === paymentMethodCode.toUpperCase(),
  );
  const kind = getPaymentMethodKind(selectedMethod);
  const isCredit = kind === "credit";
  const received = parseDecimalInput(amountReceived);
  const change = Math.max(0, received - totals.total);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      apiRequest("/customers", { searchParams: { per_page: 100 } }).catch(() => ({ data: [] })),
      apiRequest("/payment-methods", { searchParams: { per_page: 50, "filter[is_active]": 1 } }).catch(
        () => ({ data: [] }),
      ),
    ]).then(([custRes, methodsRes]) => {
      if (cancelled) return;
      setCustomers(custRes.data ?? []);
      const methods = methodsRes.data ?? [];
      setPaymentMethods(methods);
      const cash = methods.find((m) => getPaymentMethodKind(m) === "cash");
      if (cash) setPaymentMethodCode(cash.method_code);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open && totals.total > 0 && kind === "cash") {
      setAmountReceived(String(Math.ceil(totals.total)));
    }
  }, [open, totals.total, kind]);

  function handleSubmit() {
    const body = {
      status: isCredit ? "pending_payment" : "completed",
      payment_method_code: paymentMethodCode,
      is_credit_sale: isCredit,
      pay_now: isCredit ? 0 : Math.min(received, totals.total),
    };
    if (customerNum) body.customer_num = Number(customerNum);
    if (isCredit) body.customer_name_override = customers.find(
      (c) => String(c.customer_num) === customerNum,
    )?.customer_name;
    onCheckout?.(body);
  }

  return (
    <FormModal
      title="Checkout sale"
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      saving={saving}
      error={error}
      submitLabel="Complete sale"
    >
      <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Subtotal</span>
          <span>{formatSaleKes(totals.subtotal)}</span>
        </div>
        <div className="mt-1 flex justify-between text-slate-600">
          <span>Tax</span>
          <span>{formatSaleKes(totals.tax)}</span>
        </div>
        <div className="mt-2 flex justify-between font-semibold text-slate-900">
          <span>Total</span>
          <span>{formatSaleKes(totals.total)}</span>
        </div>
      </div>

      <Field label="Customer">
        <select
          className={inputClassName()}
          value={customerNum}
          onChange={(e) => setCustomerNum(e.target.value)}
        >
          <option value="">{WALK_IN.label}</option>
          {customers.map((c) => (
            <option key={c.customer_num} value={String(c.customer_num)}>
              {c.customer_name ?? `Customer #${c.customer_num}`}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Payment method">
        <div className="space-y-2">
          {paymentMethods.length === 0 ? (
            <p className="text-sm text-slate-500">No payment methods configured.</p>
          ) : (
            paymentMethods.map((method) => (
              <label
                key={method.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
              >
                <input
                  type="radio"
                  name="payment_method"
                  checked={
                    String(method.method_code).toUpperCase() === paymentMethodCode.toUpperCase()
                  }
                  onChange={() => setPaymentMethodCode(method.method_code)}
                />
                {method.method_name}
              </label>
            ))
          )}
        </div>
      </Field>

      {!isCredit && kind === "cash" ? (
        <>
          <Field label="Amount received">
            <input
              className={inputClassName()}
              type="number"
              min="0"
              step="any"
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
            />
          </Field>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Change: {formatSaleKes(change)}
          </div>
        </>
      ) : null}

      {!isCredit && kind !== "cash" && selectedMethod?.requires_reference ? (
        <Field label="Reference">
          <input
            className={inputClassName()}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="M-Pesa code, bank ref…"
          />
        </Field>
      ) : null}

    </FormModal>
  );
}
