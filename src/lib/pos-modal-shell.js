import { createPortal } from "react-dom";

/**
 * Backoffice create-order (/sales/pos) modals are portaled beneath AppShell chrome
 * (sidebar z-40) with pointer-events-none overlays so navigation always works.
 * Standalone POS (/pos) keeps full-screen blocking overlays.
 */
export function posModalOverlayClass(embedded, zIndex) {
  if (embedded) {
    const z = zIndex ?? "z-[30]";
    return `pointer-events-none fixed inset-0 ${z} flex items-center justify-center p-4`;
  }
  const z = zIndex ?? "z-50";
  return `fixed inset-0 ${z} flex items-center justify-center p-4`;
}

export function posModalPanelClass(embedded, extra = "") {
  const interact = embedded ? "pointer-events-auto" : "";
  return [interact, "relative", extra].filter(Boolean).join(" ");
}

export function posModalBackdropClass(embedded) {
  return embedded ? null : "absolute inset-0 bg-black/40";
}

export function renderPosModalPortal(content) {
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
