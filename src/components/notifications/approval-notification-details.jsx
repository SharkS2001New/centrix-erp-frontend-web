"use client";

import { useState } from "react";
import { apiFetchBlob, ApiError, resolveProtectedFileUrl } from "@/lib/api";
import { notifyError } from "@/lib/notify";

function formatKes(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  return `Ksh ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function approvalReason(item) {
  const request = item?.action_request;
  if (!request) return null;
  const fromPayload = request.payload?.return_reason ?? request.payload?.reason;
  const direct = request.reason;
  const value = (fromPayload ?? direct ?? "").trim();
  return value || null;
}

function approvalProof(item) {
  return item?.action_request?.payload?.proof ?? null;
}

function discountApprovalLines(item) {
  const fromTop = item?.discount_approval?.lines;
  if (Array.isArray(fromTop) && fromTop.length > 0) return fromTop;
  const fromPayload = item?.action_request?.payload?.lines;
  return Array.isArray(fromPayload) ? fromPayload : [];
}

function isDiscountApproval(item) {
  return item?.action_request?.type === "discount";
}

export function DiscountApprovalItemsTable({ item }) {
  const lines = discountApprovalLines(item);
  const orderDiscount = Number(
    item?.discount_approval?.order_discount ?? item?.action_request?.payload?.order_discount ?? 0,
  );

  if (lines.length === 0 && orderDiscount <= 0) return null;

  return (
    <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
      <table className="w-full min-w-[320px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 text-right font-medium">Unit price</th>
            <th className="px-3 py-2 text-right font-medium">Discount</th>
            <th className="px-3 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr
              key={`${line.product_code ?? line.product_name ?? "line"}-${index}`}
              className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
            >
              <td className="px-3 py-2 text-slate-800 dark:text-slate-100">
                {line.product_name ?? line.product_code ?? "Item"}
              </td>
              <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">
                {formatKes(line.unit_price ?? line.selling_price)}
              </td>
              <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-200">
                {formatKes(line.discount_given)}
              </td>
              <td className="px-3 py-2 text-right font-medium text-slate-900 dark:text-slate-100">
                {formatKes(line.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orderDiscount > 0 ? (
        <p className="border-t border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
          <span className="font-medium text-slate-500 dark:text-slate-400">Order discount: </span>
          {formatKes(orderDiscount)}
        </p>
      ) : null}
    </div>
  );
}

export function ApprovalNotificationDetails({ item }) {
  const reason = approvalReason(item);
  const proof = approvalProof(item);
  const [loadingProof, setLoadingProof] = useState(false);
  const showDiscountTable = isDiscountApproval(item);

  if (!reason && !proof && !showDiscountTable) return null;

  async function openProof() {
    if (!proof?.url) return;
    setLoadingProof(true);
    try {
      const blob = await apiFetchBlob(proof.url);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not open proof file.");
    } finally {
      setLoadingProof(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-md bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
      {showDiscountTable ? <DiscountApprovalItemsTable item={item} /> : null}
      {reason ? (
        <p className="text-slate-700 dark:text-slate-200">
          <span className="font-medium text-slate-500 dark:text-slate-400">Reason: </span>
          {reason}
        </p>
      ) : null}
      {proof?.url ? (
        <p className="text-slate-700 dark:text-slate-200">
          <span className="font-medium text-slate-500 dark:text-slate-400">Proof: </span>
          <button
            type="button"
            disabled={loadingProof}
            onClick={(e) => {
              e.stopPropagation();
              void openProof();
            }}
            className="font-medium text-[#185FA5] hover:underline disabled:opacity-50"
          >
            {loadingProof ? "Opening…" : proof.file_name ?? "View attachment"}
          </button>
        </p>
      ) : null}
    </div>
  );
}

export function resolveApprovalProofUrl(proof) {
  if (!proof?.url) return null;
  return resolveProtectedFileUrl(proof.url);
}

export function isDiscountApprovalNotification(item) {
  return isDiscountApproval(item);
}
