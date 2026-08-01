"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { ApiError } from "@/lib/api";
import {
  addHotelCheckLine,
  clearHotelCheck,
  fetchHotelPosCatalog,
  holdHotelCheck,
  listHeldHotelChecks,
  openHotelCheck,
  removeHotelCheckLine,
  resumeHotelCheck,
  settleHotelCheck,
  updateHotelCheckLineQty,
} from "@/lib/hospitality-pos-api";
import {
  formatHotelMoney,
  normalizeHotelPosGridColumns,
  resolveHotelPosGridColumns,
} from "@/lib/hotel-pos-settings";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PosActionButton } from "@/components/sales/pos-action-button";

function dedupeError(e) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}

export function HotelBarPosScreen() {
  const { capabilities, user } = useAuth();
  const platformColumns = resolveHotelPosGridColumns(capabilities);
  const [gridColumns, setGridColumns] = useState(platformColumns);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [check, setCheck] = useState(null);
  const [selectedLineId, setSelectedLineId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldChecks, setHeldChecks] = useState([]);
  const [payOpen, setPayOpen] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    setGridColumns(platformColumns);
  }, [platformColumns]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => clearTimeout(t);
  }, [search]);

  const loadCatalog = useCallback(async (q) => {
    setCatalogLoading(true);
    try {
      const res = await fetchHotelPosCatalog({ q, perPage: 160, popularDays: 90 });
      setProducts(Array.isArray(res?.items) ? res.items : []);
      if (res?.grid_columns != null) {
        setGridColumns(normalizeHotelPosGridColumns(res.grid_columns));
      }
    } catch (e) {
      notifyError(dedupeError(e));
      setProducts([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog(debouncedSearch);
  }, [debouncedSearch, loadCatalog]);

  async function handleTapProduct(product) {
    if (!product?.product_code || busy) return;
    setBusy(true);
    try {
      let active = check;
      if (!active?.id || active.status === "settled" || active.status === "void") {
        const opened = await openHotelCheck({ branch_id: user?.branch_id ?? undefined });
        active = opened?.check ?? null;
        setCheck(active);
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
    setBusy(true);
    try {
      await holdHotelCheck(check.id);
      notifySuccess(`Check ${check.check_number} held.`);
      const opened = await openHotelCheck({ branch_id: user?.branch_id ?? undefined });
      setCheck(opened?.check ?? null);
      setSelectedLineId(null);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function openHeldList() {
    setHeldOpen(true);
    try {
      const res = await listHeldHotelChecks();
      setHeldChecks(Array.isArray(res?.checks) ? res.checks : []);
    } catch (e) {
      notifyError(dedupeError(e));
      setHeldChecks([]);
    }
  }

  async function handleResumeHeld(held) {
    if (!held?.id || busy) return;
    setBusy(true);
    try {
      const res = await resumeHotelCheck(held.id);
      setCheck(res?.check ?? null);
      setSelectedLineId(null);
      setHeldOpen(false);
      notifySuccess(`Resumed ${held.check_number}`);
    } catch (e) {
      notifyError(dedupeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePayNow() {
    if (!check?.id || !check.lines?.length || busy) return;
    setPayOpen(true);
  }

  async function confirmCashPay() {
    if (!check?.id || busy) return;
    setBusy(true);
    try {
      const res = await settleHotelCheck(check.id);
      notifySuccess(`Paid ${res?.check?.check_number ?? ""} — ${formatHotelMoney(res?.check?.total)}`);
      setPayOpen(false);
      const opened = await openHotelCheck({ branch_id: user?.branch_id ?? undefined });
      setCheck(opened?.check ?? null);
      setSelectedLineId(null);
      void loadCatalog(debouncedSearch);
    } catch (e) {
      notifyError(dedupeError(e));
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--theme-page-bg)]">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Product grid — dominant */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-[var(--theme-border)] lg:border-b-0 lg:border-r">
          <div className="shrink-0 border-b border-[var(--theme-border)] px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--theme-accent-text)]">
                  Hotel &amp; Bar POS
                </p>
                <p className="theme-subtext text-xs">
                  Most sold on top · tap to add · {gridColumns}-column grid
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openHeldList()}
                  className="theme-secondary-btn rounded-lg px-3 py-1.5 text-xs font-semibold"
                >
                  Held orders
                </button>
                <Link
                  href="/choose-workspace"
                  className="theme-subtext text-xs font-medium hover:underline"
                >
                  Switch workspace
                </Link>
              </div>
            </div>
            <label className="mt-3 block">
              <span className="sr-only">Search products</span>
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or code…"
                className="theme-input w-full rounded-xl px-3 py-2.5 text-sm"
                autoComplete="off"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {catalogLoading && !products.length ? (
              <p className="theme-subtext py-16 text-center text-sm">Loading menu…</p>
            ) : !products.length ? (
              <p className="theme-subtext py-16 text-center text-sm">
                {debouncedSearch ? "No products match your search." : "No products in catalogue yet."}
              </p>
            ) : (
              <div className="grid gap-2.5 sm:gap-3" style={gridStyle}>
                {products.map((product) => (
                  <button
                    key={product.product_code}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleTapProduct(product)}
                    className="group flex min-h-[5.5rem] flex-col justify-between rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-3 text-left shadow-sm transition hover:border-[var(--theme-primary)] hover:bg-[var(--theme-primary-subtle)] disabled:opacity-50"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="theme-heading line-clamp-2 text-sm font-semibold leading-snug">
                          {product.product_name}
                        </span>
                        {product.is_popular ? (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900">
                            Top
                          </span>
                        ) : null}
                      </div>
                      <p className="theme-subtext mt-1 font-mono text-[10px]">{product.product_code}</p>
                    </div>
                    <p className="mt-2 text-sm font-bold text-[var(--theme-accent-text)]">
                      {formatHotelMoney(product.unit_price)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ticket + footer actions */}
        <div className="flex min-h-0 w-full flex-col bg-[var(--theme-surface)] lg:w-[min(100%,24rem)] xl:w-[28rem] shrink-0">
          <div className="shrink-0 border-b border-[var(--theme-border)] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
                Current check
              </p>
              <span className="rounded-md border border-[var(--theme-border)] px-2 py-0.5 font-mono text-xs font-semibold">
                {check?.check_number ?? "—"}
              </span>
            </div>
            <p className="theme-subtext mt-1 text-xs capitalize">
              {check?.status ? `Status: ${check.status}` : "Tap a product to start"}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!hasLines ? (
              <p className="theme-subtext px-4 py-12 text-center text-sm">No items yet</p>
            ) : (
              <ul className="divide-y divide-[var(--theme-border)]">
                {lines.map((line) => {
                  const selected = selectedLineId === line.id;
                  return (
                    <li key={line.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedLineId(line.id)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left ${
                          selected
                            ? "bg-[var(--theme-primary-subtle)]"
                            : "hover:bg-[var(--theme-hover)]"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="theme-heading text-sm font-medium">{line.description}</p>
                          <p className="theme-subtext font-mono text-[10px]">{line.product_code}</p>
                          <p className="theme-subtext mt-0.5 text-xs">
                            {formatHotelMoney(line.unit_price)} × {line.qty}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-sm font-bold">{formatHotelMoney(line.line_total)}</span>
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="theme-secondary-btn flex h-7 w-7 items-center justify-center rounded text-sm font-bold"
                              disabled={busy}
                              onClick={() => void bumpQty(line, -1)}
                              aria-label="Decrease quantity"
                            >
                              −
                            </button>
                            <button
                              type="button"
                              className="theme-secondary-btn flex h-7 w-7 items-center justify-center rounded text-sm font-bold"
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

          <div className="shrink-0 border-t border-[var(--theme-border)] bg-[var(--theme-page-bg)] px-4 py-3">
            <div className="mb-3 space-y-1 text-sm">
              <div className="theme-text-muted flex justify-between text-xs">
                <span>VAT (incl.)</span>
                <span>{formatHotelMoney(check?.vat_total ?? 0)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[var(--theme-accent-text)]">
                <span>Total</span>
                <span>{formatHotelMoney(check?.total ?? 0)}</span>
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
                disabled={busy || !hasLines}
                onClick={() => void handleClear()}
              />
              <PosActionButton
                label="Hold"
                title="Hold this check"
                icon="⏸"
                iconClass="pos-cart-action-icon--warn"
                disabled={busy || !hasLines}
                onClick={() => void handleHold()}
              />
              <PosActionButton
                label="Pay now"
                title="Settle with cash"
                icon="💳"
                disabled={busy || !hasLines}
                onClick={() => void handlePayNow()}
              />
            </div>
          </div>
        </div>
      </div>

      {heldOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-3">
              <h2 className="theme-heading text-base font-semibold">Held checks</h2>
              <button
                type="button"
                className="theme-secondary-btn rounded-lg px-3 py-1 text-xs font-semibold"
                onClick={() => setHeldOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {!heldChecks.length ? (
                <p className="theme-subtext px-3 py-8 text-center text-sm">No held checks</p>
              ) : (
                heldChecks.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void handleResumeHeld(row)}
                    className="mb-1 flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-[var(--theme-hover)]"
                  >
                    <span>
                      <span className="theme-heading block text-sm font-semibold">{row.check_number}</span>
                      <span className="theme-subtext text-xs">
                        {(row.lines ?? []).length} line(s)
                      </span>
                    </span>
                    <span className="text-sm font-bold">{formatHotelMoney(row.total)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {payOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-5 shadow-xl">
            <h2 className="theme-heading text-lg font-semibold">Pay now</h2>
            <p className="theme-subtext mt-1 text-sm">
              Cash settlement for check {check?.check_number}. Card / M-Pesa / room charge can follow later.
            </p>
            <p className="mt-4 text-2xl font-bold text-[var(--theme-accent-text)]">
              {formatHotelMoney(check?.total ?? 0)}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="theme-secondary-btn flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold"
                disabled={busy}
                onClick={() => setPayOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="theme-primary-btn flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold"
                disabled={busy}
                onClick={() => void confirmCashPay()}
              >
                Confirm cash
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
