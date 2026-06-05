"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  formatLpoKes,
  formatPoNumber,
  lpoIsCancelledReturned,
  lpoLineReturnedLabel,
  lpoLineStatusLabel,
} from "@/components/lpo/lpo-shared";
import { formatQty } from "@/components/inventory/inventory-shared";
import { displayToBaseQty } from "@/lib/stock-uom";

export default function LpoReceivePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const lpoNo = params.lpoNo;

  const [data, setData] = useState(null);
  const [receiveQty, setReceiveQty] = useState({});
  const [location, setLocation] = useState("store");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/lpo-mst/${lpoNo}/summary`);
      setData(res);
      const initial = {};
      for (const line of res.lines ?? []) {
        initial[line.id] = String(line.remaining_qty ?? 0);
      }
      setReceiveQty(initial);
      const firstInv = res.supplier_invoices?.[0];
      if (firstInv?.supplier_invoice_number) {
        setInvoiceNumber(firstInv.supplier_invoice_number);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load LPO");
    } finally {
      setLoading(false);
    }
  }, [lpoNo]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmReceipt(partial) {
    const lines = data?.lines ?? [];
    const branchId = user?.branch_id ?? 1;
    const toPost = lines.filter((line) => {
      const qty = Number(receiveQty[line.id] ?? 0);
      return qty > 0;
    });

    if (toPost.length === 0) {
      setError("Enter quantity to receive for at least one line.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      for (const line of toPost) {
        const packQty = Number(receiveQty[line.id]);
        const factor = Number(line.conversion_factor ?? 1);
        if (packQty > line.remaining_qty + 0.0001) {
          throw new Error(`Receiving qty exceeds remaining for ${line.product_name}`);
        }
        await apiRequest("/inventory/receive", {
          method: "POST",
          body: {
            product_code: line.product_code,
            branch_id: branchId,
            units_received: displayToBaseQty(packQty, factor),
            pack_qty: packQty,
            stock_location: location,
            cost_price: line.cost_price,
            invoice_number: invoiceNumber.trim() || null,
            lpo_no: Number(lpoNo),
            lpo_txn_id: line.id,
          },
        });
      }
      await load();
      if (!partial) {
        router.push(`/lpo/${lpoNo}`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err.message ?? "Receipt failed");
    } finally {
      setSaving(false);
    }
  }

  const lpo = data?.lpo;

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mb-6 max-w-4xl">
        <Link href={`/lpo/${lpoNo}`} className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          ← Back to {lpo ? formatPoNumber(lpo.lpo_no) : "PO"}
        </Link>
        <h1 className="mt-2 text-xl font-medium text-slate-900">Stock receipt from LPO</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Posts inventory and updates received quantities on the purchase order.
        </p>
      </div>

      {error && (
        <p className="mb-4 max-w-4xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : lpo && (lpo.can_receive === false || lpoIsCancelledReturned(lpo)) ? (
        <div className="max-w-4xl rounded-xl border border-orange-200 bg-orange-50 px-6 py-5 text-sm text-orange-900">
          <p>Stock cannot be received on this purchase order because all items were returned to the supplier.</p>
          <Link href={`/lpo/${lpoNo}`} className="mt-3 inline-block font-medium text-[#185FA5] hover:underline">
            Back to LPO
          </Link>
        </div>
      ) : lpo ? (
        <div className="max-w-4xl space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">PO</dt>
                <dd className="font-medium">{formatPoNumber(lpo.lpo_no)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Supplier</dt>
                <dd>
                  <Link href={`/suppliers/${lpo.supplier_id}`} className="text-[#185FA5] hover:underline">
                    {lpo.supplier_name}
                  </Link>
                </dd>
              </div>
            </dl>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Stock location">
                <select
                  className={inputClassName()}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <option value="store">Store</option>
                  <option value="shop">Shop</option>
                </select>
              </Field>
              <Field label="Supplier invoice / GRN ref">
                <input
                  className={inputClassName()}
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Notes">
                  <input
                    className={inputClassName()}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Items to receive</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3 text-right">Ordered</th>
                    <th className="py-2 pr-3 text-right">Returned</th>
                    <th className="py-2 pr-3 text-right">Already received</th>
                    <th className="py-2 pr-3 text-right">Remaining</th>
                    <th className="py-2 pr-3 text-right">Receiving now</th>
                    <th className="py-2 pr-3 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.lines ?? []).map((line) => {
                    const canReceive = Number(line.remaining_qty) > 0;
                    return (
                      <tr
                        key={line.id}
                        className={`border-b border-slate-100 ${!canReceive ? "bg-slate-50/80" : ""}`}
                      >
                        <td className="py-2.5 pr-3 font-medium text-slate-900">
                          {line.product_name}
                          <p className="text-xs font-normal text-slate-500">
                            {line.package_name || line.uom} · {lpoLineStatusLabel(line)}
                          </p>
                        </td>
                        <td className="py-2.5 pr-3 text-right">{formatQty(line.ordered_qty)}</td>
                        <td className="py-2.5 pr-3 text-right text-amber-800">
                          {lpoLineReturnedLabel(line)}
                        </td>
                        <td className="py-2.5 pr-3 text-right text-slate-600">
                          {formatQty(line.received_qty)}
                        </td>
                        <td className="py-2.5 pr-3 text-right font-medium">
                          {formatQty(line.remaining_qty)}
                        </td>
                        <td className="py-2.5 pr-3 text-right">
                          <input
                            type="number"
                            min="0"
                            max={line.remaining_qty}
                            step="any"
                            className={`${inputClassName()} w-28 text-right`}
                            value={receiveQty[line.id] ?? ""}
                            onChange={(e) =>
                              setReceiveQty((p) => ({ ...p, [line.id]: e.target.value }))
                            }
                            disabled={!canReceive}
                          />
                        </td>
                        <td className="py-2.5 pr-3 text-right">{formatLpoKes(line.cost_price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => confirmReceipt(false)}
              className="rounded-lg bg-[#185FA5] px-5 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
            >
              {saving ? "Posting…" : "Confirm receipt & update stock"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => confirmReceipt(true)}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Partial receipt (stay on page)
            </button>
            <Link
              href={`/lpo/${lpoNo}`}
              className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
