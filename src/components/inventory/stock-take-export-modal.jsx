"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import {
  STOCK_TAKE_EXPORT_COLUMN_OPTIONS,
  defaultStockTakeExportColumns,
  normalizeStockTakeExportColumns,
  stockTakeExportColumnStorageKey,
} from "@/components/inventory/stock-take-print";

/**
 * Choose print/Excel columns, then Print or Export Excel.
 */
export function StockTakeExportModal({
  open,
  session,
  busy = false,
  onClose,
  onPrint,
  onExcel,
}) {
  const isCompleted = String(session?.status ?? "").toLowerCase() === "completed";
  const [columns, setColumns] = useState(() =>
    defaultStockTakeExportColumns(session, { includeCounted: true }),
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !session) return;
    let saved = null;
    try {
      const raw = localStorage.getItem(stockTakeExportColumnStorageKey(session.id));
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    setColumns(
      normalizeStockTakeExportColumns(
        saved ?? defaultStockTakeExportColumns(session, { includeCounted: true }),
        session,
      ),
    );
  }, [open, session]);

  const options = useMemo(() => {
    const loc = String(session?.stock_location ?? "both");
    return STOCK_TAKE_EXPORT_COLUMN_OPTIONS.filter((opt) => {
      if (!opt.location) return true;
      if (loc === "both") return true;
      return opt.location === loc;
    });
  }, [session?.stock_location]);

  if (!open || !mounted) return null;

  function persistAndRun(action) {
    const next = normalizeStockTakeExportColumns(columns, session);
    try {
      localStorage.setItem(
        stockTakeExportColumnStorageKey(session?.id),
        JSON.stringify(next),
      );
    } catch {
      /* ignore quota */
    }
    action(next);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-take-export-title"
        className="theme-modal w-full max-w-md rounded-xl border p-5 shadow-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
        }}
      >
        <h2 id="stock-take-export-title" className="theme-heading text-[15px] font-medium">
          Print / export count sheet
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Choose which columns to include. Product name is always shown.
          {!isCompleted
            ? " Open sessions leave Counted blank on print for handwriting."
            : null}
        </p>

        <div className="mt-4 max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
          {options.map((opt) => (
            <label
              key={opt.key}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={Boolean(columns[opt.key])}
                disabled={busy}
                onChange={(e) =>
                  setColumns((prev) => ({ ...prev, [opt.key]: e.target.checked }))
                }
              />
              {opt.label}
            </label>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="text-xs font-medium text-blue-600 hover:text-blue-500 disabled:opacity-50"
            onClick={() =>
              setColumns(
                defaultStockTakeExportColumns(session, { includeCounted: true }),
              )
            }
          >
            Reset columns
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--theme-border)] pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => persistAndRun(onExcel)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? "Working…" : "Export Excel"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => persistAndRun(onPrint)}
            className="theme-primary-btn flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Preparing…" : "Print"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
