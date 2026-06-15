"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { Field, FormModal, inputClassName, parseDecimalInput } from "@/components/catalog/catalog-shared";
import { formatSaleKes, getPaymentMethodKind } from "@/lib/sales";

export function RecordSalePaymentModal({ open, onClose, saleId, balanceDue, onSaved }) {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const selectedMethod = useMemo(
    () => paymentMethods.find((m) => String(m.id) === String(paymentMethodId)),
    [paymentMethods, paymentMethodId],
  );
  const kind = getPaymentMethodKind(selectedMethod);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAmount(balanceDue != null ? String(balanceDue) : "");
    apiRequest("/payment-methods", { searchParams: { per_page: 50, "filter[is_active]": 1 } })
      .then((res) => {
        const methods = (res.data ?? []).filter((m) => getPaymentMethodKind(m) !== "credit");
        setPaymentMethods(methods);
        if (methods[0]) setPaymentMethodId(String(methods[0].id));
      })
      .catch(() => setPaymentMethods([]));
  }, [open, balanceDue]);

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/sales/${saleId}/payments`, {
        method: "POST",
        body: {
          payment_method_id: Number(paymentMethodId),
          amount: parseDecimalInput(amount),
          reference_number: reference.trim() || null,
        },
      });
      await onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      title="Record payment"
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      saving={saving}
      error={error}
      submitLabel="Save"
    >
      {balanceDue != null ? (
        <p className="text-sm text-slate-600">
          Balance due: <span className="font-medium text-slate-900">{formatSaleKes(balanceDue)}</span>
        </p>
      ) : null}

      <Field label="Amount">
        <input
          className={inputClassName()}
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </Field>

      <Field label="Method">
        <div className="space-y-2">
          {paymentMethods.map((method) => (
            <label
              key={method.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <input
                type="radio"
                name="sale_payment_method"
                checked={String(method.id) === String(paymentMethodId)}
                onChange={() => setPaymentMethodId(String(method.id))}
              />
              {method.method_name}
            </label>
          ))}
        </div>
      </Field>

      {kind !== "cash" && selectedMethod?.requires_reference ? (
        <Field label="Reference">
          <input
            className={inputClassName()}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Transaction reference"
          />
        </Field>
      ) : null}
    </FormModal>
  );
}
