"use client";

import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
export {
  productCodesFromCartLines,
  registerProductsOnKraDevice,
  submitKraProductRegistration,
} from "@/lib/kra-product-registration";

/** @param {unknown} rows */
export function normalizeKraFailedProducts(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const code = String(row.product_code ?? row.code ?? "").trim();
      const name = String(row.product_name ?? row.name ?? "").trim();
      const reason = String(row.reason ?? row.message ?? "").trim();
      if (!code && !name) return null;
      return { product_code: code, product_name: name, reason };
    })
    .filter(Boolean);
}

export function KraProductUploadToolbar({
  enabled,
  filteredCount,
  busy,
  message,
  error,
  failedProducts = [],
  onUploadAll,
  onClearFailed,
}) {
  if (!enabled) {
    return null;
  }

  const failed = normalizeKraFailedProducts(failedProducts);

  return (
    <div className="space-y-2">
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
          Select products in the table to upload a subset, or upload the full catalogue ({filteredCount}{" "}
          items). Auto-retry stops after 3 attempts — failed items need a manual upload.
        </p>
      </div>
      {failed.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium">
              {failed.length === 1
                ? "1 product failed KRA upload — retry manually"
                : `${failed.length} products failed KRA upload — retry manually`}
            </p>
            {typeof onClearFailed === "function" ? (
              <button
                type="button"
                className="text-xs font-medium text-amber-900 underline"
                onClick={onClearFailed}
              >
                Dismiss
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {failed.slice(0, 40).map((item) => (
              <span
                key={item.product_code || item.product_name}
                className="inline-flex max-w-full items-center rounded-md border border-amber-300 bg-white px-2 py-0.5 font-mono text-[11px] text-amber-950"
                title={item.reason || undefined}
              >
                {item.product_code || "—"}
                {item.product_name ? (
                  <span className="ml-1 truncate font-sans text-amber-800">{item.product_name}</span>
                ) : null}
              </span>
            ))}
            {failed.length > 40 ? (
              <span className="text-xs text-amber-800">+{failed.length - 40} more</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
