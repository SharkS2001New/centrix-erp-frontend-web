"use client";

import { useEffect, useMemo, useState } from "react";

const ROW_1 = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const ROW_2 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"];
const ROW_3 = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
const ROW_4 = ["Z", "X", "C", "V", "B", "N", "M", "-", "."];

/**
 * Full-screen alphabetic keypad for touch POS search (no physical keyboard).
 */
export function TouchSearchKeypad({
  open,
  title = "Search",
  value = "",
  placeholder = "Type to search…",
  maxLength = 48,
  onChange,
  onClose,
  onDone,
}) {
  const [draft, setDraft] = useState(String(value ?? ""));

  useEffect(() => {
    if (open) setDraft(String(value ?? ""));
  }, [open, value]);

  const display = useMemo(() => String(draft ?? ""), [draft]);

  if (!open) return null;

  function emit(next) {
    const clipped = String(next ?? "").slice(0, maxLength);
    setDraft(clipped);
    onChange?.(clipped);
  }

  function push(ch) {
    emit(`${display}${ch}`);
  }

  function backspace() {
    emit(display.slice(0, -1));
  }

  function clearAll() {
    emit("");
  }

  function Key({ label, onClick, className = "", wide = false }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`theme-secondary-btn min-h-[2.75rem] rounded-xl text-base font-bold active:scale-[0.97] sm:min-h-[3rem] sm:text-lg ${
          wide ? "col-span-2" : ""
        } ${className}`}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-2 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="touch-search-keypad w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-2xl">
        <div className="border-b border-[var(--theme-border)] px-3 py-3 sm:px-4">
          <p className="text-center text-[11px] font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
            {title}
          </p>
          <p
            className={`mt-2 min-h-[2.5rem] rounded-xl border border-[var(--theme-border)] bg-[var(--theme-page-bg)] px-3 py-2 text-center text-xl font-semibold tracking-wide text-[var(--theme-text)] ${
              display ? "" : "theme-subtext font-medium"
            }`}
          >
            {display || placeholder}
          </p>
        </div>

        <div className="space-y-1.5 p-2 sm:space-y-2 sm:p-3">
          <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
            {ROW_1.map((k) => (
              <Key key={k} label={k} onClick={() => push(k)} />
            ))}
          </div>
          <div className="grid grid-cols-10 gap-1 sm:gap-1.5">
            {ROW_2.map((k) => (
              <Key key={k} label={k} onClick={() => push(k.toLowerCase())} />
            ))}
          </div>
          <div className="mx-auto grid w-[90%] grid-cols-9 gap-1 sm:gap-1.5">
            {ROW_3.map((k) => (
              <Key key={k} label={k} onClick={() => push(k.toLowerCase())} />
            ))}
          </div>
          <div className="mx-auto grid w-[82%] grid-cols-9 gap-1 sm:gap-1.5">
            {ROW_4.map((k) => (
              <Key key={k} label={k} onClick={() => push(k === "-" || k === "." ? k : k.toLowerCase())} />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            <Key label="Clear" onClick={clearAll} className="text-xs uppercase sm:text-sm" />
            <Key label="Space" onClick={() => push(" ")} wide className="text-xs uppercase sm:text-sm" />
            <Key label="⌫" onClick={backspace} className="text-lg" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-[var(--theme-border)] p-3">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="theme-secondary-btn min-h-[3rem] rounded-xl text-sm font-bold uppercase tracking-wide"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => {
              onDone?.(display);
              onClose?.();
            }}
            className="theme-primary-btn min-h-[3rem] rounded-xl text-sm font-bold uppercase tracking-wide"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** Search input that opens TouchSearchKeypad when the platform setting is on. */
export function TouchSearchField({
  id,
  value,
  onChange,
  placeholder,
  enabled,
  className,
  title = "Search",
  inputRef,
  autoComplete = "off",
  onKeyDown,
  disabled = false,
  ...inputProps
}) {
  const [open, setOpen] = useState(false);
  const {
    onFocus: extraOnFocus,
    onClick: extraOnClick,
    ...restInputProps
  } = inputProps;

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        disabled={disabled}
        readOnly={Boolean(enabled)}
        inputMode={enabled ? "none" : "search"}
        onChange={enabled ? undefined : (e) => onChange?.(e.target.value)}
        onKeyDown={enabled ? undefined : onKeyDown}
        onFocus={(e) => {
          if (disabled) return;
          if (enabled) setOpen(true);
          extraOnFocus?.(e);
        }}
        onClick={(e) => {
          if (disabled) return;
          if (enabled) setOpen(true);
          extraOnClick?.(e);
        }}
        placeholder={placeholder}
        className={className}
        autoComplete={autoComplete}
        {...restInputProps}
      />
      {enabled ? (
        <TouchSearchKeypad
          open={open}
          title={title}
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          onClose={() => setOpen(false)}
          onDone={onChange}
        />
      ) : null}
    </>
  );
}

