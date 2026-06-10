"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "@/lib/api";

const inputCls =
  "w-full rounded border border-[#c4b89a] bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:border-[#185FA5]";

export function PosSaveOrderDialog({ open, onClose, saving, error, onSave }) {
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

  function handleSave() {
    if (isWalkIn) {
      const name = walkInName.trim();
      if (!name) {
        setLocalError("Enter the walk-in customer's name.");
        return;
      }
      onSave?.({ walkIn: true, walkInName: name });
      return;
    }
    if (!customerNum) {
      setLocalError("Select a customer to save this order.");
      return;
    }
    const customer = customers.find((c) => String(c.customer_num) === customerNum);
    if (!customer) {
      setLocalError("Select a valid customer.");
      return;
    }
    onSave?.({ walkIn: false, customer });
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-[#8a7a5c] bg-[#f3ebe0] shadow-2xl"
      >
        <div className="bg-[#1e3a5f] px-4 py-3 text-white">
          <h2 className="text-center text-sm font-bold tracking-wide">SAVE ORDER</h2>
        </div>
        <div className="p-4">
          {!isWalkIn ? (
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-wide text-[#4a5d23]">
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
              <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-wide text-[#4a5d23]">
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

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-800">
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
            <p className="mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error || localError}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-[#c4b89a] bg-[#ebe3d4] p-3">
          <button
            type="button"
            disabled={saving || loading}
            onClick={handleSave}
            className="rounded border border-[#6b8f3c] bg-[#e8f5d8] px-3 py-3 text-xs font-bold uppercase text-[#2d5016] hover:bg-[#d4edc0] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save order"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded border border-[#a04040] bg-[#fde8e8] px-3 py-3 text-xs font-bold uppercase text-[#7a2020] hover:bg-[#fcd4d4] disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
