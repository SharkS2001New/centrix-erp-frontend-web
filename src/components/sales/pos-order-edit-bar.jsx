"use client";

export function PosOrderEditBar({
  enabled,
  busy,
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
}) {
  if (!enabled) return null;

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit?.();
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="pos-order-edit-bar flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          disabled={busy || !canGoPrevious}
          onClick={() => onPrevious?.()}
          className={`${buttonClassName} shrink-0 disabled:opacity-50`}
          title={canGoPrevious ? "Older completed order" : hasOrders ? "Already at oldest order" : "No completed orders yet"}
          aria-label="Previous order"
        >
          <span aria-hidden>←</span>
        </button>
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="pos-order-edit-input min-w-[5.5rem] flex-1 py-1.5 text-sm"
            placeholder="Order #"
            value={orderNo}
            disabled={busy}
            onChange={(e) => onOrderNoChange?.(e.target.value.replace(/\D/g, ""))}
            aria-label="Order number to edit"
          />
          <button
            type="submit"
            disabled={busy || !String(orderNo ?? "").trim()}
            className={`${buttonClassName} shrink-0 disabled:opacity-50`}
          >
            Edit
          </button>
        </form>
        <button
          type="button"
          disabled={busy || !canGoNext}
          onClick={() => onNext?.()}
          className={`${buttonClassName} shrink-0 disabled:opacity-50`}
          title={canGoNext ? "Newer completed order" : hasOrders ? "Already at newest order" : "No completed orders yet"}
          aria-label="Next order"
        >
          <span aria-hidden>→</span>
        </button>
      </div>
      {error ? (
        <p className="px-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
