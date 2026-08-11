"use client";

import { ACTION_ERROR_CLASS } from "@/lib/action-feedback";
import { formatPosBrowseLabel } from "@/lib/sales";

export function PosOrderEditBar({
  enabled,
  busy,
  loading = false,
  orderNo,
  onOrderNoChange,
  onSubmit,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
  hasOrders = false,
  buttonClassName = "pos-header-action-btn",
  error,
  allowNameSearch = false,
  nameResults = null,
  nameLoading = false,
  nameHighlightIndex = 0,
  onNameHighlightChange,
  onSelectNameResult,
  onClearNameSearch,
}) {
  if (!enabled) return null;

  const nameDropdownOpen =
    allowNameSearch && (nameLoading || Array.isArray(nameResults));
  const nameMatches = Array.isArray(nameResults) ? nameResults : [];

  function handleSubmit(event) {
    event.preventDefault();
    if (nameDropdownOpen && nameMatches.length > 0) {
      const idx = Math.min(
        Math.max(0, Number(nameHighlightIndex) || 0),
        nameMatches.length - 1,
      );
      onSelectNameResult?.(nameMatches[idx]);
      return;
    }
    onSubmit?.();
  }

  function handleKeyDown(event) {
    if (!nameDropdownOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClearNameSearch?.();
      return;
    }
    if (event.key === "ArrowDown" && nameMatches.length > 0) {
      event.preventDefault();
      onNameHighlightChange?.(
        Math.min((Number(nameHighlightIndex) || 0) + 1, nameMatches.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp" && nameMatches.length > 0) {
      event.preventDefault();
      onNameHighlightChange?.(Math.max((Number(nameHighlightIndex) || 0) - 1, 0));
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="pos-order-edit-bar flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          disabled={busy || !canGoPrevious}
          onClick={() => onPrevious?.()}
          className={`${buttonClassName} shrink-0 disabled:opacity-50`}
          title={
            canGoPrevious
              ? "Older completed order (or open current from new sale)"
              : hasOrders
                ? "Already at oldest order"
                : "No completed orders yet"
          }
          aria-label="Previous order"
        >
          <span aria-hidden>←</span>
        </button>
        <form onSubmit={handleSubmit} className="relative flex min-w-0 flex-1 items-center gap-1">
          <input
            type="text"
            inputMode={allowNameSearch ? "text" : "numeric"}
            pattern={allowNameSearch ? undefined : "[0-9]*"}
            className="pos-order-edit-input min-w-[5.5rem] flex-1 py-1.5 text-sm"
            placeholder={allowNameSearch ? "Cash Sales # or customer name" : "Cash Sales #"}
            value={orderNo}
            disabled={busy}
            onChange={(e) => {
              const raw = e.target.value;
              onOrderNoChange?.(allowNameSearch ? raw : raw.replace(/\D/g, ""));
            }}
            onKeyDown={handleKeyDown}
            aria-label="POS Cash Sales number or customer name to edit"
            aria-autocomplete={allowNameSearch ? "list" : undefined}
            aria-expanded={nameDropdownOpen || undefined}
          />
          <button
            type="submit"
            disabled={busy || !String(orderNo ?? "").trim()}
            className={`${buttonClassName} shrink-0 disabled:opacity-50`}
          >
            {loading ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
                Loading…
              </span>
            ) : (
              "Edit"
            )}
          </button>
          {nameDropdownOpen ? (
            <div
              className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-lg"
              role="listbox"
            >
              {nameLoading ? (
                <div className="theme-subtext px-3 py-2 text-xs">Searching…</div>
              ) : nameMatches.length === 0 ? (
                <div className="theme-subtext px-3 py-2 text-xs">No matching orders</div>
              ) : (
                nameMatches.map((row, index) => {
                  const active = index === (Number(nameHighlightIndex) || 0);
                  const ticket = formatPosBrowseLabel(row);
                  const customer =
                    row.customer_name ||
                    row.customer?.customer_name ||
                    row.customer_num ||
                    "—";
                  return (
                    <button
                      key={String(row.id ?? `${ticket}-${index}`)}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs ${
                        active
                          ? "bg-[var(--theme-primary-subtle)]"
                          : "hover:bg-[var(--theme-hover)]"
                      }`}
                      onMouseEnter={() => onNameHighlightChange?.(index)}
                      onClick={() => onSelectNameResult?.(row)}
                    >
                      <span className="font-semibold tabular-nums text-[var(--theme-text)]">
                        #{ticket}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[var(--theme-text)]">
                        {customer}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </form>
        <button
          type="button"
          disabled={busy || !canGoNext}
          onClick={() => onNext?.()}
          className={`${buttonClassName} shrink-0 disabled:opacity-50`}
          title={
            canGoNext
              ? "Newer completed order / return to new sale"
              : hasOrders
                ? "Already at newest order"
                : "No completed orders yet"
          }
          aria-label="Next order"
        >
          <span aria-hidden>→</span>
        </button>
      </div>
      {error ? (
        <p className={`${ACTION_ERROR_CLASS} px-1 py-2 text-xs`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
