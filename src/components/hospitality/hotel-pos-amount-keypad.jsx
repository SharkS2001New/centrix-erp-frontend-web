"use client";

import { useEffect, useState } from "react";
import { formatHotelMoney } from "@/lib/hotel-pos-settings";

/**
 * Full-screen amount keypad for tap POS payment entry.
 */
export function HotelPosAmountKeypad({
  open,
  title = "Enter amount",
  initialValue = "0",
  onCancel,
  onConfirm,
}) {
  const [digits, setDigits] = useState(String(initialValue ?? "0"));

  useEffect(() => {
    if (open) setDigits(String(initialValue ?? "0"));
  }, [open, initialValue]);

  if (!open) return null;

  function push(ch) {
    setDigits((prev) => {
      let next = String(prev ?? "0");
      if (ch === "." && next.includes(".")) return next;
      if (ch === "00") {
        if (next === "0") return "0";
        if (next.includes(".") && (next.split(".")[1]?.length ?? 0) >= 2) return next;
        const candidate = `${next}00`;
        return candidate.replace(/^0+(?=\d)/, "") || "0";
      }
      if (next === "0" && ch !== ".") next = ch;
      else next = `${next}${ch}`;
      if (next.includes(".")) {
        const [w, f = ""] = next.split(".");
        next = `${w}.${f.slice(0, 2)}`;
      }
      return next.slice(0, 12);
    });
  }

  function backspace() {
    setDigits((prev) => {
      const next = String(prev ?? "0").slice(0, -1);
      return next === "" ? "0" : next;
    });
  }

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "00"];

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl">
        <div className="border-b border-[var(--theme-border)] px-4 py-3">
          <p className="text-center text-xs font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
            {title}
          </p>
          <p className="mt-2 text-center text-3xl font-bold tabular-nums text-[var(--theme-text)]">
            {formatHotelMoney(Number(digits) || 0)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          {keys.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => push(k)}
              className="theme-secondary-btn min-h-[3.25rem] rounded-xl text-xl font-bold"
            >
              {k}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 px-3 pb-3">
          <button
            type="button"
            onClick={() => setDigits("0")}
            className="theme-secondary-btn min-h-[2.75rem] rounded-xl text-xs font-bold uppercase"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={backspace}
            className="theme-secondary-btn min-h-[2.75rem] rounded-xl text-xs font-bold uppercase"
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="theme-secondary-btn min-h-[2.75rem] rounded-xl text-xs font-bold uppercase"
          >
            Cancel
          </button>
        </div>
        <div className="border-t border-[var(--theme-border)] p-3">
          <button
            type="button"
            onClick={() => onConfirm?.(Number(digits) || 0)}
            className="theme-primary-btn w-full rounded-xl py-3.5 text-sm font-bold uppercase tracking-wide"
          >
            Set amount
          </button>
        </div>
      </div>
    </div>
  );
}
