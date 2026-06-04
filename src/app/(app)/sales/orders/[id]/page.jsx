"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { formatShortDate } from "@/components/catalog/catalog-shared";
import { formatCustomerKes } from "@/components/customers/customer-form";
import { saleLineProductLabel } from "@/lib/sale-line-items";

export default function SaleOrderDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const saleId = params.id;
  const backHref = searchParams.get("from") || "/customers";

  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadSale = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest(`/sales/${saleId}`);
      setSale(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    loadSale();
  }, [loadSale]);

  const items = sale?.items ?? [];

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="w-full">
        <Link href={backHref} className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          ← Back
        </Link>

        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">Loading order…</p>
        ) : sale ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h1 className="text-xl font-medium text-slate-900">Order #{sale.order_num}</h1>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <Meta label="Status" value={sale.status?.replace(/_/g, " ") ?? "—"} />
                <Meta label="Channel" value={sale.channel ?? "—"} />
                <Meta label="Customer #" value={sale.customer_num ?? "—"} />
                <Meta
                  label="Date"
                  value={formatShortDate(sale.completed_at ?? sale.created_at)}
                />
                <Meta label="Total" value={formatCustomerKes(sale.order_total)} highlight />
                <Meta label="Payment" value={sale.payment_status ?? "—"} />
              </dl>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-[15px] font-medium text-slate-900">Line items</h2>
                <p className="mt-0.5 text-xs text-slate-500">{items.length} item(s)</p>
              </div>
              {items.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">No line items.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-4 py-2.5 text-right">Qty</th>
                      <th className="px-4 py-2.5 text-right">Price</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((line) => (
                      <tr
                        key={line.id ?? `${line.line_no}-${line.product_code}`}
                        className="border-b border-slate-100 last:border-b-0"
                      >
                        <td className="px-4 py-3 text-slate-800">
                          <p className="font-medium text-slate-900">
                            {saleLineProductLabel(line)}
                          </p>
                          {line.product_code &&
                          saleLineProductLabel(line) !== line.product_code ? (
                            <p className="mt-0.5 font-mono text-xs text-slate-500">
                              {line.product_code}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {line.quantity} {line.uom ?? ""}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700">
                          {formatCustomerKes(line.selling_price)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {formatCustomerKes(line.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Meta({ label, value, highlight = false }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className={highlight ? "font-semibold text-slate-900" : "text-slate-800"}>{value}</dd>
    </div>
  );
}
