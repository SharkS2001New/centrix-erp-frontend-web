"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inputClassName } from "@/components/catalog/catalog-shared";
import {
  discountApprovalDiscountPerUnit,
  discountApprovalUnitPrice,
  formatAdvisedDiscountKes,
} from "@/lib/advised-discount-lines";

function linesForAdvisedInput(approvalLines) {
  const withDiscount = (approvalLines ?? []).filter(
    (line) => Number(line?.discount_given ?? 0) > 0.001,
  );
  return withDiscount.length > 0 ? withDiscount : approvalLines ?? [];
}

export function DiscountRejectionDialog({
  open,
  onSubmit,
  onCancel,
  busy = false,
  approvalLines = [],
  title = "Reject discount request",
  description = "Tell the salesperson why the discount was rejected and what they should do next.",
}) {
  const [reason, setReason] = useState("");
  const [guidance, setGuidance] = useState("remove_discount");
  const [advisedByCode, setAdvisedByCode] = useState(() => new Map());
  const [error, setError] = useState("");
  const fieldId = useId();
  const reasonRef = useRef(null);

  const advisedInputLines = useMemo(() => linesForAdvisedInput(approvalLines), [approvalLines]);

  useEffect(() => {
    if (!open) return undefined;
    setReason("");
    setGuidance("remove_discount");
    const initial = new Map();
    for (const line of advisedInputLines) {
      const code = String(line?.product_code ?? "").trim();
      if (!code) continue;
      const current = discountApprovalDiscountPerUnit(line);
      initial.set(code, Number.isFinite(current) ? String(current) : "");
    }
    setAdvisedByCode(initial);
    setError("");
    const timer = window.setTimeout(() => reasonRef.current?.focus(), 0);

    function onKeyDown(event) {
      if (event.key === "Escape" && !busy) onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, busy, onCancel, advisedInputLines]);

  if (!open || typeof document === "undefined") return null;

  function handleSubmit(event) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      setError("Please enter a rejection reason of at least 3 characters.");
      return;
    }

    let advisedDiscountLines = null;
    let advisedDiscountAmount = null;

    if (guidance === "advised_amount") {
      if (!advisedInputLines.length) {
        setError("No order lines are available to advise discounts for.");
        return;
      }

      advisedDiscountLines = [];
      for (const line of advisedInputLines) {
        const code = String(line?.product_code ?? "").trim();
        if (!code) continue;
        const raw = String(advisedByCode.get(code) ?? "").trim();
        const parsed = Number(raw);
        if (!Number.isFinite(parsed) || parsed < 0) {
          setError(`Enter a valid advised discount for ${line.product_name ?? code}.`);
          return;
        }
        advisedDiscountLines.push({
          product_code: code,
          advised_discount: parsed,
        });
      }

      if (!advisedDiscountLines.length) {
        setError("Enter the advised discount for each item.");
        return;
      }

      advisedDiscountAmount = advisedDiscountLines.reduce(
        (sum, line) => sum + Number(line.advised_discount ?? 0),
        0,
      );
    }

    onSubmit({
      reason: trimmedReason,
      discount_guidance: guidance,
      advised_discount_lines: advisedDiscountLines,
      advised_discount_amount: advisedDiscountAmount,
    });
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="theme-modal max-h-[min(92vh,760px)] w-full max-w-3xl overflow-y-auto rounded-xl border p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-title`}
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <h2 id={`${fieldId}-title`} className="theme-heading text-base font-semibold">
            {title}
          </h2>
          <p className="theme-subtext mt-2 text-sm">{description}</p>

          <fieldset className="mt-5 space-y-3">
            <legend className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              Discount guidance <span className="text-red-600">*</span>
            </legend>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm">
              <input
                type="radio"
                name={`${fieldId}-guidance`}
                value="remove_discount"
                checked={guidance === "remove_discount"}
                disabled={busy}
                onChange={() => setGuidance("remove_discount")}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-slate-900 dark:text-slate-100">Remove discount</span>
                <span className="mt-0.5 block text-slate-500">The order should be edited with no discount applied.</span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm">
              <input
                type="radio"
                name={`${fieldId}-guidance`}
                value="advised_amount"
                checked={guidance === "advised_amount"}
                disabled={busy}
                onChange={() => setGuidance("advised_amount")}
                className="mt-0.5"
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium text-slate-900 dark:text-slate-100">Advise discount amount</span>
                <span className="mt-0.5 block text-slate-500">
                  Enter the discount staff may apply for each item.
                </span>
                {guidance === "advised_amount" ? (
                  advisedInputLines.length > 0 ? (
                    <div className="mt-3 overflow-x-auto rounded-lg border">
                      <table className="w-full min-w-[520px] border-collapse text-xs">
                        <thead>
                          <tr className="border-b bg-slate-50 text-left text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                            <th className="px-3 py-2 font-medium">Item</th>
                            <th className="px-3 py-2 text-right font-medium">Unit price</th>
                            <th className="px-3 py-2 text-right font-medium">Requested</th>
                            <th className="px-3 py-2 text-right font-medium">Advised discount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {advisedInputLines.map((line) => {
                            const code = String(line?.product_code ?? "").trim();
                            return (
                              <tr key={code || line.product_name} className="border-b last:border-b-0">
                                <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                                  {line.product_name ?? code ?? "Item"}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">
                                  {formatAdvisedDiscountKes(discountApprovalUnitPrice(line))}
                                </td>
                                <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">
                                  {formatAdvisedDiscountKes(discountApprovalDiscountPerUnit(line))}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={advisedByCode.get(code) ?? ""}
                                    disabled={busy || !code}
                                    className={`${inputClassName()} w-28 text-right`}
                                    onChange={(event) => {
                                      const value = event.target.value;
                                      setAdvisedByCode((prev) => {
                                        const next = new Map(prev);
                                        next.set(code, value);
                                        return next;
                                      });
                                      if (error) setError("");
                                    }}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No discounted items found on this request.</p>
                  )
                ) : null}
              </span>
            </label>
          </fieldset>

          <div className="mt-5">
            <label
              htmlFor={`${fieldId}-reason`}
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              Reason for rejection <span className="text-red-600">*</span>
            </label>
            <textarea
              ref={reasonRef}
              id={`${fieldId}-reason`}
              rows={4}
              value={reason}
              disabled={busy}
              required
              aria-required="true"
              placeholder="Explain why the requested discount was not approved…"
              className={`${inputClassName()} w-full resize-y`}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError("");
              }}
            />
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          </div>

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg border border-red-200 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Rejecting…" : "Reject discount"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
