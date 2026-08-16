"use client";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];

export function PinKeypad({
  value,
  onChange,
  onSubmit,
  disabled = false,
  maxLength = 6,
  className = "",
}) {
  function press(key) {
    if (disabled) return;
    if (key === "clear") {
      onChange("");
      return;
    }
    if (key === "back") {
      onChange(String(value ?? "").slice(0, -1));
      return;
    }
    const next = `${value ?? ""}${key}`.replace(/\D/g, "").slice(0, maxLength);
    onChange(next);
    if (next.length >= 4 && next.length === maxLength && onSubmit) {
      window.setTimeout(() => onSubmit(next), 0);
    }
  }

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          disabled={disabled}
          onClick={() => press(key)}
          className="h-14 rounded-xl border border-slate-200 bg-white text-lg font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {key === "clear" ? "C" : key === "back" ? "⌫" : key}
        </button>
      ))}
    </div>
  );
}

export function PinDots({ length, filled }) {
  const slots = Math.max(4, Math.min(6, length || 4));
  return (
    <div className="flex justify-center gap-2" aria-hidden>
      {Array.from({ length: slots }).map((_, i) => (
        <span
          key={i}
          className={`h-3 w-3 rounded-full border ${
            i < filled
              ? "border-indigo-600 bg-indigo-600"
              : "border-slate-300 bg-transparent dark:border-slate-600"
          }`}
        />
      ))}
    </div>
  );
}
