"use client";

import { useState } from "react";
import { INPUT_CLASS } from "@/components/catalog/catalog-shared";

export function PosOrderEditBar({
  enabled,
  busy,
  lastOrderNum,
  onEditLast,
  onEditByOrderNumber,
  error,
}) {
  const [orderNo, setOrderNo] = useState("");

  if (!enabled) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmed = orderNo.trim();
    if (!trimmed) return;
    await onEditByOrderNumber?.(trimmed);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          disabled={busy || !lastOrderNum}
          onClick={() => onEditLast?.()}
          className="pos-header-btn shrink-0 disabled:opacity-50"
          title={
            lastOrderNum
              ? `Edit previous order #${lastOrderNum}`
              : "Complete an order first to edit the last receipt"
          }
        >
          <span aria-hidden>←</span>
          <span className="hidden sm:inline">Previous order</span>
        </button>
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className={`${INPUT_CLASS} pos-order-edit-input min-w-0 flex-1 py-1.5 text-sm`}
            placeholder="Order # to edit"
            value={orderNo}
            disabled={busy}
            onChange={(e) => setOrderNo(e.target.value.replace(/\D/g, ""))}
            aria-label="Order number to edit"
          />
          <button
            type="submit"
            disabled={busy || !orderNo.trim()}
            className="pos-header-btn shrink-0 disabled:opacity-50"
          >
            Edit
          </button>
        </form>
      </div>
      {error ? (
        <p className="px-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
