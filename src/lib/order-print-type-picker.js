/** Promise-based picker when org enables both thermal receipt and A4 invoice. */

const PICK_EVENT = "centrix:order-print-type-pick";

let pendingResolve = null;

export function requestOrderPrintType() {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    pendingResolve = resolve;
    window.dispatchEvent(new CustomEvent(PICK_EVENT));
  });
}

export function resolveOrderPrintType(type) {
  if (!pendingResolve) return;
  const resolve = pendingResolve;
  pendingResolve = null;
  resolve(type === "receipt" || type === "invoice" ? type : null);
}

export function cancelOrderPrintTypePick() {
  resolveOrderPrintType(null);
}

export const ORDER_PRINT_TYPE_PICK_EVENT = PICK_EVENT;
