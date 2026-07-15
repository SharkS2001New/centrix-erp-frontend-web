"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { fetchProductsByCodesCached } from "@/lib/catalog-cache";
import { fetchSuppliersCached, fetchUomsCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { lineFromEnrichedProduct } from "@/components/lpo/lpo-product-utils";
import {
  formatLpoKes,
  lpoRowDisplayNumber,
} from "@/components/lpo/lpo-shared";
import { SupplierInvoiceModal } from "@/components/lpo/supplier-invoice-modal";
import { lpoSupplierInvoiceFilePath } from "@/components/lpo/lpo-supplier-invoice-doc";
import { ProtectedFileLink } from "@/components/media/protected-file-preview";
import {
  InventoryProductLines,
  useInventoryCatalogMaps,
} from "@/components/inventory/inventory-product-lines";
import {
  initStockTakeCounts,
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
  lpoSessionReceiveAmount,
  lpoSessionStockUnitCost,
  packQtyFromReceiveBase,
  receiveBaseForLine,
  uomForManualReceiveLine,
} from "@/components/inventory/lpo-receive-stock";
import { formatQty, InventoryPageShell } from "@/components/inventory/inventory-shared";
import { LpoReceivedQtyCell } from "@/components/lpo/lpo-received-qty";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { uomStockTakeLevels } from "@/lib/uom-packaging";
import { baseToDisplayQty } from "@/lib/stock-uom";

function makeReceiptRef(userRef) {
  const trimmed = userRef?.trim();
  if (trimmed) return trimmed;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SR-${stamp}-${suffix}`;
}

export default function ReceiveStockPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [mode, setMode] = useState("lpo");
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [lpoOptions, setLpoOptions] = useState([]);
  const [lpoData, setLpoData] = useState(null);
  const [receiveCounts, setReceiveCounts] = useState({});
  const [manualLines, setManualLines] = useState([]);
  const [form, setForm] = useState({
    supplier_id: "",
    lpo_no: "",
    stock_location: "store",
    invoice_number: "",
  });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [loadingLpo, setLoadingLpo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefillDone, setPrefillDone] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchSuppliersCached(user?.organization_id),
      fetchUomsCached(user?.organization_id),
    ])
      .then(([supRows, uomRows]) => {
        setSuppliers(supRows ?? []);
        setUoms(uomRows ?? []);
      })
      .catch(() => {
        setSuppliers([]);
        setUoms([]);
      });
  }, [user?.organization_id]);

  const { uomById } = useInventoryCatalogMaps(uoms);
  const productByCode = useMemo(
    () => new Map(products.map((p) => [p.product_code, p])),
    [products],
  );

  const supplierInvoices = useMemo(() => {
    const lpoNo = form.lpo_no;
    return (lpoData?.supplier_invoices ?? []).filter(
      (inv) => inv.id != null && Number(inv.lpo_no) === Number(lpoNo),
    );
  }, [lpoData?.supplier_invoices, form.lpo_no]);

  function mergeProducts(nextProducts) {
    if (!nextProducts?.length) return;
    setProducts((prev) => {
      const map = new Map(prev.map((p) => [p.product_code, p]));
      for (const product of nextProducts) {
        if (product?.product_code) map.set(product.product_code, product);
      }
      return [...map.values()];
    });
  }

  function setReceiveCount(key, value) {
    setReceiveCounts((prev) => ({ ...prev, [key]: value }));
  }

  function setLpoReceiveCount(key, value) {
    setReceiveCounts((prev) =>
      applyLpoReceiveCountUpdate(prev, key, value, lpoData?.lines, uomById),
    );
  }

  function fillAllRemaining() {
    setReceiveCounts((prev) =>
      fillReceiveCountsForLines(lpoData?.lines, uomById, prev),
    );
  }

  function addManualProduct(product) {
    if (manualLines.some((l) => l.product_code === product.product_code)) return;
    mergeProducts([product]);
    const uom = product.uom ?? uomById.get(product.unit_id);
    setManualLines((prev) => [
      ...prev,
      { ...lineFromEnrichedProduct(product), unit_uom: uom ?? null },
    ]);
    const levels = uomStockTakeLevels(uom);
    setReceiveCounts((prev) => ({
      ...prev,
      ...initStockTakeCounts(product.product_code, 0, uom, levels),
    }));
  }

  function addManualProducts(productsToAdd) {
    for (const product of productsToAdd) {
      addManualProduct(product);
    }
  }

  useEffect(() => {
    if (mode !== "lpo" || !form.supplier_id) {
      setLpoOptions([]);
      return;
    }
    apiRequest("/lpo-mst", {
      searchParams: { per_page: 100, supplier_id: form.supplier_id },
    })
      .then((res) => setLpoOptions(res.data ?? []))
      .catch(() => setLpoOptions([]));
  }, [mode, form.supplier_id]);

  const applyInvoiceSelection = useCallback((invoiceId, invoices) => {
    const id = String(invoiceId ?? "");
    setSelectedInvoiceId(id);
    if (!id) return;
    const inv = (invoices ?? []).find((row) => String(row.id) === id);
    if (inv?.supplier_invoice_number) {
      setForm((p) => ({
        ...p,
        invoice_number: String(inv.supplier_invoice_number).trim(),
      }));
    }
  }, []);

  const loadLpo = useCallback(
    async (lpoNo) => {
      if (!lpoNo) {
        setLpoData(null);
        setReceiveCounts({});
        setSelectedInvoiceId("");
        return;
      }
      setLoadingLpo(true);
      try {
        const res = await apiRequest(`/lpo-mst/${lpoNo}/summary`);
        setLpoData(res);
        setReceiveCounts(buildInitialReceiveCounts(res.lines, uomById, 0));
        const codes = (res.lines ?? []).map((line) => line.product_code).filter(Boolean);
        const catalog = await fetchProductsByCodesCached(user?.organization_id, codes, {
          status: "all",
        });
        mergeProducts(catalog);
        const invoices = (res.supplier_invoices ?? []).filter(
          (inv) => inv.id != null && Number(inv.lpo_no) === Number(lpoNo),
        );
        if (invoices.length > 0) {
          applyInvoiceSelection(invoices[0].id, invoices);
        } else {
          setSelectedInvoiceId("");
        }
      } catch (e) {
        notifyError(e instanceof Error ? e.message : "Failed to load purchase order");
        setLpoData(null);
      } finally {
        setLoadingLpo(false);
      }
    },
    [uomById, user?.organization_id, applyInvoiceSelection],
  );

  useEffect(() => {
    if (mode === "lpo" && form.lpo_no) loadLpo(form.lpo_no);
  }, [mode, form.lpo_no, loadLpo]);

  useEffect(() => {
    if (prefillDone) return;
    const lpoNo = searchParams.get("lpo_no");
    const supplierId = searchParams.get("supplier_id");
    if (!lpoNo && !supplierId) {
      setPrefillDone(true);
      return;
    }
    setMode("lpo");
    setForm((p) => ({
      ...p,
      supplier_id: supplierId ? String(supplierId) : p.supplier_id,
      lpo_no: lpoNo ? String(lpoNo) : p.lpo_no,
    }));
    setPrefillDone(true);
  }, [searchParams, prefillDone]);

  function updateManualLine(index, patch) {
    setManualLines((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function submitLpo(e) {
    e.preventDefault();
    const lines = lpoData?.lines ?? [];
    const toPost = lines.filter((line) => {
      const uom = line.unit_id ? uomById.get(line.unit_id) : null;
      return receiveBaseForLine(String(line.id), uom, receiveCounts) > 0;
    });
    if (toPost.length === 0) {
      notifyError("Enter quantity to receive for at least one line.");
      return;
    }
    if (supplierInvoices.length === 0) {
      notifyError("Attach the supplier invoice for this LPO before receiving items.");
      setInvoiceModalOpen(true);
      return;
    }
    if (!selectedInvoiceId) {
      notifyError("Select the supplier invoice that covers these items.");
      return;
    }

    const receiptRef = makeReceiptRef(form.invoice_number);
    setSaving(true);
    try {
      for (const line of toPost) {
        const uom = line.unit_id ? uomById.get(line.unit_id) : null;
        const receiveBase = receiveBaseForLine(String(line.id), uom, receiveCounts);
        await apiRequest("/inventory/receive", {
          method: "POST",
          body: {
            product_code: line.product_code,
            branch_id: branchId,
            units_received: receiveBase,
            pack_qty: packQtyFromReceiveBase(receiveBase, uom),
            stock_location: form.stock_location,
            cost_price: line.cost_price,
            invoice_number: receiptRef,
            lpo_no: Number(form.lpo_no),
            lpo_txn_id: line.id,
          },
        });
      }
      router.push(`/inventory/receipts/${encodeURIComponent(receiptRef)}`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : err.message ?? "Receipt failed");
    } finally {
      setSaving(false);
    }
  }

  async function submitManual(e) {
    e.preventDefault();
    const toPost = manualLines.filter((line) => {
      const uom = uomForManualReceiveLine(line, uomById);
      return receiveBaseForLine(line.product_code, uom, receiveCounts) > 0;
    });
    if (toPost.length === 0) {
      notifyError("Add at least one product with a quantity.");
      return;
    }

    const receiptRef = makeReceiptRef(form.invoice_number);
    setSaving(true);
    try {
      for (const line of toPost) {
        const uom = uomForManualReceiveLine(line, uomById);
        const product = productByCode.get(line.product_code);
        const receiveBase = receiveBaseForLine(line.product_code, uom, receiveCounts);
        await apiRequest("/inventory/receive", {
          method: "POST",
          body: {
            product_code: line.product_code,
            branch_id: branchId,
            units_received: receiveBase,
            pack_qty: packQtyFromReceiveBase(receiveBase, uom),
            stock_location: form.stock_location,
            cost_price: line.cost_price
              ? Number(line.cost_price)
              : product?.last_cost_price ?? null,
            invoice_number: receiptRef,
          },
        });
      }
      router.push(`/inventory/receipts/${encodeURIComponent(receiptRef)}`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Receipt failed");
    } finally {
      setSaving(false);
    }
  }

  const lpoLines = lpoData?.lines ?? [];

  return (
    <InventoryPageShell
      title="Receive stock"
      subtitle="Record goods received against a purchase order or as a manual delivery"
    >
      <AppBreadcrumb
        items={[
          { label: "Stock receipts", href: "/inventory/receipts" },
          { label: "Receive stock" },
        ]}
      />

      <div className="mb-4 flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 max-w-md">
        <button
          type="button"
          onClick={() => setMode("lpo")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            mode === "lpo" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          From purchase order
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${
            mode === "manual" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          Manual receipt
        </button>
      </div>

      <div className="theme-panel rounded-xl border p-6 shadow-sm">
        {mode === "lpo" ? (
          <form onSubmit={submitLpo} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supplier">
                <select
                  className={inputClassName()}
                  value={form.supplier_id}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, supplier_id: e.target.value, lpo_no: "" }))
                  }
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.supplier_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Purchase order">
                <select
                  className={inputClassName()}
                  value={form.lpo_no}
                  onChange={(e) => setForm((p) => ({ ...p, lpo_no: e.target.value }))}
                  disabled={!form.supplier_id}
                >
                  <option value="">Select purchase order…</option>
                  {lpoOptions.map((l) => (
                    <option key={l.lpo_no} value={l.lpo_no}>
                      {lpoRowDisplayNumber(l)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Stock location">
                <select
                  className={inputClassName()}
                  value={form.stock_location}
                  onChange={(e) => setForm((p) => ({ ...p, stock_location: e.target.value }))}
                >
                  <option value="store">Store / warehouse</option>
                  <option value="shop">Shop</option>
                </select>
              </Field>
              <Field label="Receipt reference">
                <input
                  className={inputClassName()}
                  value={form.invoice_number}
                  onChange={(e) => setForm((p) => ({ ...p, invoice_number: e.target.value }))}
                  placeholder="Filled from supplier invoice"
                />
              </Field>
            </div>

            {form.lpo_no && !loadingLpo ? (
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Supplier invoice</h3>
                    <p className="text-xs text-slate-500">
                      Attach the invoice covering the items you are receiving.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInvoiceModalOpen(true)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                  >
                    {supplierInvoices.length ? "Attach another" : "Attach invoice"}
                  </button>
                </div>
                {supplierInvoices.length === 0 ? (
                  <p className="text-sm text-amber-800">
                    No supplier invoice on this LPO yet. Attach the invoice document before
                    completing the receipt.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {supplierInvoices.map((inv) => {
                      const selected = String(selectedInvoiceId) === String(inv.id);
                      return (
                        <label
                          key={inv.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 ${
                            selected
                              ? "border-[var(--theme-primary)] bg-white"
                              : "border-slate-200 bg-white"
                          }`}
                        >
                          <input
                            type="radio"
                            name="supplier_invoice"
                            className="mt-1"
                            checked={selected}
                            onChange={() => applyInvoiceSelection(inv.id, supplierInvoices)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium text-slate-900">
                              {inv.supplier_invoice_number}
                            </span>
                            <span className="block text-xs text-slate-500">
                              {inv.invoice_date ? `Dated ${inv.invoice_date}` : "No invoice date"}
                            </span>
                            {inv.has_document ? (
                              <ProtectedFileLink
                                filePath={lpoSupplierInvoiceFilePath(inv.id)}
                                className="mt-1 inline-block text-xs font-medium text-[var(--theme-primary)] hover:underline"
                              >
                                View document
                              </ProtectedFileLink>
                            ) : (
                              <span className="mt-1 block text-xs text-amber-700">
                                Document missing — re-attach recommended
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}

            {loadingLpo ? (
              <p className="text-sm text-slate-500">Loading order lines…</p>
            ) : lpoLines.length > 0 ? (
              <div>
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={fillAllRemaining}
                    className="text-sm font-medium text-[#185FA5] hover:underline"
                  >
                    Fill all remaining
                  </button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[900px] border-collapse text-sm">
                    <thead>
                      <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                        <th className="px-3 py-2 font-medium">Product</th>
                        <th className="px-3 py-2 font-medium text-right">Ordered</th>
                        <th className="px-3 py-2 font-medium text-right">Cost per unit</th>
                        <th className="px-3 py-2 font-medium text-right">Total amount</th>
                        <th className="px-3 py-2 font-medium text-right">Received</th>
                        <th className="px-3 py-2 font-medium text-right">Remaining</th>
                        <th className="px-3 py-2 font-medium text-right">Receiving now</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lpoLines.map((line) => {
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
                        const status =
                          line.receive_status ??
                          (openRemainingBase <= 0 ? "complete" : "open");
                        const canReceive = lpoLineCanReceive(line);
                        const sessionOfferBase = lpoSessionOfferBase(
                          line,
                          lineUom,
                          receiveCounts,
                        );
                        const packLabel =
                          line.package_name ||
                          line.packaging_label ||
                          lineUom?.package_name ||
                          "pack";
                        const stockUnitCost = lpoSessionStockUnitCost(
                          line,
                          lineUom,
                          receiveCounts,
                        );
                        const unitCost = stockUnitCost ?? Number(line.cost_price ?? 0);
                        const totalAmount = lpoSessionReceiveAmount(
                          line,
                          lineUom,
                          receiveCounts,
                        );
                        return (
                          <tr key={line.id} className="border-b border-slate-100">
                            <td className="px-3 py-2.5">
                              <p className="font-medium text-slate-900">{line.product_name}</p>
                              <p className="text-xs text-slate-500">
                                {line.packaging_label || line.package_name}
                              </p>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {formatLinePackQty(line.ordered_qty, lineUom)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                              <div>
                                <p className="font-medium text-slate-900">
                                  {formatLpoKes(unitCost)}
                                </p>
                                <p className="text-[11px] text-slate-500">per {packLabel}</p>
                                {stockUnitCost != null ? (
                                  <p className="mt-1 text-[11px] font-medium text-amber-700">
                                    Original price {formatLpoKes(line.cost_price)}
                                  </p>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">
                              {formatLpoKes(totalAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                              <LpoReceivedQtyCell line={line} uom={lineUom} />
                            </td>
                            <td className="px-3 py-2.5 text-right align-top">
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
                            <td className="px-3 py-2.5">
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
                                    <p className="mt-1 text-right text-[11px] font-medium text-amber-700">
                                      +{" "}
                                      {formatLinePackQty(
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
                            <td className="px-3 py-2.5">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                                  status === "complete"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : status === "partial"
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : form.lpo_no ? (
              <p className="text-sm text-slate-500">No open lines on this purchase order.</p>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Link
                href="/inventory/receipts"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
              <PrimaryButton type="submit" showIcon={false} disabled={saving || !form.lpo_no}>
                {saving ? "Saving…" : "Complete receipt"}
              </PrimaryButton>
            </div>
          </form>
        ) : (
          <form onSubmit={submitManual} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Stock location">
                <select
                  className={inputClassName()}
                  value={form.stock_location}
                  onChange={(e) => setForm((p) => ({ ...p, stock_location: e.target.value }))}
                >
                  <option value="store">Store / warehouse</option>
                  <option value="shop">Shop</option>
                </select>
              </Field>
              <Field label="Receipt reference (optional)">
                <input
                  className={inputClassName()}
                  value={form.invoice_number}
                  onChange={(e) => setForm((p) => ({ ...p, invoice_number: e.target.value }))}
                  placeholder="Supplier invoice or GRN number"
                />
              </Field>
            </div>

            <InventoryProductLines
              lines={manualLines}
              onChange={setManualLines}
              uomById={uomById}
              onAddProduct={addManualProduct}
              onAddProducts={addManualProducts}
              tableHeaders={[
                { key: "product", label: "Product" },
                { key: "qty", label: "Qty received", align: "right" },
                { key: "cost", label: "Cost", align: "right" },
              ]}
              emptyMessage="Search and add products received."
              renderCells={(line, index) => {
                const uom = uomForManualReceiveLine(line, uomById);
                return (
                  <>
                    <td className="px-3 py-2">
                      <StockTakeCountInputs
                        lineId={line.product_code}
                        uom={uom}
                        counts={receiveCounts}
                        onChange={setReceiveCount}
                        showPreview
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className={`${inputClassName()} w-24 text-right`}
                        value={line.cost_price}
                        onChange={(e) => updateManualLine(index, { cost_price: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  </>
                );
              }}
            />

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Link
                href="/inventory/receipts"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>
              <PrimaryButton type="submit" showIcon={false} disabled={saving}>
                {saving ? "Saving…" : "Complete receipt"}
              </PrimaryButton>
            </div>
          </form>
        )}
      </div>

      {form.lpo_no && form.supplier_id ? (
        <SupplierInvoiceModal
          open={invoiceModalOpen}
          onClose={() => setInvoiceModalOpen(false)}
          lpoNo={form.lpo_no}
          supplierId={form.supplier_id}
          onSaved={async () => {
            await loadLpo(form.lpo_no);
          }}
        />
      ) : null}
    </InventoryPageShell>
  );
}
