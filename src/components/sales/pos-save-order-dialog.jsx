"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "@/lib/api";

import { INPUT_CLASS } from "@/components/catalog/catalog-shared";

const inputCls = INPUT_CLASS;

export function PosSaveOrderDialog({
  open,
  onClose,
  saving,
  error,
  onSave,
  mode = "save",
  saveStatusLabel = "",
  workflowPipeline = [],
}) {
  const isHold = mode === "hold";
  const [mounted, setMounted] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [isWalkIn, setIsWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState("");
  const [customerNum, setCustomerNum] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    setIsWalkIn(false);
    setWalkInName("");
    setCustomerNum("");
    setLocalError(null);
    setLoading(true);
    apiRequest("/customers", { searchParams: { per_page: 200 } })
      .then((res) => setCustomers(res.data ?? []))
      .catch(() => setLocalError("Failed to load customers."))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape" && !saving) onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  function handleSave(mode = "save") {
    if (isWalkIn) {
      const name = walkInName.trim();
      if (!name) {
        setLocalError("Enter the walk-in customer's name.");
        return;
      }
      onSave?.({ walkIn: true, walkInName: name, hold: mode === "hold" });
      return;
    }
    if (!customerNum) {
      setLocalError(isHold ? "Select a customer to hold this order." : "Select a customer to save this order.");
      return;
    }
    const customer = customers.find((c) => String(c.customer_num) === customerNum);
    if (!customer) {
      setLocalError("Select a valid customer.");
      return;
    }
    onSave?.({ walkIn: false, customer, hold: mode === "hold" });
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="theme-modal flex w-full max-w-md flex-col overflow-hidden rounded-lg border shadow-2xl"
      >
        <div className={`px-4 py-3 text-white ${isHold ? "bg-amber-700" : "bg-[var(--theme-primary)]"}`}>
          <h2 className="text-center text-sm font-bold tracking-wide">
            {isHold ? "HOLD ORDER" : "SAVE ORDER"}
          </h2>
          {isHold ? (
            <p className="mt-1 text-center text-[11px] text-amber-100">
              Stock is deducted when the order is held.
            </p>
          ) : saveStatusLabel ? (
            <p className="mt-1 text-center text-[11px] text-blue-100">
              Workflow status: <strong>{saveStatusLabel}</strong>
              {" · "}
              Created via: <strong>Backoffice</strong>
            </p>
          ) : null}
        </div>
        <div className="p-4">
          {!isHold && workflowPipeline.length > 0 ? (
            <p className="theme-panel mb-3 rounded border px-2.5 py-2 text-[11px] text-[var(--theme-text-muted)]">
              <span className="font-semibold text-[var(--theme-accent-text)]">Order flow: </span>
              {workflowPipeline.map((s) => s.label).join(" → ")}
            </p>
          ) : null}
          {!isWalkIn ? (
            <label className="block">
              <span className="theme-accent-label mb-0.5 block text-[11px] font-bold uppercase tracking-wide">
                Customer
              </span>
              <select
                className={inputCls}
                value={customerNum}
                onChange={(e) => {
                  setCustomerNum(e.target.value);
                  setLocalError(null);
                }}
                disabled={loading || saving}
              >
                <option value="">— Select customer —</option>
                {customers.map((c) => (
                  <option key={c.customer_num} value={String(c.customer_num)}>
                    {c.customer_name ?? `Customer #${c.customer_num}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className="theme-accent-label mb-0.5 block text-[11px] font-bold uppercase tracking-wide">
                Walk-in customer name
              </span>
              <input
                type="text"
                className={inputCls}
                value={walkInName}
                onChange={(e) => {
                  setWalkInName(e.target.value);
                  setLocalError(null);
                }}
                placeholder="Customer name"
                disabled={saving}
                autoFocus
              />
            </label>
          )}

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isWalkIn}
              onChange={(e) => {
                setIsWalkIn(e.target.checked);
                if (e.target.checked) {
                  setCustomerNum("");
                } else {
                  setWalkInName("");
                }
                setLocalError(null);
              }}
              disabled={saving}
            />
            Walk-in customer
          </label>

          {error || localError ? (
            <p className="theme-alert-error mt-3 rounded px-3 py-2 text-sm">
              {error || localError}
            </p>
          ) : null}
        </div>
        <div className="theme-dialog-footer grid grid-cols-2 gap-2 p-3">
          {isHold ? (
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => handleSave("hold")}
              className="theme-accent-btn rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Holding…" : "Hold order"}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => handleSave("save")}
              className="theme-primary-btn rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save order"}
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="theme-secondary-btn rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
