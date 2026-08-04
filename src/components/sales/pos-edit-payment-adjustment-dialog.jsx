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
 * Enter (any field) confirms — Alt+P / Reprint callers then save and reprint the receipt.
 */
export function PosEditPaymentAdjustmentDialog({
  open,
  delta,
  orderNum,
  paymentMethods = [],
  confirmLabel = "Save & reprint",
  onConfirm,
  onCancel,
}) {
  const methodRef = useRef(null);
  const submittingRef = useRef(false);
  const [methodInput, setMethodInput] = useState("C");
  const [reference, setReference] = useState("");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      submittingRef.current = false;
      return;
    }
    setMethodInput("C");
    setReference("");
    setError(null);
    submittingRef.current = false;
    const t = window.setTimeout(() => {
      methodRef.current?.focus();
      methodRef.current?.select?.();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, delta?.amount, delta?.type]);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (submittingRef.current) return;
      onCancel?.();
    }
    // Capture so POS shell shortcuts cannot eat Esc while this dialog is open.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onCancel]);

  if (!open || !delta?.type || !(Number(delta.amount) > 0)) {
    return null;
  }

  const isReturn = delta.type === "return";
  const title = "Payment Breakdown";
  const amountLabel = isReturn ? "Return amount" : "Top-up amount";

  function submit() {
    if (submittingRef.current) return;
    const methodCode = resolvePosPaymentMethodCode(methodInput, paymentMethods);
    if (!methodCode) {
      setError("Enter a payment method (e.g. C, M, E, ECO).");
      methodRef.current?.focus();
      return;
    }
    const matched = paymentMethods.find(
      (m) => String(m.method_code ?? "").toUpperCase() === methodCode,
    );
    if (
      paymentMethods.length > 0 &&
      !matched &&
      !["CASH", "MPESA", "EQUITY", "KCB", "ECOBANK", "BANK", "CARD"].includes(methodCode)
    ) {
      setError(`Payment method ${methodCode} is not configured.`);
      methodRef.current?.focus();
      return;
    }
    if (matched?.requires_reference && !reference.trim()) {
      setError("Enter a reference for this payment method.");
      return;
    }
    submittingRef.current = true;
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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-edit-payment-breakdown-title"
        className={`relative w-full max-w-md ${POS_DIALOG_SHELL}`}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            submit();
          }}
        >
          <div className={POS_DIALOG_HEADER}>
            <h2
              id="pos-edit-payment-breakdown-title"
              className="text-center text-sm font-bold tracking-wide"
            >
              {title}
            </h2>
          </div>
          <div className="space-y-3 p-4 text-sm">
            {orderNum != null ? (
              <p className="theme-text-muted text-xs">Cash Sales #{orderNum}</p>
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
                name="payment_method"
                className={inputCls}
                value={methodInput}
                onChange={(e) => {
                  setMethodInput(e.target.value);
                  setError(null);
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
              <input className={inputCls} value={formatSaleKes(delta.amount)} readOnly tabIndex={-1} />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
                Reference (optional)
              </span>
              <input
                name="payment_reference"
                className={inputCls}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="M-Pesa code, bank ref…"
                autoComplete="off"
              />
            </label>
            {error ? (
              <p className="theme-alert-error rounded px-3 py-2 text-xs">{error}</p>
            ) : null}
            <p className="theme-subtext text-[10px]">
              Press Enter to {String(confirmLabel).toLowerCase()}. Esc cancels.
            </p>
          </div>
          <div className={POS_DIALOG_FOOTER}>
            <button
              type="button"
              className={POS_DIALOG_SECONDARY_BTN}
              onClick={() => {
                if (submittingRef.current) return;
                onCancel?.();
              }}
            >
              Cancel
            </button>
            <button type="submit" className={POS_DIALOG_PRIMARY_BTN}>
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
