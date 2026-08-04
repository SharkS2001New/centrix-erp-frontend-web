"use client";

import { useEffect, useRef, useState } from "react";
import { INPUT_CLASS } from "@/components/catalog/catalog-shared";
import { formatSaleKes } from "@/lib/sales";
import {
  posPaymentMethodHint,
  resolvePosPaymentMethodCode,
} from "@/lib/pos-edit-payment-adjustment";

const POS_DIALOG_SHELL =
  "theme-modal relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border shadow-2xl";
const POS_DIALOG_HEADER = "theme-dialog-header px-4 py-3";
const POS_DIALOG_FOOTER = "theme-dialog-footer grid grid-cols-2 gap-2 p-3";
const POS_DIALOG_PRIMARY_BTN =
  "theme-primary-btn flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50";
const POS_DIALOG_SECONDARY_BTN =
  "theme-secondary-btn flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50";

const inputCls = INPUT_CLASS;

/**
 * Capture how a previous-order edit refund or top-up was settled (no F10 payment flow).
 */
export function PosEditPaymentAdjustmentDialog({
  open,
  delta,
  orderNum,
  paymentMethods = [],
  onConfirm,
  onCancel,
}) {
  const methodRef = useRef(null);
  const [methodInput, setMethodInput] = useState("C");
  const [reference, setReference] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setMethodInput("C");
    setReference("");
    setError(null);
    const t = window.setTimeout(() => methodRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, delta?.amount, delta?.type]);

  if (!open || !delta?.type || !(Number(delta.amount) > 0)) {
    return null;
  }

  const isReturn = delta.type === "return";
  const title = "Payment Breakdown";
  const amountLabel = isReturn ? "Return amount" : "Top-up amount";

  function submit() {
    const methodCode = resolvePosPaymentMethodCode(methodInput, paymentMethods);
    if (!methodCode) {
      setError("Enter a payment method (e.g. C, M, E, ECO).");
      return;
    }
    const matched = paymentMethods.find(
      (m) => String(m.method_code ?? "").toUpperCase() === methodCode,
    );
    if (paymentMethods.length > 0 && !matched && !["CASH", "MPESA", "EQUITY", "KCB", "ECOBANK", "BANK", "CARD"].includes(methodCode)) {
      setError(`Payment method ${methodCode} is not configured.`);
      return;
    }
    if (matched?.requires_reference && !reference.trim()) {
      setError("Enter a reference for this payment method.");
      return;
    }
    onConfirm?.([
      {
        method_code: methodCode,
        amount: Number(delta.amount),
        adjustment_type: delta.type,
        reference_number: reference.trim() || null,
      },
    ]);
  }

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/45 p-4">
      <div role="dialog" aria-modal="true" className={`relative w-full max-w-md ${POS_DIALOG_SHELL}`}>
        <div className={POS_DIALOG_HEADER}>
          <h2 className="text-center text-sm font-bold tracking-wide">{title}</h2>
        </div>
        <div className="space-y-3 p-4 text-sm">
          {orderNum != null ? (
            <p className="theme-text-muted text-xs">
              Cash Sales #{orderNum}
            </p>
          ) : null}
          <p>
            Was <strong>{formatSaleKes(delta.originalTotal)}</strong> → now{" "}
            <strong>{formatSaleKes(delta.newTotal)}</strong>.
          </p>
          <p className="font-medium text-[var(--theme-text)]">
            {isReturn
              ? `Customer receives ${formatSaleKes(delta.amount)} back.`
              : `Customer pays ${formatSaleKes(delta.amount)} extra.`}
          </p>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
              Paid by (method code)
            </span>
            <input
              ref={methodRef}
              className={inputCls}
              value={methodInput}
              onChange={(e) => {
                setMethodInput(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="C, M, E, ECO…"
              autoComplete="off"
            />
            <span className="theme-subtext block text-[10px]">{posPaymentMethodHint()}</span>
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
              {amountLabel}
            </span>
            <input className={inputCls} value={formatSaleKes(delta.amount)} readOnly />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
              Reference (optional)
            </span>
            <input
              className={inputCls}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="M-Pesa code, bank ref…"
            />
          </label>
          {error ? (
            <p className="theme-alert-error rounded px-3 py-2 text-xs">{error}</p>
          ) : null}
        </div>
        <div className={POS_DIALOG_FOOTER}>
          <button type="button" className={POS_DIALOG_SECONDARY_BTN} onClick={() => onCancel?.()}>
            Cancel
          </button>
          <button type="button" className={POS_DIALOG_PRIMARY_BTN} onClick={submit}>
            Save &amp; continue
          </button>
        </div>
      </div>
    </div>
  );
}
