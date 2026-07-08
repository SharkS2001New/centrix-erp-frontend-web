"use client";

import { formatAdvisedDiscountKes } from "@/lib/advised-discount-lines";

export function PosAdvisedDiscountPanel({
  lines = [],
  applying = false,
  onApply,
}) {
  if (!lines.length) return null;

  return (
    <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
      <p className="font-semibold">Manager advised discounts</p>
      <p className="mt-1 text-xs text-amber-900">
        Apply the advised amount on each line, then complete checkout to resubmit for approval.
      </p>
      <div className="mt-3 overflow-x-auto rounded-md border border-amber-200 bg-white/70">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-amber-200 text-left uppercase tracking-wide text-amber-900">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2 text-right">Requested</th>
              <th className="px-3 py-2 text-right">Advised</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const code = String(line?.product_code ?? "").trim();
              const name = line?.product_name ?? code ?? "Item";
              return (
                <tr key={code || name} className="border-b border-amber-100 last:border-0">
                  <td className="px-3 py-2">{name}</td>
                  <td className="px-3 py-2 text-right">
                    {formatAdvisedDiscountKes(line?.discount_given)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-amber-900">
                    {formatAdvisedDiscountKes(line?.advised_discount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {onApply ? (
        <button
          type="button"
          disabled={applying}
          onClick={onApply}
          className="mt-3 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
        >
          {applying ? "Applying…" : "Apply advised discounts"}
        </button>
      ) : null}
    </div>
  );
}
