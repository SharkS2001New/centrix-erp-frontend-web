"use client";

import Link from "next/link";
import {
  computeLpoLineTotals,
  computeLpoTotals,
  formatLpoAmount,
  formatLpoKes,
  lpoHasSupplierReturns,
  lpoIsCancelledReturned,
  lpoLineReturnedQty,
  lpoLineStatusLabel,
  LPO_STATUS,
} from "./lpo-shared";
import { formatLpoPackQtyDisplay } from "./lpo-product-utils";
import { LpoReceivedQtyCell } from "./lpo-received-qty";

function formatReturnedCell(line, uom) {
  const returned = lpoLineReturnedQty(line);
  if (returned <= 0) return "—";
  const ordered = Number(line.ordered_qty ?? 0);
  if (returned + 0.0001 >= ordered) return "Fully returned";
  return formatLpoPackQtyDisplay(returned, uom);
}

export function LpoDetailOrderItemsTable({ lines, uomById, lpo, lpoNo, supplierReturns = [] }) {
  const totals = computeLpoTotals(lines);
  const showReturned = lpoHasSupplierReturns(lines, supplierReturns);
  const footerLabelColSpan = showReturned ? 6 : 5;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[4%]" />
          <col className={showReturned ? "w-[24%]" : "w-[26%]"} />
          <col className={showReturned ? "w-[11%]" : "w-[12%]"} />
          <col className={showReturned ? "w-[10%]" : "w-[11%]"} />
          {showReturned ? <col className="w-[10%]" /> : null}
          <col className={showReturned ? "w-[11%]" : "w-[12%]"} />
          <col className={showReturned ? "w-[10%]" : "w-[11%]"} />
          <col className="w-[8%]" />
          <col className="w-[8%]" />
          <col className="w-[4%]" />
        </colgroup>
        <thead>
          <tr className="theme-table-head-row text-left text-xs font-medium">
            <th className="px-2 py-2">#</th>
            <th className="px-2 py-2">Product</th>
            <th className="px-2 py-2 text-right">Ordered</th>
            <th className="px-1 py-2 text-right">Received</th>
            {showReturned ? (
              <th className="px-1 py-2 text-right">Returned</th>
            ) : null}
            <th className="whitespace-nowrap px-2 py-2 text-right align-top">
              <span className="block">Cost Price</span>
              <span className="theme-subtext block font-normal">(Supplier selling price)</span>
            </th>
            <th className="whitespace-nowrap px-2 py-2 text-right align-top">
              <span className="block">Total</span>
              <span className="theme-subtext block font-normal">(Before VAT)</span>
            </th>
            <th className="px-2 py-2 text-right align-top">VAT</th>
            <th className="px-2 py-2 align-top">Status</th>
            <th className="px-2 py-2 text-right align-top">Return</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const uom = line.unit_id ? uomById.get(line.unit_id) : null;
            const { vat: lineVat } = computeLpoLineTotals(line);
            const lineReturned = lpoLineReturnedQty(line);

            return (
              <tr key={line.id} className="theme-table-body-row">
                <td className="px-2 py-2.5 align-middle theme-subtext">{i + 1}</td>
                <td className="px-2 py-2.5 align-middle">
                  <span className="theme-heading font-medium">{line.product_name}</span>
                  <span className="theme-subtext block font-mono text-[10px]">{line.product_code}</span>
                </td>
                <td className="px-2 py-2.5 text-right align-middle tabular-nums">
                  {formatLpoPackQtyDisplay(line.ordered_qty, uom)}
                </td>
                <td className="px-1 py-2.5 text-right align-middle tabular-nums">
                  <LpoReceivedQtyCell line={line} uom={uom} />
                </td>
                {showReturned ? (
                  <td className="px-1 py-2.5 text-right align-middle tabular-nums text-[var(--theme-accent-orange)]">
                    {lineReturned > 0 ? formatReturnedCell(line, uom) : "—"}
                  </td>
                ) : null}
                <td className="whitespace-nowrap px-2 py-2.5 text-right align-middle tabular-nums">
                  {formatLpoKes(line.cost_price)}
                </td>
                <td className="px-2 py-2.5 text-right align-middle font-medium tabular-nums">
                  {formatLpoKes(line.line_total)}
                </td>
                <td className="px-2 py-2.5 text-right align-middle tabular-nums theme-subtext">
                  {lineVat > 0 ? formatLpoAmount(lineVat) : "—"}
                </td>
                <td className="px-2 py-2.5 align-middle">
                  <span
                    className={
                      line.receive_status === "fully_returned"
                        ? "text-orange-700"
                        : line.receive_status === "complete"
                          ? "text-emerald-700"
                          : line.receive_status === "partial"
                            ? "text-amber-700"
                            : "text-slate-500"
                    }
                  >
                    {lpoLineStatusLabel(line)}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right align-middle">
                  {Number(line.max_return_qty) > 0 &&
                  line.receive_status !== "fully_returned" &&
                  Number(lpo.lpo_status_code) >= LPO_STATUS.AWAITING_RECEIVE &&
                  !lpoIsCancelledReturned(lpo) ? (
                    <Link
                      href={`/lpo/${lpoNo}/supplier-return?product=${encodeURIComponent(line.product_code)}`}
                      className="theme-link text-xs font-medium hover:underline"
                    >
                      Return
                    </Link>
                  ) : (
                    <span className="theme-subtext opacity-50">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {lines.length > 0 ? (
          <tfoot>
            <tr className="theme-table-footer text-xs">
              <td colSpan={footerLabelColSpan} className="px-2 py-2.5 text-right font-medium theme-subtext">
                Subtotal (Before VAT)
              </td>
              <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                {formatLpoKes(totals.subtotal)}
              </td>
              <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                {formatLpoKes(totals.vat)}
              </td>
              <td colSpan={2} className="theme-heading px-2 py-2.5 text-right font-semibold">
                Total {formatLpoKes(totals.total)}
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
