"use client";

import { notifyError, notifySuccess } from "@/lib/notify";
import { buildGrnFromReceiveSession } from "@/lib/grn-document";
import { printGoodsReceivedNote } from "@/components/lpo/grn-print";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { formatShortDate } from "@/components/catalog/catalog-shared";
import {
  ReadonlyHierarchyQty,
  StockTakeCountInputs,
} from "@/components/inventory/stock-take-count-inputs";
import {
  applyLpoReceiveCountUpdate,
  buildInitialReceiveCounts,
  fillReceiveCountsForLines,
  formatLinePackQty,
  lpoLineCanReceive,
  lpoLineOpenRemainingBase,
  lpoSessionOfferBase,
  packQtyFromReceiveBase,
  receiveBaseForLine,
} from "@/components/inventory/lpo-receive-stock";
import { useInventoryCatalogMaps } from "@/components/inventory/inventory-product-lines";
import { formatQty } from "@/components/inventory/inventory-shared";
import {
  formatLpoKes,
  formatPoNumber,
  lpoDisplayNumber,
  lpoHasSupplierReturns,
  lpoIsCancelledReturned,
  lpoLineReturnedQty,
  lpoOrderDate,
} from "@/components/lpo/lpo-shared";
import { baseToDisplayQty } from "@/lib/stock-uom";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { LpoReceivedQtyCell } from "@/components/lpo/lpo-received-qty";

function formatReturnedCell(line, uom) {
  const returned = lpoLineReturnedQty(line);
  if (returned <= 0) return "—";
  const ordered = Number(line.ordered_qty ?? 0);
  if (returned + 0.0001 >= ordered) return "Fully returned";
  return formatLinePackQty(returned, uom);
}

export default function LpoReceivePage() {
  const params = useParams();
  const { user, organization, generalSettings } = useAuth();
  const lpoNo = params.lpoNo;

  const [data, setData] = useState(null);
  const [uoms, setUoms] = useState([]);
  const [receiveCounts, setReceiveCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [postedGrn, setPostedGrn] = useState(null);
  const [printingGrn, setPrintingGrn] = useState(false);
  const { uomById } = useInventoryCatalogMaps(uoms);
  const showReturned = useMemo(
    () => lpoHasSupplierReturns(data?.lines ?? [], data?.supplier_returns ?? []),
    [data?.lines, data?.supplier_returns],
  );
  const supplierInvoiceNumber = useMemo(() => {
    const invoices = (data?.supplier_invoices ?? []).filter(
      (inv) => inv.id != null && Number(inv.lpo_no) === Number(lpoNo),
    );
    return invoices[0]?.supplier_invoice_number?.trim() || null;
  }, [data?.supplier_invoices, lpoNo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, uomRes] = await Promise.all([
        apiRequest(`/lpo-mst/${lpoNo}/summary`),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      ]);
      setUoms(uomRes.data ?? uomRes ?? []);
      setData(res);
      const uomList = uomRes.data ?? uomRes ?? [];
      const uomMap = new Map(uomList.map((u) => [u.id, u]));
      setReceiveCounts(buildInitialReceiveCounts(res.lines, uomMap, 0));
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load LPO");
    } finally {
      setLoading(false);
    }
  }, [lpoNo]);

  useEffect(() => {
    load();
  }, [load]);

  function setLpoReceiveCount(key, value) {
    setReceiveCounts((prev) =>
      applyLpoReceiveCountUpdate(prev, key, value, data?.lines, uomById),
    );
  }

  function fillAllRemaining() {
    setReceiveCounts((prev) => fillReceiveCountsForLines(data?.lines, uomById, prev));
  }

  async function confirmReceipt(partial) {
    const lines = data?.lines ?? [];
    const branchId = user?.branch_id ?? 1;
    const toPost = lines.filter((line) => {
      const uom = line.unit_id ? uomById.get(line.unit_id) : null;
      return receiveBaseForLine(String(line.id), uom, receiveCounts) > 0;
    });

    if (toPost.length === 0) {
      notifyError("Enter quantity to receive for at least one line.");
      return;
    }

    setSaving(true);
    try {
      const priorReceivedByLineId = Object.fromEntries(
        toPost.map((line) => [String(line.id), Number(line.received_qty ?? 0)]),
      );
      for (const line of toPost) {
        const uom = line.unit_id ? uomById.get(line.unit_id) : null;
        const lineKey = String(line.id);
        const receiveBase = receiveBaseForLine(lineKey, uom, receiveCounts);
        await apiRequest("/inventory/receive", {
          method: "POST",
          body: {
            product_code: line.product_code,
            branch_id: branchId,
            units_received: receiveBase,
            pack_qty: packQtyFromReceiveBase(receiveBase, uom),
            stock_location: "store",
            cost_price: line.cost_price,
            invoice_number: supplierInvoiceNumber,
            lpo_no: Number(lpoNo),
            lpo_txn_id: line.id,
          },
        });
      }
      const grn = buildGrnFromReceiveSession(data, receiveCounts, uomById, {
        supplierInvoiceNumber,
        receiptDate: new Date().toISOString().slice(0, 10),
        stockLocation: "store",
        receivedBy: user?.full_name ?? user?.username ?? null,
        priorReceivedByLineId,
      });
      setPostedGrn(grn);
      notifySuccess("Stock receipt posted. Print the goods received note for your records.");
      await load();
      if (!partial) {
        setReceiveCounts(buildInitialReceiveCounts(data?.lines, uomById, 0));
      }
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : err.message ?? "Receipt failed");
    } finally {
      setSaving(false);
    }
  }

  async function printPostedGrn() {
    if (!postedGrn) return;
    setPrintingGrn(true);
    try {
      await printGoodsReceivedNote(postedGrn, {
        organization,
        generalSettings: generalSettings(),
        user,
      });
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Could not print goods received note");
    } finally {
      setPrintingGrn(false);
    }
  }

  const lpo = data?.lpo;
  const lines = data?.lines ?? [];
  const orderDate = lpo ? lpoOrderDate(lpo) : null;

  return (
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Purchase orders", href: "/lpo" },
          {
            label: lpo ? lpoDisplayNumber(lpo) : "Purchase order",
            href: `/lpo/${lpoNo}`,
          },
          { label: "Receive stock" },
        ]}
      />
      <div className="mb-6">
        <h1 className="text-2xl font-medium text-slate-900">Stock receipt from LPO</h1>
        <p className="mt-1 text-base text-slate-500">
          Posts inventory and updates received quantities on the purchase order.
        </p>
      </div>

      {loading ? (
        <p className="text-base text-slate-500">Loading…</p>
      ) : lpo && (lpo.can_receive === false || lpoIsCancelledReturned(lpo)) ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-6 py-5 text-base text-orange-900">
          <p>
            Stock cannot be received on this purchase order because all items were returned to the
            supplier.
          </p>
          <Link href={`/lpo/${lpoNo}`} className="mt-3 inline-block font-medium text-[#185FA5] hover:underline">
            Back to LPO
          </Link>
        </div>
      ) : lpo ? (
        <div className="space-y-6">
          <section className="theme-panel rounded-xl border px-6 py-5 shadow-sm">
            <div className="overflow-x-auto">
              <dl className="grid min-w-[800px] grid-cols-5 gap-6">
                <div className="min-w-0">
                  <dt className="text-sm text-slate-500">PO</dt>
                  <dd className="mt-1 font-medium text-slate-900">{lpoDisplayNumber(lpo)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm text-slate-500">Supplier</dt>
                  <dd className="mt-1 truncate">
                    <Link href={`/suppliers/${lpo.supplier_id}`} className="font-medium text-[#185FA5] hover:underline">
                      {lpo.supplier_name}
                    </Link>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm text-slate-500">LPO date</dt>
                  <dd className="mt-1 text-slate-900">
                    {orderDate ? formatShortDate(orderDate) : "—"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm text-slate-500">Your reference</dt>
                  <dd className="mt-1 truncate text-slate-900">{lpo.reference_number || "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm text-slate-500">Supplier invoice</dt>
                  <dd className="mt-1 truncate text-slate-900">{supplierInvoiceNumber ?? "—"}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="theme-panel rounded-xl border p-6 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Items to receive</h2>
              {lines.length > 0 ? (
                <button
                  type="button"
                  onClick={fillAllRemaining}
                  className="text-base font-medium text-[#185FA5] hover:underline"
                >
                  Fill all remaining
                </button>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] table-fixed border-collapse text-base">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[11%]" />
                  {showReturned ? <col className="w-[10%]" /> : null}
                  <col className="w-[11%]" />
                  <col className="w-[14%]" />
                  <col className="w-[16%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 text-left text-sm font-medium text-slate-500">
                    <th className="py-2.5 pr-3">Product</th>
                    <th className="py-2.5 pr-3 text-right">Ordered</th>
                    {showReturned ? (
                      <th className="py-2.5 pr-1 text-right">Returned</th>
                    ) : null}
                    <th className="py-2.5 pr-1 text-right">Already received</th>
                    <th className="py-2.5 pr-3 text-right">Remaining</th>
                    <th className="py-2.5 pr-3 text-right">Receiving now</th>
                    <th className="py-2.5 pr-3 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const lineUom = line.unit_id ? uomById.get(line.unit_id) : null;
                    const lineKey = String(line.id);
                    const openRemainingBase = lpoLineOpenRemainingBase(line, lineUom);
                    const receivingNowBase = receiveBaseForLine(
                      lineKey,
                      lineUom,
                      receiveCounts,
                    );
                    const adjustedRemainingBase = Math.max(
                      0,
                      openRemainingBase - receivingNowBase,
                    );
                    const canReceive = lpoLineCanReceive(line);
                    const sessionOfferBase = lpoSessionOfferBase(
                      line,
                      lineUom,
                      receiveCounts,
                    );

                    return (
                      <tr
                        key={line.id}
                        className={`border-b border-slate-100 ${!canReceive ? "bg-slate-50/80" : ""}`}
                      >
                        <td className="py-3 pr-3 align-top font-medium text-slate-900">
                          {line.product_name}
                          <p className="text-sm font-normal text-slate-500">{line.product_code}</p>
                        </td>
                        <td className="py-3 pr-3 text-right align-top tabular-nums">
                          {formatLinePackQty(line.ordered_qty, lineUom)}
                        </td>
                        {showReturned ? (
                          <td className="py-3 pr-1 text-right align-top tabular-nums text-amber-800">
                            {formatReturnedCell(line, lineUom)}
                          </td>
                        ) : null}
                        <td className="py-3 pr-1 text-right align-top tabular-nums text-slate-600">
                          <LpoReceivedQtyCell line={line} uom={lineUom} />
                        </td>
                        <td className="py-3 pr-3 text-right align-top">
                          {lineUom ? (
                            <ReadonlyHierarchyQty
                              baseQty={adjustedRemainingBase}
                              uom={lineUom}
                              highlight={receivingNowBase > 0}
                            />
                          ) : (
                            <span className="tabular-nums font-medium">
                              {formatQty(baseToDisplayQty(adjustedRemainingBase, 1))}
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-3 align-top">
                          {canReceive ? (
                            <div>
                              <StockTakeCountInputs
                                lineId={lineKey}
                                uom={lineUom}
                                counts={receiveCounts}
                                onChange={setLpoReceiveCount}
                                showPreview
                              />
                              {sessionOfferBase > 0 ? (
                                <p className="mt-1 text-right text-xs font-medium text-amber-700">
                                  + {formatLinePackQty(
                                    packQtyFromReceiveBase(sessionOfferBase, lineUom),
                                    lineUom,
                                  )}{" "}
                                  offer
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <span className="block text-right text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-3 text-right align-top">
                          {formatLpoKes(line.cost_price)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {postedGrn ? (
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-base text-emerald-950">
              <p className="font-medium">Receipt posted successfully.</p>
              <p className="mt-1 text-sm">
                GRN total {formatLpoKes(postedGrn.grn_total)} · Match status:{" "}
                {postedGrn.reconciliation?.status ?? "—"}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={printingGrn}
                  onClick={printPostedGrn}
                  className="rounded-lg bg-[#185FA5] px-5 py-2 text-sm font-medium text-white hover:bg-[#144f8a] disabled:opacity-50"
                >
                  {printingGrn ? "Preparing…" : "Print goods received note"}
                </button>
                <Link
                  href={`/lpo/${lpoNo}`}
                  className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                >
                  Back to purchase order
                </Link>
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={saving}
              onClick={() => confirmReceipt(false)}
              className="rounded-lg bg-[#185FA5] px-6 py-2.5 text-base font-medium text-[#E6F1FB] hover:bg-[#144f8a] disabled:opacity-50"
            >
              {saving ? "Posting…" : "Confirm receipt & update stock"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => confirmReceipt(true)}
              className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-base font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Partial receipt (stay on page)
            </button>
            <Link
              href={`/lpo/${lpoNo}`}
              className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-base text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
