/** Promise-based picker when org enables both thermal receipt and A4 invoice. */

const PICK_EVENT = "centrix:order-print-type-pick";
const PICK_TIMEOUT_MS = 120_000;

let pendingResolve = null;
let pickTimeoutId = null;

function finishPick(type) {
  if (pickTimeoutId != null) {
    window.clearTimeout(pickTimeoutId);
    pickTimeoutId = null;
  }
  if (!pendingResolve) return;
  const resolve = pendingResolve;
  pendingResolve = null;
  resolve(type === "receipt" || type === "invoice" ? type : null);
}

export function requestOrderPrintType() {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    pendingResolve = resolve;
    pickTimeoutId = window.setTimeout(() => {
      pickTimeoutId = null;
      if (pendingResolve === resolve) {
        pendingResolve = null;
        resolve(null);
      }
    }, PICK_TIMEOUT_MS);
    window.dispatchEvent(new CustomEvent(PICK_EVENT));
  });
}

export function resolveOrderPrintType(type) {
  finishPick(type);
}

export function cancelOrderPrintTypePick() {
  finishPick(null);
}

export const ORDER_PRINT_TYPE_PICK_EVENT = PICK_EVENT;
