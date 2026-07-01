"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";
import { useQueuedTask } from "@/lib/use-queued-task";
import { useAuth } from "@/contexts/auth-context";
import {
  FormModal,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  InventoryPageShell,
  InventoryTableShell,
  SESSION_STATUS_LABELS,
} from "@/components/inventory/inventory-shared";
import {
  initStockTakeCounts,
  readStockTakeCounts,
  StockTakeCountInputs,
} from "@/components/inventory/stock-take-count-inputs";
import {
  uomHierarchyChain,
  uomStockTakeHint,
  uomStockTakeLevels,
} from "@/lib/uom-packaging";
import {
  formatMixedStockDisplay,
  stockTakeCountsToBase,
} from "@/lib/stock-uom";
import {
  printStockTakeSheet,
  stockTakePrintRowsFromLines,
} from "@/components/inventory/stock-take-print";

function varianceClass(value) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-slate-500";
}

export default function StockTakeSessionPage() {
  const params = useParams();
  const router = useRouter();
  const { organization } = useAuth();
  const sessionId = params.id;

  const [session, setSession] = useState(null);
  const [lines, setLines] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const { runQueuedTask, overlayNode } = useQueuedTask("Saving stock take counts…");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sess, loadedLines, productRows, uomRes] = await Promise.all([
        apiRequest(`/stock-take-sessions/${sessionId}`),
        fetchAllPaginatedRowsSmart("/stock-take-lines", {
          "filter[session_id]": sessionId,
        }),
        fetchAllPaginatedRowsSmart("/products"),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      ]);
      setSession(sess);
      const allowedLocations =
        sess?.stock_location === "shop"
          ? ["shop"]
          : sess?.stock_location === "store"
            ? ["store"]
            : ["shop", "store"];
      const filteredLines = loadedLines.filter((line) =>
        allowedLocations.includes(line.stock_location),
      );
      setLines(filteredLines);
      setProducts(productRows);
      setUoms(uomRes.data ?? []);

      const prodMap = new Map(productRows.map((p) => [p.product_code, p]));
      const uomMap = new Map((uomRes.data ?? []).map((u) => [u.id, u]));
      const initial = {};
      for (const line of filteredLines) {
        const product = prodMap.get(line.product_code);
        const uom = product ? uomMap.get(product.unit_id) : null;
        const levels = uomStockTakeLevels(uom);
        Object.assign(
          initial,
          initStockTakeCounts(line.id, line.counted_quantity, uom, levels),
        );
      }
      setCounts(initial);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load stock take session");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const productByCode = useMemo(
    () => new Map(products.map((p) => [p.product_code, p])),
    [products],
  );

  function productMeta(productCode) {
    const product = productByCode.get(productCode);
    const uom = product ? uomById.get(product.unit_id) : null;
    const levels = uomStockTakeLevels(uom);
    return {
      uom,
      levels,
      hierarchy: uomHierarchyChain(uom),
      countHint: uomStockTakeHint(uom),
    };
  }

  function countedBaseForLine(line) {
    const { uom, levels } = productMeta(line.product_code);
    const byKey = readStockTakeCounts(line.id, levels, counts);
    return stockTakeCountsToBase(byKey, uom);
  }

  const showShop = session?.stock_location === "shop" || session?.stock_location === "both";
  const showStore = session?.stock_location === "store" || session?.stock_location === "both";

  const groupedProducts = useMemo(() => {
    const map = new Map();
    for (const line of lines) {
      let row = map.get(line.product_code);
      if (!row) {
        const product = productByCode.get(line.product_code);
        const meta = productMeta(line.product_code);
        row = {
          product_code: line.product_code,
          product_name: line.product_name ?? product?.product_name ?? line.product_code,
          ...meta,
          shop: null,
          store: null,
        };
        map.set(line.product_code, row);
      }
      if (line.stock_location === "shop") row.shop = line;
      if (line.stock_location === "store") row.store = line;
    }
    return [...map.values()].sort((a, b) => a.product_name.localeCompare(b.product_name));
  }, [lines, productByCode, uomById]);

  const dirty = useMemo(() => {
    for (const line of lines) {
      const currentBase = countedBaseForLine(line);
      if (Math.abs(currentBase - Number(line.counted_quantity)) >= 0.0001) return true;
    }
    return false;
  }, [lines, counts, productByCode, uomById]);

  const variances = useMemo(() => {
    const items = [];
    for (const line of lines) {
      const meta = productMeta(line.product_code);
      const systemBase = Number(line.system_quantity ?? 0);
      const countedBase = countedBaseForLine(line);
      const varianceBase = countedBase - systemBase;
      if (Math.abs(varianceBase) >= 0.0001) {
        items.push({
          line,
          ...meta,
          varianceBase,
          location: line.stock_location,
        });
      }
    }
    return items;
  }, [lines, counts, productByCode, uomById]);

  function setCount(key, value) {
    setCounts((prev) => ({ ...prev, [key]: value }));
  }

  async function saveCounts() {
    setSaving(true);
    try {
      const payloadLines = lines
        .map((line) => ({
          id: line.id,
          counted_quantity: countedBaseForLine(line),
        }))
        .filter(
          (line) =>
            Math.abs(
              line.counted_quantity -
                Number(lines.find((entry) => entry.id === line.id)?.counted_quantity ?? 0),
            ) >= 0.0001,
        );

      if (!payloadLines.length) {
        return;
      }

      const saveRequest = () =>
        apiRequest(`/inventory/stock-take/${sessionId}/save-counts`, {
          method: "POST",
          body: { lines: payloadLines },
        });

      if (payloadLines.length > 25) {
        await runQueuedTask(saveRequest, {
          message: `Saving ${payloadLines.length} stock take lines…`,
        });
      } else {
        await saveRequest();
      }

      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to save counts");
    } finally {
      setSaving(false);
    }
  }

  async function completeSession() {
    if (dirty) {
      notifyError("Save your counts before closing the stock take.");
      setCompleteOpen(false);
      return;
    }
    setCompleting(true);
    try {
      await apiRequest(`/inventory/stock-take/${sessionId}/complete`, { method: "POST" });
      setCompleteOpen(false);
      router.push("/inventory/stock-take");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to close stock take");
    } finally {
      setCompleting(false);
    }
  }

  const readOnly = session?.status === "completed";

  function handlePrint() {
    printStockTakeSheet({
      session,
      rows: stockTakePrintRowsFromLines(lines, productByCode, uomById),
      organization,
      blankCounted: true,
    });
  }

  function locationCells(line, uom) {
    if (!line) {
      return (
        <>
          <td className="px-3 py-2 text-right text-slate-400">—</td>
          <td className="px-3 py-2 text-right text-slate-400">—</td>
          <td className="px-3 py-2 text-right text-slate-400">—</td>
        </>
      );
    }
    const systemText = formatMixedStockDisplay(line.system_quantity, uom).text;
    const countedBase = countedBaseForLine(line);
    const varianceBase = countedBase - Number(line.system_quantity ?? 0);
    const varianceText = formatMixedStockDisplay(Math.abs(varianceBase), uom).text;
    const levels = uomStockTakeLevels(uom);

    return (
      <>
        <td className="px-3 py-2 text-right text-sm text-slate-700">{systemText}</td>
        <td className="px-3 py-2 text-right">
          {readOnly ? (
            <span className="text-sm tabular-nums">
              {formatMixedStockDisplay(countedBase, uom).text}
            </span>
          ) : levels.length === 1 && levels[0].key === "small" ? (
            <input
              type="number"
              step="any"
              className={`${inputClassName()} w-20 text-right`}
              value={counts[`${line.id}:small`] ?? ""}
              onChange={(e) => setCount(`${line.id}:small`, e.target.value)}
              disabled={saving}
              aria-label={`${levels[0].label} count`}
            />
          ) : (
            <StockTakeCountInputs
              lineId={line.id}
              uom={uom}
              counts={counts}
              onChange={setCount}
              disabled={saving}
            />
          )}
        </td>
        <td className={`px-3 py-2 text-right text-sm tabular-nums font-medium ${varianceClass(varianceBase)}`}>
          {varianceBase > 0 ? "+" : varianceBase < 0 ? "−" : ""}
          {varianceText}
        </td>
      </>
    );
  }

  return (
    <InventoryPageShell
      title={session?.session_code ?? "Stock take"}
      subtitle={
        session
          ? `${SESSION_STATUS_LABELS[session.status] ?? session.status} · ${session.stock_location?.replace("_", " ")}`
          : "Count products and reconcile variances"
      }
      action={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading || !lines.length}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Print count sheet
          </button>
          {!readOnly ? (
            <>
              <PrimaryButton type="button" showIcon={false} onClick={saveCounts} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save counts"}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setCompleteOpen(true)}
                disabled={!lines.length || dirty || saving}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Close stock take
              </button>
            </>
          ) : null}
        </div>
      }
    >
      <div className="mb-4 space-y-1">
        <Link href="/inventory/stock-take" className="text-sm text-[#185FA5] hover:underline">
          ← Back to sessions
        </Link>
        {!readOnly ? (
          <p className="text-sm text-slate-500">
            Count using each product&apos;s UOM packaging — full packs, outers (if set), or base
            units. Totals reconcile to system stock in small units.
            {dirty ? <span className="ml-2 text-amber-700">Unsaved changes.</span> : null}
          </p>
        ) : null}
      </div>

      <InventoryTableShell>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading count sheet…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium" rowSpan={2}>
                    Product / UOM
                  </th>
                  {showShop ? (
                    <th
                      className="border-l border-slate-200 px-3 py-2 text-center font-medium"
                      colSpan={3}
                    >
                      Shop
                    </th>
                  ) : null}
                  {showStore ? (
                    <th
                      className="border-l border-slate-200 px-3 py-2 text-center font-medium"
                      colSpan={3}
                    >
                      Store / warehouse
                    </th>
                  ) : null}
                </tr>
                <tr className="theme-table-head-row text-xs uppercase tracking-wide">
                  {showShop ? (
                    <>
                      <th className="border-l border-slate-200 px-3 py-1.5 text-right font-medium">
                        Current stock
                      </th>
                      <th className="px-3 py-1.5 text-right font-medium">Counted</th>
                      <th className="px-3 py-1.5 text-right font-medium">Variance</th>
                    </>
                  ) : null}
                  {showStore ? (
                    <>
                      <th className="border-l border-slate-200 px-3 py-1.5 text-right font-medium">
                        Current stock
                      </th>
                      <th className="px-3 py-1.5 text-right font-medium">Counted</th>
                      <th className="px-3 py-1.5 text-right font-medium">Variance</th>
                    </>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {groupedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={1 + (showShop ? 3 : 0) + (showStore ? 3 : 0)} className="px-4 py-8 text-center text-slate-500">
                      No count lines in this session.
                    </td>
                  </tr>
                ) : (
                  groupedProducts.map((row) => (
                    <tr key={row.product_code} className="border-b border-slate-100">
                      <td className="px-3 py-2.5">
                        <span className="font-medium text-slate-900">{row.product_name}</span>
                        <p className="text-xs text-slate-500">{row.hierarchy}</p>
                        {!readOnly ? (
                          <p className="mt-0.5 text-[10px] text-slate-400">{row.countHint}</p>
                        ) : null}
                      </td>
                      {showShop ? locationCells(row.shop, row.uom) : null}
                      {showStore ? locationCells(row.store, row.uom) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </InventoryTableShell>

      <FormModal
        title="Close stock take?"
        open={completeOpen}
        onClose={() => !completing && setCompleteOpen(false)}
        onSubmit={completeSession}
        saving={completing}
        submitLabel="Close & update stock"
      >
        <p className="text-sm text-slate-600">
          {variances.length} variance{variances.length === 1 ? "" : "s"} will adjust stock to match
          your saved counts.
        </p>
        {variances.length > 0 ? (
          <ul className="mt-3 max-h-48 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
            {variances.slice(0, 12).map((item) => {
              const product = productByCode.get(item.line.product_code);
              return (
                <li key={item.line.id} className="flex justify-between px-3 py-2">
                  <span>
                    {item.line.product_name ?? product?.product_name ?? item.line.product_code}{" "}
                    <span className="text-slate-400 capitalize">({item.location})</span>
                  </span>
                  <span className={varianceClass(item.varianceBase)}>
                    {item.varianceBase > 0 ? "+" : item.varianceBase < 0 ? "−" : ""}
                    {formatMixedStockDisplay(Math.abs(item.varianceBase), item.uom).text}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Counts match system quantities.</p>
        )}
      </FormModal>
      {overlayNode}
    </InventoryPageShell>
  );
}
