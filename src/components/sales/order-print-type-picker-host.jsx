"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ORDER_PRINT_TYPE_PICK_EVENT,
  cancelOrderPrintTypePick,
  resolveOrderPrintType,
} from "@/lib/order-print-type-picker";

export function OrderPrintTypePickerHost() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onPickRequest() {
      setOpen(true);
    }
    window.addEventListener(ORDER_PRINT_TYPE_PICK_EVENT, onPickRequest);
    return () => window.removeEventListener(ORDER_PRINT_TYPE_PICK_EVENT, onPickRequest);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        cancelOrderPrintTypePick();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!mounted || !open) return null;

  function choose(type) {
    setOpen(false);
    resolveOrderPrintType(type);
  }

  function cancel() {
    setOpen(false);
    cancelOrderPrintTypePick();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-print-type-title"
        className="w-full max-w-md theme-panel rounded-xl border p-5 shadow-xl"
      >
        <h2 id="order-print-type-title" className="text-lg font-semibold text-slate-900">
          Choose print format
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          This organization uses both thermal receipts and A4 invoices. Select which format to print.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => choose("receipt")}
            className="rounded-lg border border-slate-200 px-4 py-4 text-left hover:border-[var(--theme-primary)] hover:bg-slate-50"
          >
            <span className="block text-sm font-semibold text-slate-900">Thermal receipt</span>
            <span className="mt-1 block text-xs text-slate-500">
              Compact layout for receipt printers
            </span>
          </button>
          <button
            type="button"
            onClick={() => choose("invoice")}
            className="rounded-lg border border-slate-200 px-4 py-4 text-left hover:border-[var(--theme-primary)] hover:bg-slate-50"
          >
            <span className="block text-sm font-semibold text-slate-900">A4 sales invoice</span>
            <span className="mt-1 block text-xs text-slate-500">
              Full-page invoice for filing or delivery
            </span>
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={cancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
