import { createPortal } from "react-dom";

/** Backoffice POS uses absolute overlays inside `.pos-workspace`; external POS uses full-viewport fixed layers. */
export function posModalOverlayClass(embedded, zIndex = "z-50") {
  return embedded ? `absolute inset-0 ${zIndex}` : `fixed inset-0 ${zIndex}`;
}

export function renderPosModalPortal(content, embedded) {
  if (embedded) return content;
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
