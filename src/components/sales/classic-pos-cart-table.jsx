"use client";

import { useEffect, useState } from "react";

function ClassicLineQtyCell({
  line,
  entryQty,
  qtyUnit = "",
  busy,
  lineBusy,
  canDecrease,
  canIncrease,
  onAdjustQty,
  onSetQty,
}) {
  const committed = String(entryQty ?? "");
  const [draft, setDraft] = useState(committed);

  useEffect(() => {
    setDraft(committed);
  }, [line?.id, committed]);

  function commit() {
    const trimmed = String(draft).trim();
    if (!trimmed) {
      setDraft(committed);
      return;
    }
    if (trimmed === committed) return;
    onSetQty?.(line, trimmed);
  }

  return (
    <div
      className="classic-pos-qty-adjust"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="classic-pos-qty-btn"
        disabled={busy || lineBusy || !canDecrease}
        onClick={() => onAdjustQty?.(line, -1)}
        aria-label="Decrease quantity"
        title="Decrease quantity"
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        className="classic-pos-line-qty-input"
        value={draft}
        disabled={busy || lineBusy}
        aria-label={qtyUnit ? `Line quantity (${qtyUnit})` : "Line quantity"}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          // Let POS F-key shortcuts (F8/F10/…) reach the window capture listener.
          if (/^F\d+$/.test(e.key) || e.code?.startsWith("F")) return;
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(committed);
            e.currentTarget.blur();
          }
        }}
      />
      <button
        type="button"
        className="classic-pos-qty-btn"
        disabled={busy || lineBusy || !canIncrease}
        onClick={() => onAdjustQty?.(line, 1)}
        aria-label="Increase quantity"
        title={
          !canIncrease
            ? "Cannot increase (stock or packaging limit)"
            : "Increase quantity"
        }
      >
        +
      </button>
      {qtyUnit ? (
        <span className="classic-pos-qty-unit" title={qtyUnit}>
          {qtyUnit}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Classic External POS cart — Light Stores style grid with in-cell scan lookup dropdown.
 */
export function ClassicPosCartTable({
  lines = [],
  selectedLineId,
  onSelectLine,
  orderCaption = "New Order",
  showOrderNav = false,
  orderNavLocked = false,
  orderNavHint = null,
  canGoPrevious = false,
  canGoNext = false,
  onPreviousOrder,
  onNextOrder,
  orderNo = "",
  onOrderNoChange,
  onOrderNoSubmit,
  onOrderNoClick = null,
  orderNavError = null,
  showRetailModeHint = false,
  sellAtRetail = false,
  replacingLineId = null,
  onScanCodeClick,
  busy = false,
  lineBusy = false,
  showLineDiscount = false,
  formatQty,
  formatMoney,
  linePackage,
  lineUnitPrice,
  lineDiscount,
  lineVat,
  lineAmount,
  lineQtyAdjust,
  lineEntryQty,
  lineQtyUnit,
  onAdjustQty,
  onSetQty,
  scanSearch = null,
  qtyRef,
  entryDescription,
  entryPackage,
  entryQty,
  entryQtyUnit = "",
  entryUnitPrice,
  entryVat,
  entryAmount,
  entryReady,
  onEntryQtyChange,
  onEntryQtyKeyDown,
  onEmptyDoubleClick = null,
}) {
  function handleWrapDoubleClick(e) {
    if (typeof onEmptyDoubleClick !== "function") return;
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest("button, input, a, select, textarea, label")) return;
    const row = t.closest("tbody tr");
    if (row && !row.classList.contains("classic-pos-cart-entry-row")) return;
    onEmptyDoubleClick();
  }

  return (
    <div className="classic-pos-cart-table-wrap" onDoubleClick={handleWrapDoubleClick}>
      <div className="classic-pos-cart-caption">
        <div className="classic-pos-cart-caption-left">
          {showRetailModeHint ? (
            <span
              className={`classic-pos-mode-hint${
                sellAtRetail ? " classic-pos-mode-hint--retail" : ""
              }`}
            >
              {sellAtRetail
                ? "New lines: RETAIL — F2 for wholesale"
                : "New lines: WHOLESALE — F2 for retail"}
            </span>
          ) : null}
          <span className="classic-pos-cart-caption-text">{orderCaption}</span>
          {orderNavHint ? (
            <span className="classic-pos-order-nav-hint" title={orderNavHint}>
              {orderNavHint}
            </span>
          ) : null}
          {orderNavError ? (
            <span className="classic-pos-order-nav-error" role="alert" title={orderNavError}>
              {orderNavError}
            </span>
          ) : null}
        </div>

        {showOrderNav ? (
          <div className="classic-pos-cart-caption-nav-group">
            <button
              type="button"
              className="classic-pos-cart-caption-nav"
              disabled={busy}
              onClick={() => {
                if (orderNavLocked) {
                  onOrderNoSubmit?.();
                  return;
                }
                onPreviousOrder?.();
              }}
              title={
                orderNavLocked
                  ? orderNavHint || "Previous order editing is disabled"
                  : canGoPrevious
                    ? "Previous order"
                    : "Load previous completed order"
              }
              aria-label="Previous order"
            >
              ←
            </button>
            <input
              type="text"
              className="classic-pos-cart-order-input"
              value={orderNo}
              disabled={busy || orderNavLocked}
              placeholder="Order #"
              inputMode="numeric"
              autoComplete="off"
              aria-label="Order number"
              title={
                orderNavLocked
                  ? orderNavHint || "Order editing is disabled"
                  : "Shows next order #. Click to open the current completed order, or type a number and press Enter."
              }
              onClick={() => onOrderNoClick?.()}
              onChange={(e) => onOrderNoChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onOrderNoSubmit?.();
                }
              }}
            />
            <button
              type="button"
              className="classic-pos-cart-caption-nav"
              disabled={busy || (!orderNavLocked && !canGoNext)}
              onClick={() => {
                if (orderNavLocked) {
                  onOrderNoSubmit?.();
                  return;
                }
                onNextOrder?.();
              }}
              title={
                orderNavLocked
                  ? orderNavHint || "Previous order editing is disabled"
                  : canGoNext
                    ? "Next order"
                    : "No newer order"
              }
              aria-label="Next order"
            >
              →
            </button>
          </div>
        ) : null}
      </div>
      <table className="classic-pos-cart-table">
        <colgroup>
          <col className="classic-pos-col-num" />
          <col className="classic-pos-col-scan" />
          <col className="classic-pos-col-desc" />
          <col className="classic-pos-col-pkg" />
          <col className="classic-pos-col-qty" />
          <col className="classic-pos-col-price" />
          {showLineDiscount ? <col className="classic-pos-col-disc" /> : null}
          <col className="classic-pos-col-vat" />
          <col className="classic-pos-col-amt" />
        </colgroup>
        <thead>
          <tr>
            <th className="classic-pos-cart-rownum" aria-label="#" />
            <th className="classic-pos-col-scan">Scan code</th>
            <th className="classic-pos-col-desc">Product description</th>
            <th className="classic-pos-col-pkg">Package</th>
            <th className="classic-pos-col-qty">Qty</th>
            <th className="classic-pos-col-price">Price</th>
            {showLineDiscount ? (
              <th className="classic-pos-col-disc">Discount</th>
            ) : null}
            <th className="classic-pos-col-vat">VAT</th>
            <th className="classic-pos-col-amt">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const selected = String(selectedLineId) === String(line.id);
            const replacing = String(replacingLineId) === String(line.id);
            const qtyAdjust = lineQtyAdjust?.(line) ?? {
              canDecrease: false,
              canIncrease: false,
            };
            return (
              <tr
                key={line.id}
                className={
                  replacing
                    ? "classic-pos-cart-row--replacing"
                    : selected
                      ? "classic-pos-cart-row--selected"
                      : undefined
                }
                onClick={() => onSelectLine?.(line.id)}
              >
                <td className="classic-pos-cart-rownum">{index + 1}</td>
                <td className="classic-pos-col-scan font-mono">
                  <button
                    type="button"
                    className="classic-pos-scan-replace-btn"
                    disabled={busy || lineBusy}
                    title="Replace this item — search or scan a new product"
                    onClick={(e) => {
                      e.stopPropagation();
                      onScanCodeClick?.(line.id);
                    }}
                  >
                    {line.product_code}
                  </button>
                </td>
                <td className="classic-pos-col-desc">{line.product_name}</td>
                <td className="classic-pos-col-pkg">
                  {linePackage?.(line) ?? line.package_label ?? line.uom_name ?? "—"}
                </td>
                <td className="classic-pos-col-qty">
                  <ClassicLineQtyCell
                    line={line}
                    entryQty={
                      lineEntryQty?.(line) ??
                      String(line.quantity ?? "")
                    }
                    qtyUnit={lineQtyUnit?.(line) ?? ""}
                    busy={busy}
                    lineBusy={lineBusy}
                    canDecrease={qtyAdjust.canDecrease}
                    canIncrease={qtyAdjust.canIncrease}
                    onAdjustQty={onAdjustQty}
                    onSetQty={onSetQty}
                  />
                </td>
                <td className="classic-pos-col-price tabular-nums">{lineUnitPrice?.(line)}</td>
                {showLineDiscount ? (
                  <td className="classic-pos-col-disc tabular-nums">{lineDiscount?.(line)}</td>
                ) : null}
                <td className="classic-pos-col-vat tabular-nums">{lineVat?.(line)}</td>
                <td className="classic-pos-col-amt tabular-nums font-semibold">
                  {lineAmount?.(line)}
                </td>
              </tr>
            );
          })}

          <tr className="classic-pos-cart-entry-row">
            <td className="classic-pos-cart-rownum">{lines.length + 1}</td>
            <td className="classic-pos-cart-scan-cell classic-pos-col-scan">{scanSearch}</td>
            <td className="classic-pos-col-desc classic-pos-cart-entry-muted">
              {entryReady ? entryDescription : ""}
            </td>
            <td className="classic-pos-col-pkg classic-pos-cart-entry-muted">
              {entryReady ? entryPackage : ""}
            </td>
            <td className="classic-pos-col-qty">
              {entryReady ? (
                <div className="classic-pos-entry-qty-wrap">
                  <input
                    ref={qtyRef}
                    type="number"
                    min="0"
                    step="any"
                    className="classic-pos-cart-qty-input"
                    value={entryQty}
                    disabled={busy}
                    aria-label={entryQtyUnit ? `Quantity (${entryQtyUnit})` : "Quantity"}
                    onChange={(e) => onEntryQtyChange?.(e.target.value)}
                    onKeyDown={onEntryQtyKeyDown}
                  />
                  {entryQtyUnit ? (
                    <span className="classic-pos-qty-unit" title={entryQtyUnit}>
                      {entryQtyUnit}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </td>
            <td className="classic-pos-col-price tabular-nums classic-pos-cart-entry-muted">
              {entryReady ? formatMoney?.(entryUnitPrice) : ""}
            </td>
            {showLineDiscount ? <td className="classic-pos-col-disc" /> : null}
            <td className="classic-pos-col-vat tabular-nums classic-pos-cart-entry-muted">
              {entryReady ? formatMoney?.(entryVat) : ""}
            </td>
            <td className="classic-pos-col-amt tabular-nums font-semibold classic-pos-cart-entry-muted">
              {entryReady ? formatMoney?.(entryAmount) : ""}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
