"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  FormModal,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  formatQty,
  InventoryPageShell,
  InventoryTableShell,
  SESSION_STATUS_LABELS,
  uomLabelFrom,
} from "@/components/inventory/inventory-shared";
import {
  formatMixedStockDisplay,
  mixedToBase,
  splitBaseToMixed,
} from "@/lib/stock-uom";

function varianceClass(value) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-slate-500";
}

export default function StockTakeSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id;

  const [session, setSession] = useState(null);
  const [lines, setLines] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [sess, lineRes, prodRes, uomRes] = await Promise.all([
        apiRequest(`/stock-take-sessions/${sessionId}`),
        apiRequest("/stock-take-lines", {
          searchParams: { per_page: 500, "filter[session_id]": sessionId },
        }),
        apiRequest("/products", { searchParams: { per_page: 500 } }),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      ]);
      setSession(sess);
      const allowedLocations =
        sess?.stock_location === "shop"
          ? ["shop"]
          : sess?.stock_location === "store"
            ? ["store"]
            : ["shop", "store"];
      const loadedLines = (lineRes.data ?? []).filter((line) =>
        allowedLocations.includes(line.stock_location),
      );
      setLines(loadedLines);
      setProducts(prodRes.data ?? []);
      setUoms(uomRes.data ?? []);

      const prodMap = new Map((prodRes.data ?? []).map((p) => [p.product_code, p]));
      const uomMap = new Map((uomRes.data ?? []).map((u) => [u.id, u]));
      const initial = {};
      for (const line of loadedLines) {
        const product = prodMap.get(line.product_code);
        const uom = product ? uomMap.get(product.unit_id) : null;
        const factor = Number(uom?.conversion_factor ?? 1);
        const { packs, loose } = splitBaseToMixed(line.counted_quantity, factor);
        if (factor > 1) {
          initial[`${line.id}:packs`] = String(packs);
          initial[`${line.id}:loose`] = String(loose);
        } else {
          initial[line.id] = String(loose);
        }
      }
      setCounts(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock take session");
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
    return {
      factor: Number(uom?.conversion_factor ?? 1),
      label: uomLabelFrom(uom),
      packLabel: uom?.full_name ?? uomLabelFrom(uom),
      uom,
    };
  }

  function countedBaseForLine(line) {
    const { factor } = productMeta(line.product_code);
    if (factor > 1) {
      return mixedToBase(
        counts[`${line.id}:packs`],
        counts[`${line.id}:loose`],
        factor,
      );
    }
    return Number(counts[line.id] ?? 0);
  }

  const showShop = session?.stock_location === "shop" || session?.stock_location === "both";
  const showStore = session?.stock_location === "store" || session?.stock_location === "both";

  const groupedProducts = useMemo(() => {
    const map = new Map();
    for (const line of lines) {
      let row = map.get(line.product_code);
      if (!row) {
        const product = productByCode.get(line.product_code);
        const { factor, label } = productMeta(line.product_code);
        row = {
          product_code: line.product_code,
          product_name: product?.product_name ?? line.product_code,
          factor,
          label,
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
      const { factor, label, packLabel, uom } = productMeta(line.product_code);
      const systemBase = Number(line.system_quantity ?? 0);
      const countedBase = countedBaseForLine(line);
      const varianceBase = countedBase - systemBase;
      if (Math.abs(varianceBase) >= 0.0001) {
        items.push({
          line,
          label,
          packLabel,
          uom,
          factor,
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
    setError(null);
    try {
      for (const line of lines) {
        const baseValue = countedBaseForLine(line);
        if (Math.abs(baseValue - Number(line.counted_quantity)) < 0.0001) continue;
        await apiRequest(`/stock-take-lines/${line.id}`, {
          method: "PUT",
          body: { counted_quantity: baseValue },
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save counts");
    } finally {
      setSaving(false);
    }
  }

  async function completeSession() {
    if (dirty) {
      setError("Save your counts before closing the stock take.");
      setCompleteOpen(false);
      return;
    }
    setCompleting(true);
    setError(null);
    try {
      await apiRequest(`/inventory/stock-take/${sessionId}/complete`, { method: "POST" });
      setCompleteOpen(false);
      router.push("/inventory/stock-take");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to close stock take");
    } finally {
      setCompleting(false);
    }
  }

  const readOnly = session?.status === "completed";

  function locationCells(line) {
    if (!line) {
      return (
        <>
          <td className="px-3 py-2 text-right text-slate-400">—</td>
          <td className="px-3 py-2 text-right text-slate-400">—</td>
          <td className="px-3 py-2 text-right text-slate-400">—</td>
        </>
      );
    }
    const { factor, packLabel, uom } = productMeta(line.product_code);
    const systemText = formatMixedStockDisplay(line.system_quantity, uom ?? factor, packLabel).text;
    const countedBase = countedBaseForLine(line);
    const varianceBase = countedBase - Number(line.system_quantity ?? 0);
    const varianceText = formatMixedStockDisplay(Math.abs(varianceBase), uom ?? factor, packLabel).text;

    return (
      <>
        <td className="px-3 py-2 text-right text-sm text-slate-700">{systemText}</td>
        <td className="px-3 py-2 text-right">
          {readOnly ? (
            <span className="text-sm tabular-nums">
              {formatMixedStockDisplay(countedBase, uom ?? factor, packLabel).text}
            </span>
          ) : factor > 1 ? (
            <div className="flex flex-col items-end gap-1">
              <label className="flex items-center gap-1 text-[10px] text-slate-500">
                Packs
                <input
                  type="number"
                  min="0"
                  step="1"
                  className={`${inputClassName()} w-16 text-right`}
                  value={counts[`${line.id}:packs`] ?? ""}
                  onChange={(e) => setCount(`${line.id}:packs`, e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="flex items-center gap-1 text-[10px] text-slate-500">
                Loose pcs
                <input
                  type="number"
                  min="0"
                  step="any"
                  className={`${inputClassName()} w-16 text-right`}
                  value={counts[`${line.id}:loose`] ?? ""}
                  onChange={(e) => setCount(`${line.id}:loose`, e.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
          ) : (
            <input
              type="number"
              step="any"
              className={`${inputClassName()} w-20 text-right`}
              value={counts[line.id] ?? ""}
              onChange={(e) => setCount(line.id, e.target.value)}
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
        !readOnly ? (
          <div className="flex flex-wrap gap-2">
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
          </div>
        ) : null
      }
    >
      <div className="mb-4 space-y-1">
        <Link href="/inventory/stock-take" className="text-sm text-[#185FA5] hover:underline">
          ← Back to sessions
        </Link>
        {!readOnly ? (
          <p className="text-sm text-slate-500">
            For pack products, enter full packs and any loose pieces left (e.g. 1 carton, 2 pcs).
            Save, then close to update system stock.
            {dirty ? <span className="ml-2 text-amber-700">Unsaved changes.</span> : null}
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <InventoryTableShell>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading count sheet…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium" rowSpan={2}>
                    Product
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
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
                        <p className="text-xs text-slate-500">{row.label}</p>
                      </td>
                      {showShop ? locationCells(row.shop) : null}
                      {showStore ? locationCells(row.store) : null}
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
                    {product?.product_name ?? item.line.product_code}{" "}
                    <span className="text-slate-400 capitalize">({item.location})</span>
                  </span>
                  <span className={varianceClass(item.varianceBase)}>
                    {item.varianceBase > 0 ? "+" : item.varianceBase < 0 ? "−" : ""}
                    {formatMixedStockDisplay(Math.abs(item.varianceBase), item.uom ?? item.factor, item.packLabel).text}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Counts match system quantities.</p>
        )}
      </FormModal>
    </InventoryPageShell>
  );
}
