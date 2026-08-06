"use client";

import { posModalOverlayClass, posModalPanelClass, renderPosModalPortal } from "@/lib/pos-modal-shell";

const PRIMARY_BTN =
  "theme-primary-btn flex w-full items-center justify-center gap-2 rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BTN =
  "theme-secondary-btn flex w-full items-center justify-center gap-2 rounded-lg px-3 py-3 text-xs font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Shown when checkout fails because one or more cart products are missing on the KRA device.
 */
export function PosKraProductUploadDialog({
  open,
  productCodes = [],
  productLabels = [],
  busy = false,
  error = null,
  onUpload,
  onClose,
}) {
  if (!open) return null;

  const labels =
    productLabels.length > 0
      ? productLabels
      : productCodes.map((code) => String(code));

  return renderPosModalPortal(
    <div className={posModalOverlayClass} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pos-kra-upload-title"
        className={`${posModalPanelClass} max-w-md`}
      >
        <div className="theme-dialog-header px-4 py-3">
          <h2 id="pos-kra-upload-title" className="text-center text-sm font-bold tracking-wide">
            Upload to KRA device
          </h2>
        </div>
        <div className="space-y-3 p-4 text-sm">
          <p className="theme-subtext">
            This sale cannot be fiscalized until the product
            {productCodes.length === 1 ? "" : "s"} below are registered on the KRA device.
          </p>
          <ul className="max-h-40 list-inside list-disc overflow-y-auto rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            {labels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          {error ? (
            <p className="theme-alert-error rounded px-3 py-2 text-sm">{error}</p>
          ) : null}
          <p className="theme-subtext text-xs">
            After upload succeeds, the sale will complete automatically and the receipt will print.
          </p>
        </div>
        <div className="theme-dialog-footer grid grid-cols-2 gap-2 p-3">
          <button type="button" className={SECONDARY_BTN} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={PRIMARY_BTN} onClick={onUpload} disabled={busy}>
            {busy ? "Uploading…" : "Upload now"}
          </button>
        </div>
      </div>
    </div>,
  );
}
