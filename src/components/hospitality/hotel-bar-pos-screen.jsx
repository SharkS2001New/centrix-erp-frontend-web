"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api";
import {
  addHotelCheckLine,
  assignHotelCheckTable,
  clearHotelCheck,
  fetchHotelPosCatalog,
  fetchHotelPosSettings,
  holdHotelCheck,
  listCollectibleHotelChecks,
  listHotelFloorTables,
  openHotelCheck,
  removeHotelCheckLine,
  resumeHotelCheck,
  saveHotelCheck,
  settleHotelCheck,
  updateHotelCheckLineQty,
} from "@/lib/hospitality-pos-api";
import {
  formatHotelMoney,
  normalizeHotelPosGridColumns,
  resolveHotelPosSettings,
} from "@/lib/hotel-pos-settings";
import { resolveHospitalityPaymentWorkflow } from "@/lib/hospitality-payment-workflow";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import { getCheckoutPaymentConfig } from "@/lib/sales-settings";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PosActionButton } from "@/components/sales/pos-action-button";
import { HotelPosPaymentPanel } from "@/components/hospitality/hotel-pos-payment-panel";
import { printHospitalityCheckReceipt } from "@/components/hospitality/hospitality-check-receipt-print";

function dedupeError(e) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export function HotelBarPosScreen() {
  const { capabilities, user } = useAuth();
  const hotelSettings = resolveHotelPosSettings(capabilities);
  const paymentWorkflow = resolveHospitalityPaymentWorkflow(capabilities);
  const [gridColumns, setGridColumns] = useState(hotelSettings.gridColumns);
  const [collectPayment, setCollectPayment] = useState(hotelSettings.collectPayment);
  const [catalogLimit, setCatalogLimit] = useState(hotelSettings.catalogLimit);
  const [stockDeductOnSettle, setStockDeductOnSettle] = useState(hotelSettings.stockDeductOnSettle);
  const [tablePosEnabled, setTablePosEnabled] = useState(
    isHospitalityServiceEnabled(capabilities, "table_pos"),
  );
  const [unpaidEnabled, setUnpaidEnabled] = useState(paymentWorkflow.unpaid);
  const [partialEnabled, setPartialEnabled] = useState(paymentWorkflow.partially_paid);
  const [floorTables, setFloorTables] = useState([]);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [catalogNextOffset, setCatalogNextOffset] = useState(null);
  const [searching, setSearching] = useState(false);
  const [check, setCheck] = useState(null);
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueChecks, setQueueChecks] = useState([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payError, setPayError] = useState(null);
  const searchRef = useRef(null);
  const catalogScrollRef = useRef(null);
  const loadMoreSentinelRef = useRef(null);
  const catalogRequestIdRef = useRef(0);

  const paymentConfig = useMemo(
    () =>
      getCheckoutPaymentConfig(capabilities?.module_settings, {
        checkoutContext: "pos",
        capabilities,
      }),
    [capabilities],
  );

  useEffect(() => {
    setGridColumns(hotelSettings.gridColumns);
    setCollectPayment(hotelSettings.collectPayment);
    setCatalogLimit(hotelSettings.catalogLimit);
    setStockDeductOnSettle(hotelSettings.stockDeductOnSettle);
    setTablePosEnabled(isHospitalityServiceEnabled(capabilities, "table_pos"));
    setUnpaidEnabled(paymentWorkflow.unpaid);
    setPartialEnabled(paymentWorkflow.partially_paid);
  }, [
    hotelSettings.gridColumns,
    hotelSettings.collectPayment,
    hotelSettings.catalogLimit,
    hotelSettings.stockDeductOnSettle,
    capabilities,
    paymentWorkflow.unpaid,
    paymentWorkflow.partially_paid,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await fetchHotelPosSettings();
        if (cancelled) return;
        if (settings?.hotel_pos_collect_payment != null) {
          setCollectPayment(Boolean(settings.hotel_pos_collect_payment));
        }
        if (settings?.table_pos_enabled != null) {
          setTablePosEnabled(Boolean(settings.table_pos_enabled));
        }
        if (settings?.payment_workflow) {
          const wf = resolveHospitalityPaymentWorkflow({
            hospitality_payment_workflow: settings.payment_workflow,
          });
          setUnpaidEnabled(wf.unpaid);
          setPartialEnabled(wf.partially_paid);
        }
        if (settings?.table_pos_enabled || settings?.floor_tables_enabled) {
          const tablesRes = await listHotelFloorTables();
          if (!cancelled) {
            setFloorTables(Array.isArray(tablesRes?.data) ? tablesRes.data : []);
          }
        } else {
          setFloorTables([]);
        }
      } catch {
        /* capabilities fallback already applied */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => clearTimeout(t);
  }, [search]);

  const applyCatalogMeta = useCallback((res) => {
    setSearching(Boolean(res?.searching));
    if (res?.grid_columns != null) setGridColumns(normalizeHotelPosGridColumns(res.grid_columns));
    if (res?.collect_payment != null) setCollectPayment(Boolean(res.collect_payment));
    if (res?.catalog_limit != null) setCatalogLimit(Number(res.catalog_limit) || 30);
    if (res?.stock_deduct_on_settle != null) setStockDeductOnSettle(Boolean(res.stock_deduct_on_settle));
    setCatalogHasMore(Boolean(res?.has_more));
    setCatalogNextOffset(res?.next_offset ?? null);
  }, []);

  const loadCatalog = useCallback(
    async (q, { offset = 0, append = false } = {}) => {
      const requestId = ++catalogRequestIdRef.current;
      if (append) setCatalogLoadingMore(true);
      else setCatalogLoading(true);
      try {
        const res = await fetchHotelPosCatalog({
          q,
          perPage: catalogLimit,
          popularDays: 5,
          offset,
        });
        if (requestId !== catalogRequestIdRef.current) return;
        const batch = Array.isArray(res?.items) ? res.items : [];
        setProducts((prev) => {
          if (!append) return batch;
          const seen = new Set(prev.map((p) => p.product_code));
          const merged = [...prev];
          for (const item of batch) {
            if (!seen.has(item.product_code)) {
              seen.add(item.product_code);
              merged.push(item);
            }
          }
          return merged;
        });
        applyCatalogMeta(res);
      } catch (e) {
        if (requestId !== catalogRequestIdRef.current) return;
        notifyError(dedupeError(e));
        if (!append) {
          setProducts([]);
          setCatalogHasMore(false);
          setCatalogNextOffset(null);
        }
      } finally {
        if (requestId === catalogRequestIdRef.current) {
          setCatalogLoading(false);
          setCatalogLoadingMore(false);
        }
      }
    },
    [catalogLimit, applyCatalogMeta],
  );

  useEffect(() => {
    void loadCatalog(debouncedSearch, { offset: 0, append: false });
  }, [debouncedSearch, loadCatalog]);

  const loadMoreCatalog = useCallback(() => {
    if (catalogLoading || catalogLoadingMore || !catalogHasMore) return;
    if (catalogNextOffset == null) return;
    void loadCatalog(debouncedSearch, { offset: catalogNextOffset, append: true });
  }, [
    catalogLoading,
    catalogLoadingMore,
    catalogHasMore,
    catalogNextOffset,
    debouncedSearch,
    loadCatalog,
  ]);

  useEffect(() => {
    const root = catalogScrollRef.current;
    const sentinel = loadMoreSentinelRef.current;
    if (!root || !sentinel) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreCatalog();
        }
      },
      { root, rootMargin: "160px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMoreCatalog, products.length, catalogHasMore]);

  async function startFreshCheck() {
    const body = { branch_id: user?.branch_id ?? undefined };
    if (tablePosEnabled && selectedTableId) {
      body.floor_table_id = Number(selectedTableId);
    }
    const opened = await openHotelCheck(body);
    setCheck(opened?.check ?? null);
    setSelectedLineId(null);
    return opened?.check ?? null;
  }

  async function ensureTableAssigned(activeCheck) {
    if (!tablePosEnabled) return activeCheck;
    const tableId = selectedTableId || activeCheck?.floor_table_id;
    if (!tableId) {
      throw new Error("Select a table before saving or collecting payment.");
    }
    if (Number(activeCheck?.floor_table_id) === Number(tableId)) {
      return activeCheck;
    }
    const res = await assignHotelCheckTable(activeCheck.id, Number(tableId));
    const next = res?.check ?? activeCheck;
    setCheck(next);
    return next;
  }

  async function handleTapProduct(product) {
    if (!product?.product_code || busy) return;
    setBusy(true);
    try {
      let active = check;
      if (
        !active?.id ||
        active.status === "paid" ||
        active.status === "settled" ||
        active.status === "void"
      ) {
        active = await startFreshCheck();
      }
      if (!active?.id) throw new Error("Could not open check.");
      const res = await addHotelCheckLine(active.id, product.product_code, 1);
      setCheck(res?.check ?? null);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveSelected() {
    if (!check?.id || !selectedLineId || busy) return;
    setBusy(true);
    try {
      const res = await removeHotelCheckLine(check.id, selectedLineId);
      setCheck(res?.check ?? null);
      setSelectedLineId(null);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!check?.id || !check.lines?.length || busy) return;
    if (!window.confirm("Clear all items from this check?")) return;
    setBusy(true);
    try {
      const res = await clearHotelCheck(check.id);
      setCheck(res?.check ?? null);
      setSelectedLineId(null);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleHold() {
    if (!check?.id || !check.lines?.length || busy) return;
    if (!unpaidEnabled) {
      notifyError("Unpaid orders are not enabled for this organization.");
      return;
    }
    setBusy(true);
    try {
      await ensureTableAssigned(check);
      const res = await holdHotelCheck(check.id);
      printHospitalityCheckReceipt(res?.check ?? check, { title: "Unpaid order" });
      notifySuccess(`Order ${check.check_number} saved unpaid.`);
      await startFreshCheck();
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveOrder() {
    if (!check?.id || !check.lines?.length || busy) return;
    if (!unpaidEnabled) {
      notifyError("Unpaid orders are not enabled. Use Collect payment.");
      return;
    }
    setBusy(true);
    try {
      await ensureTableAssigned(check);
      const res = await saveHotelCheck(check.id, {
        floor_table_id: selectedTableId ? Number(selectedTableId) : undefined,
      });
      printHospitalityCheckReceipt(res?.check ?? check, { title: "Unpaid order" });
      notifySuccess(`Order ${check.check_number} saved unpaid — receipt printed.`);
      await startFreshCheck();
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function openCollectibleList() {
    setQueueOpen(true);
    try {
      const res = await listCollectibleHotelChecks();
      setQueueChecks(Array.isArray(res?.checks) ? res.checks : []);
    } catch (e) {
      notifyError(dedupeError(e));
      setQueueChecks([]);
    }
  }

  async function handleResumeHeld(row) {
    if (!row?.id || busy) return;
    setBusy(true);
    try {
      const res = await resumeHotelCheck(row.id);
      const next = res?.check ?? row;
      setCheck(next);
      if (next?.floor_table_id) setSelectedTableId(String(next.floor_table_id));
      setSelectedLineId(null);
      setQueueOpen(false);
      notifySuccess(`Opened ${row.check_number}`);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCollectFromQueue(row) {
    if (!row?.id || busy) return;
    setBusy(true);
    try {
      const res = await resumeHotelCheck(row.id);
      const next = res?.check ?? row;
      setCheck(next);
      if (next?.floor_table_id) setSelectedTableId(String(next.floor_table_id));
      setSelectedLineId(null);
      setQueueOpen(false);
      setPayError(null);
      setPayOpen(true);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  function handlePrimaryComplete() {
    if (!check?.id || !check.lines?.length || busy) return;
    if (collectPayment) {
      setPayError(null);
      setPayOpen(true);
      return;
    }
    void handleSaveOrder();
  }

  async function handlePaymentComplete({ payments }) {
    if (!check?.id) return;
    setBusy(true);
    setPayError(null);
    try {
      await ensureTableAssigned(check);
      const res = await settleHotelCheck(check.id, {
        payments,
        floor_table_id: selectedTableId ? Number(selectedTableId) : undefined,
      });
      const next = res?.check;
      const status = next?.status;
      if (status === "paid" || status === "settled") {
        printHospitalityCheckReceipt(next, { title: "Paid receipt" });
        notifySuccess(`Paid ${next?.check_number ?? ""} — ${formatHotelMoney(next?.total)}`);
        setPayOpen(false);
        await startFreshCheck();
      } else {
        printHospitalityCheckReceipt(next, { title: "Partial payment" });
        notifySuccess(
          `Partial payment on ${next?.check_number ?? ""} — balance ${formatHotelMoney(next?.balance_due)}`,
        );
        setCheck(next);
        setPayOpen(false);
      }
      void loadCatalog(debouncedSearch, { offset: 0, append: false });
    } catch (e) {
      const message = dedupeError(e);
      setPayError(message);
      if (/stock|recipe|ingredient|inventory/i.test(message)) {
        notifyError(`${message} Configure recipes under Hospitality → Settings.`);
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function bumpQty(line, delta) {
    if (!check?.id || !line?.id || busy) return;
    const nextQty = Number(line.qty) + delta;
    setBusy(true);
    try {
      const res =
        nextQty <= 0
          ? await removeHotelCheckLine(check.id, line.id)
          : await updateHotelCheckLineQty(check.id, line.id, nextQty);
      setCheck(res?.check ?? null);
      if (nextQty <= 0) setSelectedLineId(null);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  const lines = check?.lines ?? [];
  const hasLines = lines.length > 0;
  const gridStyle = useMemo(
    () => ({ gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))` }),
    [gridColumns],
  );

  return (
    <div className="hotel-pos-root flex min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(1200px_600px_at_10%_-10%,color-mix(in_srgb,var(--theme-primary)_18%,transparent),transparent),var(--theme-page-bg)]">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-[var(--theme-border)]/80 lg:border-b-0 lg:border-r">
          <div className="shrink-0 px-4 pb-3 pt-4 sm:px-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-accent-text)]">
                  Hotel &amp; Bar
                </p>
                <h1 className="theme-heading mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                  Tap to sell
                </h1>
                <p className="theme-subtext mt-1 text-xs">
                  {searching
                    ? "Search results · scroll for more"
                    : `Most sold (last 5 days) · ${catalogLimit} at a time · scroll for more`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openCollectibleList()}
                  className="theme-secondary-btn rounded-full px-4 py-2 text-xs font-semibold"
                >
                  Unpaid
                </button>
                <Link
                  href="/choose-workspace"
                  className="theme-subtext rounded-full px-3 py-2 text-xs font-medium hover:underline"
                >
                  Switch
                </Link>
              </div>
            </div>
            {tablePosEnabled ? (
              <div className="mt-3">
                <label className="theme-subtext mb-1 block text-[11px] font-semibold uppercase tracking-wide">
                  Table {tablePosEnabled ? "(required to save / pay)" : ""}
                </label>
                <select
                  className="theme-input w-full rounded-xl px-3 py-2.5 text-sm"
                  value={selectedTableId}
                  onChange={(e) => setSelectedTableId(e.target.value)}
                >
                  <option value="">Select table…</option>
                  {floorTables.map((table) => (
                    <option key={table.id} value={String(table.id)}>
                      {table.label || table.code}
                      {table.zone ? ` · ${table.zone}` : ""}
                    </option>
                  ))}
                </select>
                {!floorTables.length ? (
                  <p className="theme-subtext mt-1 text-[11px]">
                    No tables yet — enable Floor tables and add them under Hospitality → Outlets.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="relative mt-4">
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search menu…"
                className="theme-input w-full rounded-2xl border-0 bg-[var(--theme-surface)] px-4 py-3.5 text-sm shadow-sm ring-1 ring-[var(--theme-border)] focus:ring-2 focus:ring-[var(--theme-primary)]"
                autoComplete="off"
              />
            </div>
            {stockDeductOnSettle ? (
              <p className="theme-subtext mt-2 text-[11px] leading-relaxed">
                Stock deduct on settle is on — ingredients move when you collect payment.{" "}
                <Link href="/hospitality/settings" className="font-semibold underline">
                  Recipes &amp; setup
                </Link>
              </p>
            ) : (
              <p className="theme-subtext mt-2 text-[11px] leading-relaxed">
                Kitchen stock balancing is off until configured.{" "}
                <Link href="/hospitality/settings" className="font-semibold underline">
                  Setup guide
                </Link>
              </p>
            )}
          </div>

          <div ref={catalogScrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-5">
            {catalogLoading && !products.length ? (
              <p className="theme-subtext py-20 text-center text-sm">Loading menu…</p>
            ) : !products.length ? (
              <p className="theme-subtext py-20 text-center text-sm">
                {debouncedSearch ? "No products match your search." : "No products in catalogue yet."}
              </p>
            ) : (
              <>
                <div className="grid gap-3" style={gridStyle}>
                  {products.map((product) => (
                    <button
                      key={product.product_code}
                      type="button"
                      disabled={busy}
                      onClick={() => void handleTapProduct(product)}
                      className="group relative flex min-h-[6.25rem] flex-col justify-between overflow-hidden rounded-2xl border border-[var(--theme-border)]/70 bg-[var(--theme-surface)] p-3.5 text-left shadow-[0_8px_24px_-18px_rgba(0,0,0,0.45)] transition duration-150 hover:-translate-y-0.5 hover:border-[var(--theme-primary)] hover:shadow-[0_16px_32px_-20px_rgba(0,0,0,0.55)] active:scale-[0.98] disabled:opacity-50"
                    >
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[var(--theme-primary)] to-transparent opacity-0 transition group-hover:opacity-70" />
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="theme-heading line-clamp-2 text-[15px] font-semibold leading-snug">
                            {product.product_name}
                          </span>
                          {product.is_popular ? (
                            <span className="shrink-0 rounded-full bg-amber-100/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-950">
                              Top
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-2">
                        <p className="text-base font-bold tabular-nums text-[var(--theme-accent-text)]">
                          {formatHotelMoney(product.unit_price)}
                        </p>
                        <span className="rounded-full bg-[var(--theme-primary-subtle)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--theme-text)] opacity-80 group-hover:opacity-100">
                          Add
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <div ref={loadMoreSentinelRef} className="h-8 w-full" aria-hidden />
                {catalogLoadingMore ? (
                  <p className="theme-subtext py-3 text-center text-xs">Loading more…</p>
                ) : null}
                {!catalogHasMore && products.length > 0 ? (
                  <p className="theme-subtext py-3 text-center text-[11px]">
                    {searching ? "End of search results" : "All menu items loaded"}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="flex min-h-0 w-full flex-col bg-[color-mix(in_srgb,var(--theme-surface)_92%,var(--theme-page-bg))] lg:w-[min(100%,26rem)] xl:w-[30rem] shrink-0">
          <div className="shrink-0 px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--theme-accent-text)]">
                  Check
                </p>
                <p className="theme-heading mt-0.5 font-mono text-lg font-semibold">
                  {check?.check_number ?? "New"}
                </p>
              </div>
              <span className="rounded-full border border-[var(--theme-border)] px-3 py-1 text-[11px] font-semibold capitalize">
                {check?.status ?? "ready"}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2">
            {!hasLines ? (
              <div className="mx-2 rounded-2xl border border-dashed border-[var(--theme-border)] px-4 py-14 text-center">
                <p className="theme-heading text-sm font-semibold">Ticket is empty</p>
                <p className="theme-subtext mt-1 text-xs">Tap a menu item to add it here</p>
              </div>
            ) : (
              <ul className="space-y-2 px-2 pb-2">
                {lines.map((line) => {
                  const selected = selectedLineId === line.id;
                  return (
                    <li key={line.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedLineId(line.id)}
                        className={`flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition ${
                          selected
                            ? "bg-[var(--theme-primary-subtle)] ring-1 ring-[var(--theme-primary)]"
                            : "bg-[var(--theme-surface)] ring-1 ring-[var(--theme-border)]/60 hover:ring-[var(--theme-primary)]/40"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="theme-heading text-sm font-semibold">{line.description}</p>
                          <p className="theme-subtext mt-0.5 text-xs">
                            {formatHotelMoney(line.unit_price)} each
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <span className="text-sm font-bold tabular-nums">
                            {formatHotelMoney(line.line_total)}
                          </span>
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="theme-secondary-btn flex h-8 w-8 items-center justify-center rounded-full text-base font-bold"
                              disabled={busy}
                              onClick={() => void bumpQty(line, -1)}
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <span className="min-w-[1.75rem] text-center text-sm font-semibold tabular-nums">
                              {line.qty}
                            </span>
                            <button
                              type="button"
                              className="theme-secondary-btn flex h-8 w-8 items-center justify-center rounded-full text-base font-bold"
                              disabled={busy}
                              onClick={() => void bumpQty(line, 1)}
                              aria-label="Increase quantity"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-[var(--theme-border)] bg-[var(--theme-surface)] px-4 py-4 shadow-[0_-12px_40px_-28px_rgba(0,0,0,0.5)]">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="theme-subtext text-[11px] uppercase tracking-wide">
                  {Number(check?.amount_paid) > 0 ? "Balance" : "Total"}
                </p>
                <p className="text-2xl font-bold tabular-nums text-[var(--theme-accent-text)]">
                  {formatHotelMoney(
                    Number(check?.balance_due ?? Math.max(0, Number(check?.total ?? 0) - Number(check?.amount_paid ?? 0))),
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="theme-subtext text-xs">VAT incl. {formatHotelMoney(check?.vat_total ?? 0)}</p>
                {Number(check?.amount_paid) > 0 ? (
                  <p className="theme-subtext text-xs">
                    Paid {formatHotelMoney(check.amount_paid)} / {formatHotelMoney(check.total)}
                  </p>
                ) : null}
                {check?.floor_table ? (
                  <p className="theme-subtext text-xs">
                    Table {check.floor_table.label || check.floor_table.code}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <PosActionButton
                label="Remove"
                title="Remove selected line"
                icon="−"
                disabled={busy || !selectedLineId}
                onClick={() => void handleRemoveSelected()}
              />
              <PosActionButton
                label="Clear"
                title="Clear all lines"
                icon="⌫"
                iconClass="pos-cart-action-icon--warn"
                disabled={busy || !hasLines || Number(check?.amount_paid) > 0}
                onClick={() => void handleClear()}
              />
              <PosActionButton
                label="Hold"
                title="Save as unpaid"
                icon="⏸"
                iconClass="pos-cart-action-icon--warn"
                disabled={busy || !hasLines || !unpaidEnabled}
                onClick={() => void handleHold()}
              />
              {collectPayment ? (
                <PosActionButton
                  label="Pay"
                  title="Collect payment"
                  icon="💳"
                  disabled={busy || !hasLines}
                  onClick={handlePrimaryComplete}
                />
              ) : (
                <PosActionButton
                  label="Save"
                  title="Save unpaid order and print receipt"
                  icon="✓"
                  disabled={busy || !hasLines || !unpaidEnabled}
                  onClick={() => void handleSaveOrder()}
                />
              )}
            </div>
            {collectPayment ? (
              unpaidEnabled ? (
                <button
                  type="button"
                  disabled={busy || !hasLines}
                  onClick={() => void handleSaveOrder()}
                  className="theme-secondary-btn mt-2 w-full rounded-xl py-2.5 text-xs font-semibold uppercase tracking-wide disabled:opacity-40"
                >
                  Save unpaid (pay later)
                </button>
              ) : null
            ) : (
              <button
                type="button"
                disabled={busy || !hasLines}
                onClick={() => {
                  setPayError(null);
                  setPayOpen(true);
                }}
                className="theme-secondary-btn mt-2 w-full rounded-xl py-2.5 text-xs font-semibold uppercase tracking-wide disabled:opacity-40"
              >
                Collect payment
              </button>
            )}
          </div>
        </div>
      </div>

      {queueOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-3">
              <h2 className="theme-heading text-base font-semibold">Unpaid &amp; partial</h2>
              <button
                type="button"
                className="theme-secondary-btn rounded-lg px-3 py-1 text-xs font-semibold"
                onClick={() => setQueueOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {!queueChecks.length ? (
                <p className="theme-subtext px-3 py-8 text-center text-sm">No unpaid orders</p>
              ) : (
                queueChecks.map((row) => (
                  <div
                    key={row.id}
                    className="mb-1 flex items-center gap-2 rounded-xl px-3 py-3 hover:bg-[var(--theme-hover)]"
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleResumeHeld(row)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="theme-heading block text-sm font-semibold">{row.check_number}</span>
                      <span className="theme-subtext text-xs capitalize">
                        {String(row.status ?? "").replace(/_/g, " ")}
                        {row.floor_table?.label || row.floor_table?.code
                          ? ` · ${row.floor_table.label || row.floor_table.code}`
                          : ""}
                        {` · bal ${formatHotelMoney(row.balance_due ?? row.total)}`}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleCollectFromQueue(row)}
                      className="theme-secondary-btn shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
                    >
                      Collect
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      <HotelPosPaymentPanel
        open={payOpen}
        onClose={() => {
          if (!busy) setPayOpen(false);
        }}
        billTotal={Number(
          check?.balance_due ??
            Math.max(0, Number(check?.total ?? 0) - Number(check?.amount_paid ?? 0)),
        )}
        paymentConfig={paymentConfig}
        saving={busy}
        error={payError}
        allowPartial={partialEnabled}
        onComplete={handlePaymentComplete}
      />
    </div>
  );
}
