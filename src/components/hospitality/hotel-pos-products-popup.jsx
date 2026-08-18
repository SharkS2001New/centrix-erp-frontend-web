"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  fetchHotelPosCatalog,
  updateHotelPosCatalogPrice,
} from "@/lib/hospitality-pos-api";
import { formatHotelMoney } from "@/lib/hotel-pos-settings";
import { HotelPosAmountKeypad } from "@/components/hospitality/hotel-pos-amount-keypad";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isPosTouchSearchKeypadEnabled } from "@/lib/pos-touch-search-keypad";
import { TouchSearchField } from "@/components/pos/touch-search-keypad";

function formatPriceInput(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "";
}

function HotelPosPriceCell({ product, canEdit, offline, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(formatPriceInput(product.unit_price));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setValue(formatPriceInput(product.unit_price));
  }, [product.unit_price, editing]);

  async function save(nextValue = value) {
    const next = Number(nextValue);
    if (!Number.isFinite(next) || next < 0) {
      notifyError("Enter a valid price");
      return;
    }
    if (next === Number(product.unit_price)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await onSaved(product, next);
      if (res !== false) setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit || offline) {
    return (
      <span className="tabular-nums font-semibold text-[var(--theme-accent-text)]">
        {formatHotelMoney(product.unit_price)}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        title="Update selling price"
        onClick={() => setEditing(true)}
        className="rounded-lg px-2 py-1 text-right tabular-nums font-semibold text-[var(--theme-accent-text)] hover:bg-[var(--theme-hover)]"
      >
        {formatHotelMoney(product.unit_price)}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="rounded-lg bg-[#185FA5] px-2 py-1 text-right text-xs font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : formatHotelMoney(value || 0)}
      </button>
      <HotelPosAmountKeypad
        open={editing}
        title={`Update ${product.product_name} price`}
        initialValue={value || "0"}
        confirmLabel={saving ? "Saving…" : "Save price"}
        onCancel={() => {
          if (!saving) setEditing(false);
        }}
        onConfirm={(next) => {
          if (saving) return;
          const nextValue = formatPriceInput(next);
          setValue(nextValue);
          void save(nextValue);
        }}
      />
    </>
  );
}

export function HotelPosProductsPopup({
  open,
  onClose,
  outletId = null,
  channelLabel = "menu",
  canEdit = false,
  offlineMode = false,
  cachedProducts = [],
  onPriceUpdated,
}) {
  const { capabilities } = useAuth();
  const touchSearchKeypad = isPosTouchSearchKeypadEnabled(capabilities);
  const searchInputRef = useRef(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 220);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebounced("");
      setItems([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || touchSearchKeypad) return undefined;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus?.();
      searchInputRef.current?.select?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, touchSearchKeypad]);

  const loadPage = useCallback(
    async (q, { offset = 0, append = false } = {}) => {
      if (!open) return;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        if (offlineMode) {
          const needle = String(q ?? "").trim().toLowerCase();
          const filtered = (cachedProducts ?? []).filter((p) => {
            if (p?.is_room) return false;
            if (!needle) return true;
            return (
              String(p.product_name ?? "").toLowerCase().includes(needle) ||
              String(p.product_code ?? "").toLowerCase().includes(needle)
            );
          });
          setItems(filtered);
          setHasMore(false);
          setNextOffset(null);
          return;
        }
        const res = await fetchHotelPosCatalog({
          q,
          perPage: 100,
          offset,
          outletId,
        });
        const batch = Array.isArray(res?.items) ? res.items : [];
        setItems((prev) => {
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
        setHasMore(Boolean(res?.has_more));
        setNextOffset(res?.next_offset ?? null);
      } catch (e) {
        notifyError(e instanceof ApiError ? e.message : "Could not load menu products");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [open, offlineMode, outletId, cachedProducts],
  );

  useEffect(() => {
    if (!open) return undefined;
    void loadPage(debounced, { offset: 0, append: false });
    return undefined;
  }, [open, debounced, loadPage]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handlePriceSaved(product, nextPrice) {
    try {
      const res = await updateHotelPosCatalogPrice(product.product_code, nextPrice, { outletId });
      const unitPrice = Number(res?.unit_price ?? nextPrice);
      setItems((prev) =>
        prev.map((row) =>
          row.product_code === product.product_code ? { ...row, unit_price: unitPrice } : row,
        ),
      );
      onPriceUpdated?.(product.product_code, unitPrice);
      notifySuccess(`Updated ${product.product_name}`);
      return true;
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not update price");
      return false;
    }
  }

  const subtitle = useMemo(() => {
    const channel = channelLabel ? `${channelLabel} menu` : "Menu";
    if (offlineMode) return `${channel} · offline copy`;
    if (canEdit) return `${channel} · tap a price to update`;
    return channel;
  }, [channelLabel, canEdit, offlineMode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-3 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close products" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hotel-pos-products-title"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--theme-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 id="hotel-pos-products-title" className="theme-heading text-lg font-semibold">
              Products
            </h2>
            <p className="theme-subtext mt-0.5 text-xs">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="theme-secondary-btn shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            Close
          </button>
        </div>

        <div className="border-b border-[var(--theme-border)] px-4 py-3">
          <TouchSearchField
            inputRef={searchInputRef}
            enabled={touchSearchKeypad}
            title="Search menu"
            value={search}
            onChange={setSearch}
            placeholder="Search this menu…"
            className="theme-input hotel-pos-field w-full rounded-xl px-4 py-2.5 text-sm"
            autoFocus={!touchSearchKeypad}
            autoOpen={touchSearchKeypad}
          />
        </div>

        <div className="hotel-pos-touch-scroll min-h-0 flex-1 overflow-y-auto">
          {loading && !items.length ? (
            <p className="theme-subtext py-16 text-center text-sm">Loading products…</p>
          ) : !items.length ? (
            <p className="theme-subtext py-16 text-center text-sm">
              {debounced ? "No products match your search." : "No products on this menu yet."}
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[var(--theme-surface)]">
                <tr className="border-b border-[var(--theme-border)] text-[11px] font-semibold uppercase tracking-wide text-[var(--theme-text-muted)]">
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => (
                  <tr
                    key={product.product_code}
                    className="border-b border-[var(--theme-border)]/70 last:border-0"
                  >
                    <td className="px-4 py-3 align-top">
                      <p className="theme-heading font-semibold leading-snug">{product.product_name}</p>
                      <p className="theme-subtext mt-0.5 font-mono text-[11px]">{product.product_code}</p>
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      <HotelPosPriceCell
                        product={product}
                        canEdit={canEdit}
                        offline={offlineMode}
                        onSaved={handlePriceSaved}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {hasMore ? (
            <div className="px-4 py-3">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadPage(debounced, { offset: nextOffset ?? items.length, append: true })}
                className="theme-secondary-btn w-full rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
