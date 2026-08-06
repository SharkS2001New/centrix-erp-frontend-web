"use client";

import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
export {
  productCodesFromCartLines,
  registerProductsOnKraDevice,
  submitKraProductRegistration,
} from "@/lib/kra-product-registration";

export function KraProductUploadToolbar({
  enabled,
  filteredCount,
  busy,
  message,
  error,
  onUploadAll,
}) {
  if (!enabled) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onUploadAll}
        disabled={busy}
        className={`${SECONDARY_BTN_CLASS} gap-2 px-3 py-2.5 disabled:opacity-50`}
        title="Register the full active catalogue on the KRA device"
      >
        {busy ? "Uploading…" : "Upload all items to KRA device"}
      </button>
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <p className="theme-subtext text-xs">
        Select products in the table to upload a subset, or upload the full catalogue ({filteredCount} items).
      </p>
    </div>
  );
}
