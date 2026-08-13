"use client";

import { notifyError, notifySuccess } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, fetchAllPaginated, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useListPageSize } from "@/lib/use-list-page-controls";
import {
  fetchCategoriesCached,
  fetchSubCategoriesCached,
  fetchSuppliersCached,
  fetchUomsCached,
} from "@/lib/reference-data-cache";
import { useQueuedTask } from "@/lib/use-queued-task";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { canDirectInventoryAction, canResetStockTakeStocks } from "@/lib/approval-permissions";
import { useConfirm } from "@/lib/use-confirm";
import {
  FormModal,
  PrimaryButton,
  Field,
  FilterSelect,
  FilterToolbar,
  FILTER_CONTROL_CLASS,
  PaginationBar,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  InventoryPageShell,
  InventoryTableShell,
  SESSION_STATUS_LABELS,
  stockTakeProductScopeLabel,
} from "@/components/inventory/inventory-shared";
import {
  countKey,
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
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";

function varianceClass(value) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-slate-500";
}

function uomFromLine(line, uomMap) {
  if (line?.unit_id != null && uomMap.has(line.unit_id)) {
    return uomMap.get(line.unit_id);
  }
  if (line?.conversion_factor != null || line?.uom_name || line?.uom_type) {
    return {
      id: line.unit_id,
      full_name: line.uom_name,
      conversion_factor: line.conversion_factor,
      small_packaging_label: line.small_packaging_label,
      middle_packaging_label: line.middle_packaging_label,
      middle_factor: line.middle_factor,
      uom_type: line.uom_type,
    };
  }
  return null;
}

export function InventoryStockTakeIdScreen() {
  const params = useParams();
  const router = useRouter();
  const confirm = useConfirm();
  const { organization, capabilities, hasPermission, user } = useAuth();
  const sessionId = params.id;
  const canResetStocks = canResetStockTakeStocks({ hasPermission });

  const [session, setSession] = useState(null);
  const [lines, setLines] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [counts, setCounts] = useState({});
  const [lineById, setLineById] = useState({});
  const [touchedIds, setTouchedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [resettingStocks, setResettingStocks] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(50);
  const [totalLines, setTotalLines] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const { runQueuedTask, overlayNode } = useQueuedTask("Saving stock take counts…");

  const loadMeta = useCallback(async () => {
    setLoading(true);
    try {
      const [sess, uomRows, categoryRows, subCategoryRows, supplierRows] = await Promise.all([
        apiRequest(`/stock-take-sessions/${sessionId}`),
        fetchUomsCached(organization?.id).catch(() => []),
        fetchCategoriesCached(organization?.id).catch(() => []),
        fetchSubCategoriesCached(organization?.id).catch(() => []),
        fetchSuppliersCached(organization?.id).catch(() => []),
      ]);
      setSession(sess);
      setUoms(uomRows ?? []);
      setCategories(categoryRows ?? []);
      setSubCategories(subCategoryRows ?? []);
      setSuppliers(supplierRows ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load stock take session");
    } finally {
      setLoading(false);
    }
  }, [sessionId, organization?.id]);

  const loadLines = useCallback(async () => {
    if (!session) return;
    setListLoading(true);
    try {
      const allowedLocations =
        session?.stock_location === "shop"
          ? ["shop"]
          : session?.stock_location === "store"
            ? ["store"]
            : null;

      const filters = { session_id: sessionId };
      if (allowedLocations?.length === 1) {
        filters.stock_location = allowedLocations[0];
      }

      const extra = {};
      if (categoryFilter !== "all") extra.category_id = categoryFilter;
      if (subcategoryFilter !== "all") extra.subcategory_id = subcategoryFilter;

      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        filters,
        extra,
        sort: "product_name",
        sortDir: "asc",
      });

      const res = await apiRequest("/stock-take-lines", {
        searchParams,
        loading: false,
      });
      const parsed = parsePaginator(res);
      const pageRows = allowedLocations
        ? parsed.items.filter((line) => allowedLocations.includes(line.stock_location))
        : parsed.items;

      const uomMap = new Map((uoms ?? []).map((u) => [u.id, u]));
      const productMap = new Map();
      const pageCounts = {};

      for (const line of pageRows) {
        if (line.product_code && !productMap.has(line.product_code)) {
          productMap.set(line.product_code, {
            product_code: line.product_code,
            product_name: line.product_name,
            unit_id: line.unit_id,
            subcategory_id: line.subcategory_id,
          });
        }
        const uom = uomFromLine(line, uomMap);
        const levels = uomStockTakeLevels(uom);
        Object.assign(pageCounts, initStockTakeCounts(line.id, line.counted_quantity, uom, levels));
      }

      setLines(pageRows);
      setProducts([...productMap.values()]);
      setTotalLines(parsed.total);
      setTotalPages(parsed.totalPages);
      setLineById((prev) => {
        const next = { ...prev };
        for (const line of pageRows) {
          next[line.id] = line;
        }
        return next;
      });
      setCounts((prev) => {
        const next = { ...prev };
        for (const [key, value] of Object.entries(pageCounts)) {
          if (next[key] === undefined) next[key] = value;
        }
        return next;
      });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load stock take lines");
    } finally {
      setListLoading(false);
    }
  }, [
    session,
    sessionId,
    page,
    pageSize,
    debouncedSearch,
    categoryFilter,
    subcategoryFilter,
    uoms,
  ]);

  useTabAwareDataLoad(loadMeta);

  useTabAwareDataLoad(
    useCallback(() => {
      if (!session) return;
      return loadLines();
    }, [session, loadLines]),
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryFilter, subcategoryFilter, pageSize]);

  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const productByCode = useMemo(
    () => new Map(products.map((p) => [p.product_code, p])),
    [products],
  );

  const showTaxonomyFilters =
    session &&
    !session.filter_category_id &&
    !session.filter_subcategory_id;

  const filterSubCategoryOptions = useMemo(() => {
    if (categoryFilter === "all") return subCategories;
    return subCategories.filter((sub) => String(sub.category_id) === categoryFilter);
  }, [subCategories, categoryFilter]);

  function productMeta(productCode) {
    const product = productByCode.get(productCode);
    const line = lines.find((entry) => entry.product_code === productCode);
    const uom =
      (product?.unit_id != null ? uomById.get(product.unit_id) : null) ??
      (line
        ? {
            id: line.unit_id,
            full_name: line.uom_name,
            conversion_factor: line.conversion_factor,
            small_packaging_label: line.small_packaging_label,
            middle_packaging_label: line.middle_packaging_label,
            middle_factor: line.middle_factor,
            uom_type: line.uom_type,
          }
        : null);
    const levels = uomStockTakeLevels(uom);
    return {
      uom,
      levels,
      hierarchy: uomHierarchyChain(uom),
      countHint: uomStockTakeHint(uom),
    };
  }

  function resolveLineUom(line) {
    if (!line) return null;
    if (line.unit_id != null && uomById.has(line.unit_id)) {
      return uomById.get(line.unit_id);
    }
    if (line.conversion_factor != null || line.uom_name || line.uom_type) {
      return {
        id: line.unit_id,
        full_name: line.uom_name,
        conversion_factor: line.conversion_factor,
        small_packaging_label: line.small_packaging_label,
        middle_packaging_label: line.middle_packaging_label,
        middle_factor: line.middle_factor,
        uom_type: line.uom_type,
      };
    }
    return null;
  }

  function countedBaseForLine(line) {
    const uom = resolveLineUom(line) ?? productMeta(line.product_code).uom;
    const levels = uomStockTakeLevels(uom);
    const byKey = readStockTakeCounts(line.id, levels, counts);
    return stockTakeCountsToBase(byKey, uom);
  }

  function lineCountsInitialized(line) {
    const uom = resolveLineUom(line) ?? productMeta(line.product_code).uom;
    const levels = uomStockTakeLevels(uom);
    return levels.some((level) => counts[countKey(line.id, level.key)] !== undefined);
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
  }, [lines, productByCode, uomById, counts]);

  const dirty = useMemo(() => {
    if (touchedIds.size > 0) return true;
    for (const line of lines) {
      if (!lineCountsInitialized(line)) continue;
      const currentBase = countedBaseForLine(line);
      if (Math.abs(currentBase - Number(line.counted_quantity ?? 0)) >= 0.0001) return true;
    }
    return false;
  }, [lines, counts, touchedIds, productByCode, uomById]);

  const pageVariances = useMemo(() => {
    const items = [];
    for (const line of lines) {
      const willApply = Boolean(line.is_counted) || touchedIds.has(line.id);
      if (!willApply) continue;
      const meta = productMeta(line.product_code);
      const liveBase = Number(line.live_quantity ?? line.system_quantity ?? 0);
      const countedBase = countedBaseForLine(line);
      const varianceBase = countedBase - liveBase;
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
  }, [lines, counts, touchedIds, productByCode, uomById]);

  function setCount(key, value) {
    const lineId = Number(String(key).split(":")[0]);
    if (Number.isFinite(lineId) && lineId > 0) {
      setTouchedIds((prev) => {
        if (prev.has(lineId)) return prev;
        const next = new Set(prev);
        next.add(lineId);
        return next;
      });
    }
    setCounts((prev) => ({ ...prev, [key]: value }));
  }

  function handlePageChange(nextPage) {
    setPage(nextPage);
  }

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  function buildSavePayloadLines() {
    const candidateIds = new Set(touchedIds);
    for (const line of lines) {
      if (!lineCountsInitialized(line)) continue;
      const currentBase = countedBaseForLine(line);
      if (Math.abs(currentBase - Number(line.counted_quantity ?? 0)) >= 0.0001) {
        candidateIds.add(line.id);
      }
    }

    const payloadLines = [];
    for (const id of candidateIds) {
      const line = lineById[id] ?? lines.find((entry) => entry.id === id);
      if (!line) continue;
      payloadLines.push({
        id: line.id,
        counted_quantity: countedBaseForLine(line),
      });
    }
    return payloadLines;
  }

  async function saveCounts() {
    setSaving(true);
    try {
      const payloadLines = buildSavePayloadLines();

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

      // Drop saved keys so reload re-inits from server values.
      const savedIds = new Set(payloadLines.map((line) => line.id));
      setCounts((prev) => {
        const next = { ...prev };
        for (const line of payloadLines) {
          for (const key of Object.keys(next)) {
            if (key.startsWith(`${line.id}:`)) delete next[key];
          }
        }
        return next;
      });
      setTouchedIds((prev) => {
        const next = new Set(prev);
        for (const id of savedIds) next.delete(id);
        return next;
      });
      setLineById((prev) => {
        const next = { ...prev };
        for (const saved of payloadLines) {
          if (!next[saved.id]) continue;
          next[saved.id] = {
            ...next[saved.id],
            counted_quantity: saved.counted_quantity,
            is_counted: true,
          };
        }
        return next;
      });
      await loadLines();
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
      const completeRequest = () =>
        apiRequest(`/inventory/stock-take/${sessionId}/complete`, { method: "POST" });

      if (totalLines > 50) {
        await runQueuedTask(completeRequest, {
          message: `Completing stock take (${totalLines} lines)…`,
        });
      } else {
        await completeRequest();
      }
      setCompleteOpen(false);
      router.push("/inventory/stock-take");
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Failed to close stock take");
    } finally {
      setCompleting(false);
    }
  }

  const readOnly = session?.status === "completed";

  const hasSavedCounts = useMemo(
    () => lines.some((line) => line.is_counted) || Object.values(lineById).some((line) => line.is_counted),
    [lines, lineById],
  );

  async function handleResetStocks() {
    if (!canResetStocks || readOnly || !totalLines) return;
    if (dirty) {
      notifyError("Save or discard unsaved counts before resetting stocks.");
      return;
    }
    if (hasSavedCounts) {
      notifyError("Cannot reset after counts have been saved. Start a new stock take session instead.");
      return;
    }

    const scopeLabel =
      session?.stock_location === "shop"
        ? "shop"
        : session?.stock_location === "store"
          ? "store / warehouse"
          : "shop and store";

    const ok = await confirm({
      title: "Reset all stocks to zero?",
      message: `This zeros ERP stock for every product in this session (${scopeLabel}) before you count. Use this when opening balances are wrong and you want to rebuild from a physical count. This cannot be undone.`,
      confirmLabel: "Reset stocks to 0",
      destructive: true,
    });
    if (!ok) return;

    setResettingStocks(true);
    try {
      const resetRequest = () =>
        apiRequest(`/inventory/stock-take/${sessionId}/reset-stocks`, { method: "POST" });

      if (totalLines > 50) {
        await runQueuedTask(resetRequest, {
          message: `Resetting stock for ${totalLines} lines…`,
        });
      } else {
        await resetRequest();
      }

      setCounts({});
      setTouchedIds(new Set());
      setLineById({});
      notifySuccess("Stocks reset to zero. Enter your physical counts, then save and close the stock take.");
      await loadLines();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to reset stocks");
    } finally {
      setResettingStocks(false);
    }
  }

  async function handlePrint() {
    if (dirty) {
      notifyError("Save your counts before printing.");
      return;
    }
    setPrinting(true);
    try {
      const extra = {
        "filter[session_id]": sessionId,
        sort: "product_name",
        sort_dir: "asc",
      };
      if (session?.stock_location === "shop" || session?.stock_location === "store") {
        extra["filter[stock_location]"] = session.stock_location;
      }
      if (categoryFilter !== "all") extra.category_id = categoryFilter;
      if (subcategoryFilter !== "all") extra.subcategory_id = subcategoryFilter;
      const q = String(debouncedSearch ?? "").trim();
      if (q) extra.q = q;

      const allLines = await fetchAllPaginated(apiRequest, "/stock-take-lines", {
        perPage: 200,
        extra,
      });

      const printProductByCode = new Map();
      for (const line of allLines) {
        if (line.product_code && !printProductByCode.has(line.product_code)) {
          printProductByCode.set(line.product_code, {
            product_code: line.product_code,
            product_name: line.product_name,
            unit_id: line.unit_id,
            subcategory_id: line.subcategory_id,
          });
        }
      }

      printStockTakeSheet({
        session,
        rows: stockTakePrintRowsFromLines(allLines, printProductByCode, uomById),
        organization,
        blankCounted: true,
      });
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load lines for print");
    } finally {
      setPrinting(false);
    }
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
    const liveBase = Number(line.live_quantity ?? line.system_quantity ?? 0);
    const systemText = formatMixedStockDisplay(liveBase, uom).text;
    const countedBase = countedBaseForLine(line);
    const willApply = Boolean(line.is_counted) || touchedIds.has(line.id);
    const varianceBase = willApply ? countedBase - liveBase : 0;
    const varianceText = formatMixedStockDisplay(Math.abs(varianceBase), uom).text;
    const levels = uomStockTakeLevels(uom);

    return (
      <>
        <td className="px-3 py-2 text-right text-sm text-slate-700">{systemText}</td>
        <td className="px-3 py-2 text-right">
          {readOnly ? (
            <span className="text-sm tabular-nums">
              {formatMixedStockDisplay(countedBase, uom).text}
              {line.is_counted ? (
                <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                  Counted
                </span>
              ) : (
                <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">
                  Not counted
                </span>
              )}
            </span>
          ) : levels.length === 1 && levels[0].key === "small" ? (
            <div className="flex flex-col items-end gap-0.5">
              <input
                type="number"
                step="any"
                className={`${inputClassName()} w-20 text-right`}
                value={counts[`${line.id}:small`] ?? ""}
                onChange={(e) => setCount(`${line.id}:small`, e.target.value)}
                disabled={saving}
                aria-label={`${levels[0].label} count`}
              />
              {willApply ? (
                <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                  Will update stock
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">Edit to count</span>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-end gap-0.5">
              <StockTakeCountInputs
                lineId={line.id}
                uom={uom}
                counts={counts}
                onChange={setCount}
                disabled={saving}
              />
              {willApply ? (
                <span className="text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                  Will update stock
                </span>
              ) : (
                <span className="text-[10px] text-slate-400">Edit to count</span>
              )}
            </div>
          )}
        </td>
        <td className={`px-3 py-2 text-right text-sm tabular-nums font-medium ${willApply ? varianceClass(varianceBase) : "text-slate-400"}`}>
          {willApply ? (
            <>
              {varianceBase > 0 ? "+" : varianceBase < 0 ? "−" : ""}
              {varianceText}
            </>
          ) : (
            "—"
          )}
        </td>
      </>
    );
  }

  const safePage = Math.min(page, totalPages);
  const tableBusy = listLoading && lines.length === 0;

  return (
    <InventoryPageShell
      title={session?.session_code ?? "Stock take"}
      subtitle={
        session
          ? `${SESSION_STATUS_LABELS[session.status] ?? session.status} · ${session.stock_location?.replace("_", " ")} · ${stockTakeProductScopeLabel(session, {
              categories,
              subCategories,
              suppliers,
            })}`
          : "Count products and reconcile variances"
      }
      backHref="/inventory/stock-take"
      backLabel="Back to stock take"
      action={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handlePrint()}
            disabled={loading || printing || !totalLines}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {printing ? "Preparing…" : "Print count sheet"}
          </button>
          {!readOnly ? (
            <>
              {canResetStocks ? (
                <button
                  type="button"
                  onClick={() => void handleResetStocks()}
                  disabled={resettingStocks || saving || completing || !totalLines || dirty || hasSavedCounts}
                  title={
                    hasSavedCounts
                      ? "Cannot reset after counts have been saved"
                      : dirty
                        ? "Save or discard unsaved counts first"
                        : "Zero ERP stock for all products in this session before counting"
                  }
                  className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  {resettingStocks ? "Resetting…" : "Reset stocks"}
                </button>
              ) : null}
              <PrimaryButton type="button" showIcon={false} onClick={saveCounts} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save counts"}
              </PrimaryButton>
              <button
                type="button"
                onClick={() => setCompleteOpen(true)}
                disabled={!totalLines || dirty || saving}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Close stock take
              </button>
            </>
          ) : null}
        </div>
      }
    >
      <AppBreadcrumb
        showBack={false}
        items={[
          { label: "Stock take", href: "/inventory/stock-take" },
          { label: session?.session_code ?? "Session" },
        ]}
      />
      <div className="mb-4 space-y-1">
        {!readOnly ? (
          <p className="text-sm text-slate-500">
            Edit and save only the products you physically count. Closing updates ERP stock for
            those saved counts only — other SKUs keep live POS/receipt balances.
            {canResetStocks ? (
              <>
                {" "}
                Admins can use <strong>Reset stocks</strong> first to zero opening balances before
                counting.
              </>
            ) : null}
            {dirty ? <span className="ml-2 text-amber-700">Unsaved changes.</span> : null}
          </p>
        ) : null}
      </div>

      {!loading && (totalLines > 0 || debouncedSearch || categoryFilter !== "all" || subcategoryFilter !== "all") ? (
        <FilterToolbar className="flex-wrap">
          <Field label="Search">
            <input
              type="search"
              className={`${FILTER_CONTROL_CLASS} w-72 sm:w-96`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Product name or code…"
            />
          </Field>
          {showTaxonomyFilters ? (
            <>
              <Field label="Category">
                <FilterSelect
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setSubcategoryFilter("all");
                  }}
                  options={[
                    { value: "all", label: "All categories" },
                    ...categories.map((category) => ({
                      value: String(category.id),
                      label: category.category_name ?? `Category #${category.id}`,
                    })),
                  ]}
                />
              </Field>
              <Field label="Subcategory">
                <FilterSelect
                  value={subcategoryFilter}
                  onChange={(e) => setSubcategoryFilter(e.target.value)}
                  options={[
                    { value: "all", label: "All subcategories" },
                    ...filterSubCategoryOptions.map((sub) => ({
                      value: String(sub.id),
                      label: sub.subcategory_name ?? `Subcategory #${sub.id}`,
                    })),
                  ]}
                />
              </Field>
            </>
          ) : null}
          <p className="pb-2 text-xs text-slate-500">
            {listLoading ? "Loading…" : `${totalLines} line${totalLines === 1 ? "" : "s"}`}
            {groupedProducts.length ? ` · ${groupedProducts.length} on this page` : ""}
          </p>
        </FilterToolbar>
      ) : null}

      <InventoryTableShell>
        {loading || tableBusy ? (
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
                      No count lines match this page or filters.
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
        {!loading && totalLines > 0 ? (
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            total={totalLines}
            pageSize={pageSize}
            onChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        ) : null}
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
          Closing updates stock only for products you saved counts for. Uncounted lines are left
          unchanged so POS sales and receipts stay correct.
        </p>
        {pageVariances.length > 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            This page has {pageVariances.length} variance
            {pageVariances.length === 1 ? "" : "s"} among counted lines — other pages may have more.
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            Counted lines on this page match live stock (or nothing has been counted yet).
          </p>
        )}
      </FormModal>
      {overlayNode}
    </InventoryPageShell>
  );
}
