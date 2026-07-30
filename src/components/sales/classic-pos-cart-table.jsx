"use client";

import { isPosClassicAltShortcut, isPosFunctionKeyEvent } from "@/lib/pos-keyboard-shortcuts";
import { TABLE_ROW_CHECKBOX_CLASS } from "@/components/catalog/table-row-selection";

import { useEffect, useRef, useState } from "react";

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
  onDraftQtyChange = null,
  swapQtyCommit = false,
  inputRef = null,
}) {
  const committed = String(entryQty ?? "");
  const [draft, setDraft] = useState(committed);

  useEffect(() => {
    setDraft(committed);
  }, [line?.id, committed]);

  function commit({ force = false } = {}) {
    const trimmed = String(draft).trim();
    if (!trimmed) {
      setDraft(committed);
      return;
    }
    if (!force && !swapQtyCommit && trimmed === committed) return;
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
        ref={inputRef}
        type="text"
        inputMode="decimal"
        className="classic-pos-line-qty-input"
        value={draft}
        disabled={busy || lineBusy}
        aria-label={qtyUnit ? `Line quantity (${qtyUnit})` : "Line quantity"}
        onChange={(e) => {
          setDraft(e.target.value);
          onDraftQtyChange?.(line, e.target.value);
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => commit({ force: swapQtyCommit })}
        onKeyDown={(e) => {
          if (isPosFunctionKeyEvent(e) || isPosClassicAltShortcut(e)) return;
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit({ force: true });
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

function ClassicSelectAllHeader({ checked, indeterminate, onChange }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <th className="classic-pos-col-select" aria-label="Select all lines">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        className={TABLE_ROW_CHECKBOX_CLASS}
        onClick={(e) => e.stopPropagation()}
      />
    </th>
  );
}

/**
 * Classic External POS cart — Light Stores style grid with in-cell scan lookup dropdown.
 */
export function ClassicPosCartTable({
  lines = [],
  selectedLineId,
  selectionEnabled = false,
  selectedLineIds,
  allLinesSelected = false,
  someLinesSelected = false,
  onToggleAllLines,
  onToggleLineSelect,
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
  orderNavError = null,
  showRetailModeHint = false,
  sellAtRetail = false,
  onToggleRetailMode = null,
  replacingLineId = null,
  swapDraftLineId = null,
  swapDraftQty = "",
  swapLinePreview = null,
  swapLineQtyRef = null,
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
  onSwapDraftQtyChange = null,
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
  tableScrollRef = null,
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
            <button
              type="button"
              className={`classic-pos-mode-hint${
                sellAtRetail ? " classic-pos-mode-hint--retail" : ""
              }`}
              onClick={() => onToggleRetailMode?.()}
              title="Click or press F12 (or Ctrl+F12 / Ctrl+Shift+U) to switch wholesale / retail. Then edit a line qty (+/− or Enter) to reprice that item."
            >
              {sellAtRetail
                ? "Mode: RETAIL — edit qty to apply · F12 wholesale"
                : "Mode: WHOLESALE — edit qty to apply · F12 retail"}
            </button>
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
                  : "Shows next order #. Type an order number and press Enter, or use ← for the latest completed order."
              }
              onFocus={(e) => e.target.select()}
              onChange={(e) => onOrderNoChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (isPosFunctionKeyEvent(e)) return;
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
      <div ref={tableScrollRef} className="classic-pos-cart-table-scroll">
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
          {selectionEnabled ? <col className="classic-pos-col-select" /> : null}
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
            {selectionEnabled ? (
              <ClassicSelectAllHeader
                checked={allLinesSelected}
                indeterminate={someLinesSelected}
                onChange={onToggleAllLines}
              />
            ) : null}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const selected = String(selectedLineId) === String(line.id);
            const checked = selectedLineIds?.has(String(line.id)) ?? false;
            const replacing = String(replacingLineId) === String(line.id);
            const swapDraftActive = String(swapDraftLineId) === String(line.id);
            const swapPreviewActive =
              swapDraftActive &&
              swapLinePreview &&
              String(swapLinePreview.lineId) === String(line.id);
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
                <td
                  className={`classic-pos-col-scan font-mono${
                    replacing ? "" : " classic-pos-col-scan--swap"
                  }`}
                  title={
                    replacing
                      ? undefined
                      : "Swap this item — click here, then search or scan the replacement product"
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!replacing && !busy && !lineBusy) {
                      onScanCodeClick?.(line.id);
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onKeyDown={
                    replacing
                      ? undefined
                      : (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!busy && !lineBusy) onScanCodeClick?.(line.id);
                          }
                        }
                  }
                  role={replacing ? undefined : "button"}
                  tabIndex={replacing || busy || lineBusy ? -1 : 0}
                >
                  {replacing ? (
                    swapPreviewActive ? (
                      <span className="classic-pos-scan-code">{swapLinePreview.productCode}</span>
                    ) : (
                      scanSearch
                    )
                  ) : (
                    <span className="classic-pos-scan-code">{line.product_code}</span>
                  )}
                </td>
                <td className="classic-pos-col-desc">
                  {swapPreviewActive ? swapLinePreview.productName : line.product_name}
                </td>
                <td className="classic-pos-col-pkg">
                  {swapPreviewActive
                    ? swapLinePreview.package
                    : linePackage?.(line) ?? line.package_label ?? line.uom_name ?? "—"}
                </td>
                <td className="classic-pos-col-qty">
                  <ClassicLineQtyCell
                    line={line}
                    entryQty={
                      swapDraftActive
                        ? swapDraftQty
                        : lineEntryQty?.(line) ?? String(line.quantity ?? "")
                    }
                    qtyUnit={lineQtyUnit?.(line) ?? ""}
                    busy={busy}
                    lineBusy={lineBusy}
                    canDecrease={qtyAdjust.canDecrease}
                    canIncrease={qtyAdjust.canIncrease}
                    onAdjustQty={onAdjustQty}
                    onSetQty={onSetQty}
                    onDraftQtyChange={swapPreviewActive ? onSwapDraftQtyChange : null}
                    swapQtyCommit={swapPreviewActive}
                    inputRef={swapDraftActive ? swapLineQtyRef : null}
                  />
                </td>
                <td className="classic-pos-col-price tabular-nums">
                  {swapPreviewActive
                    ? Number(swapLinePreview.unitPrice).toLocaleString()
                    : lineUnitPrice?.(line)}
                </td>
                {showLineDiscount ? (
                  <td className="classic-pos-col-disc tabular-nums">{lineDiscount?.(line)}</td>
                ) : null}
                <td className="classic-pos-col-vat tabular-nums">
                  {swapPreviewActive
                    ? Number(swapLinePreview.vat).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })
                    : lineVat?.(line)}
                </td>
                <td className="classic-pos-col-amt tabular-nums font-semibold">
                  {swapPreviewActive
                    ? Number(swapLinePreview.amount).toLocaleString()
                    : lineAmount?.(line)}
                </td>
                {selectionEnabled ? (
                  <td
                    className="classic-pos-col-select"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      className={TABLE_ROW_CHECKBOX_CLASS}
                      aria-label={`Select ${line.product_name ?? line.product_code}`}
                      onChange={() => onToggleLineSelect?.(line.id)}
                    />
                  </td>
                ) : null}
              </tr>
            );
          })}

          <tr className="classic-pos-cart-entry-row">
            <td className="classic-pos-cart-rownum">{lines.length + 1}</td>
            <td className="classic-pos-cart-scan-cell classic-pos-col-scan">
              {replacingLineId ? (
                <span className="classic-pos-cart-entry-muted text-xs" aria-hidden="true">
                  —
                </span>
              ) : (
                scanSearch
              )}
            </td>
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
            {selectionEnabled ? <td className="classic-pos-col-select" aria-hidden="true" /> : null}
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}
