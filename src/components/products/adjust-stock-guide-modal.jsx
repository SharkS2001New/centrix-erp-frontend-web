"use client";

import Link from "next/link";

function GuideLink({ href, title, description }) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-slate-200 bg-white px-4 py-3 hover:border-[#185FA5]/40 hover:bg-slate-50"
    >
      <p className="text-sm font-semibold text-[#185FA5]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p>
    </Link>
  );
}

export function AdjustStockGuideModal({ open, onClose, productCode = null }) {
  if (!open) return null;

  const adjustHref = productCode
    ? `/inventory/adjustments/new?product=${encodeURIComponent(productCode)}`
    : "/inventory/adjustments/new";
  const receiveHref = "/inventory/receipts/receive";

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-lg theme-panel rounded-xl border p-5 shadow-xl"
        role="dialog"
        aria-labelledby="adjust-stock-guide-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="adjust-stock-guide-title" className="text-base font-semibold text-slate-900">
              How to change stock
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Stock quantities are controlled by the inventory ledger so every channel stays in sync.
              You cannot type stock directly on a product.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          <GuideLink
            href={adjustHref}
            title="Stock adjustments"
            description="Increase or decrease shop or store quantities for corrections, opening balances, or small changes without a supplier invoice."
          />
          <GuideLink
            href={receiveHref}
            title="Goods received"
            description="Record stock that arrived from a supplier (with or without a purchase order). Choose shop or store per receipt."
          />
          <GuideLink
            href="/inventory/stock-take"
            title="Stock take"
            description="Reconcile physical counts across many products at once. Use after a full count, not for a single quick change."
          />
          <GuideLink
            href="/inventory/transfers/new"
            title="Transfer stock"
            description="Move quantity between shop and store without changing total branch stock."
          />
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Shop and store are tracked separately. After any change, check{" "}
          <Link href="/inventory/stock" className="text-[#185FA5] hover:underline">
            Stock levels
          </Link>{" "}
          or the product list with your branch selected.
        </p>
      </div>
    </div>
  );
}

export function AdjustStockGuideTrigger({ onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left text-sm font-medium text-[#185FA5] hover:underline ${className}`}
    >
      Want to adjust stock? Click here for guidance
    </button>
  );
}
