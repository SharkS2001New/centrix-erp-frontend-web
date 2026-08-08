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
  onSetQty,
  onDraftQtyChange = null,
  swapQtyCommit = false,
  inputRef = null,
}) {
  const committed = String(entryQty ?? "");
  const [draft, setDraft] = useState(committed);
  const skipBlurCommitRef = useRef(false);

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
        onBlur={() => {
          if (skipBlurCommitRef.current) {
            skipBlurCommitRef.current = false;
            return;
          }
          // Push edited qty when focus leaves (click Scan, mouse away). Unchanged
          // values no-op so accidental focus/blur does not re-PATCH or steal focus.
          commit({ force: swapQtyCommit });
        }}
        onKeyDown={(e) => {
          if (isPosFunctionKeyEvent(e) || isPosClassicAltShortcut(e)) return;
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            // Enter already commits — skip the blur commit that would fire next
            // (double swap/qty PATCH raced update_no and left the old SKU on the server).
            skipBlurCommitRef.current = true;
            // Do not force-commit an unchanged qty — that marked previous-order edits
            // dirty and triggered a bogus Payment Breakdown on Alt+P.
            commit({ force: swapQtyCommit });
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(committed);
            skipBlurCommitRef.current = true;
            e.currentTarget.blur();
          }
        }}
      />
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
  orderNameResults = null,
  orderNameLoading = false,
  orderNameHighlight = 0,
  onOrderNameHighlightChange = null,
  onOrderNameSelect = null,
  onOrderNameDismiss = null,
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
  lineAmount,
  lineEntryQty,
  lineQtyUnit,
  onSetQty,
  onSwapDraftQtyChange = null,
  scanSearch = null,
  qtyRef,
  entryDescription,
  entryPackage,
  entryQty,
  entryQtyUnit = "",
  entryUnitPrice,
  entryAmount,
  entryReady,
  onEntryQtyChange,
  onEntryQtyKeyDown,
  onEntryQtyCommit = null,
  onEmptyDoubleClick = null,
  tableScrollRef = null,
}) {
  const skipEntryQtyBlurCommitRef = useRef(false);

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
              title="F12 switches mode for new lines, and for a cart line only when you click its qty and press Enter"
            >
              {sellAtRetail
                ? "Mode: RETAIL — qty Enter applies to that line · F12 wholesale"
                : "Mode: WHOLESALE — qty Enter applies to that line · F12 retail"}
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
            <div className="classic-pos-cart-order-lookup">
              <input
                type="text"
                className={`classic-pos-cart-order-input${
                  Array.isArray(orderNameResults) || orderNameLoading
                    ? " classic-pos-cart-order-input--name"
                    : ""
                }`}
                value={orderNo}
                disabled={busy || orderNavLocked}
                placeholder="Order # / name"
                autoComplete="off"
                aria-label="POS Cash Sales number or customer name"
                aria-autocomplete="list"
                aria-expanded={Array.isArray(orderNameResults)}
                title={
                  orderNavLocked
                    ? orderNavHint || "Order editing is disabled"
                    : "Type a POS ticket # and press Enter or Find, or type a customer name to find matching receipts."
                }
                onFocus={(e) => e.target.select()}
                onChange={(e) => onOrderNoChange?.(e.target.value)}
                onKeyDown={(e) => {
                  if (isPosFunctionKeyEvent(e) || isPosClassicAltShortcut(e)) return;
                  const results = Array.isArray(orderNameResults) ? orderNameResults : null;
                  const namePanelOpen = orderNameLoading || Array.isArray(orderNameResults);
                  if (namePanelOpen && e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    onOrderNameDismiss?.();
                    return;
                  }
                  if (results && results.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      const next = Math.min(
                        (Number(orderNameHighlight) || 0) + 1,
                        results.length - 1,
                      );
                      onOrderNameHighlightChange?.(next);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      const next = Math.max((Number(orderNameHighlight) || 0) - 1, 0);
                      onOrderNameHighlightChange?.(next);
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const pick =
                        results[Number(orderNameHighlight) || 0] ?? results[0] ?? null;
                      if (pick) onOrderNameSelect?.(pick);
                      return;
                    }
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onOrderNoSubmit?.();
                  }
                }}
              />
              <button
                type="button"
                className="classic-pos-cart-find-btn"
                disabled={busy || orderNavLocked}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onOrderNoSubmit?.()}
                title={
                  orderNavLocked
                    ? orderNavHint || "Order editing is disabled"
                    : "Find order by number or customer name"
                }
                aria-label="Find order"
              >
                <svg
                  className="classic-pos-cart-find-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <span>Find</span>
              </button>
              {orderNameLoading || Array.isArray(orderNameResults) ? (
                <div
                  className="classic-pos-order-name-dropdown"
                  role="listbox"
                  aria-label="Matching POS orders"
                >
                  {orderNameLoading && (!orderNameResults || orderNameResults.length === 0) ? (
                    <div className="classic-pos-order-name-empty">Searching…</div>
                  ) : null}
                  {!orderNameLoading &&
                  Array.isArray(orderNameResults) &&
                  orderNameResults.length === 0 ? (
                    <div className="classic-pos-order-name-empty">No matching orders</div>
                  ) : null}
                  {Array.isArray(orderNameResults)
                    ? orderNameResults.map((row, index) => {
                        const active = index === (Number(orderNameHighlight) || 0);
                        return (
                          <button
                            key={row.id ?? `${row.order_num}-${index}`}
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={`classic-pos-order-name-row${
                              active ? " classic-pos-order-name-row--active" : ""
                            }`}
                            onMouseDown={(e) => e.preventDefault()}
                            onMouseEnter={() => onOrderNameHighlightChange?.(index)}
                            onClick={() => onOrderNameSelect?.(row)}
                          >
                            <span className="classic-pos-order-name-ticket">
                              {row.ticket_label ??
                                (row.pos_order_num != null && row.pos_order_num !== ""
                                  ? String(row.pos_order_num)
                                  : "—")}
                            </span>
                            <span className="classic-pos-order-name-customer">
                              {row.customer_label ?? "Walk-in"}
                            </span>
                            <span className="classic-pos-order-name-meta">
                              {row.amount_label ?? ""}
                              {row.when_label ? ` · ${row.when_label}` : ""}
                            </span>
                          </button>
                        );
                      })
                    : null}
                </div>
              ) : null}
            </div>
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
          <col className="classic-pos-col-amt" />
          {selectionEnabled ? <col className="classic-pos-col-select" /> : null}
        </colgroup>
        <thead>
          <tr>
            <th className="classic-pos-col-num classic-pos-cart-rownum" aria-label="#" />
            <th className="classic-pos-col-scan">Scan code</th>
            <th className="classic-pos-col-desc">Product description</th>
            <th className="classic-pos-col-pkg">Package</th>
            <th className="classic-pos-col-qty">Qty</th>
            <th className="classic-pos-col-price">Price</th>
            {showLineDiscount ? (
              <th className="classic-pos-col-disc">Discount</th>
            ) : null}
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
                <td className="classic-pos-col-num classic-pos-cart-rownum">{index + 1}</td>
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
                    // Do not gate on lineBusy — classic adds enqueue without blocking
                    // swap; beginReplaceCartLine enforces hard busy itself.
                    if (!replacing && !busy) {
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
                            if (!busy) onScanCodeClick?.(line.id);
                          }
                        }
                  }
                  role={replacing ? undefined : "button"}
                  tabIndex={replacing || busy ? -1 : 0}
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
            <td className="classic-pos-col-num classic-pos-cart-rownum">{lines.length + 1}</td>
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
                    type="text"
                    inputMode="decimal"
                    className="classic-pos-cart-qty-input"
                    value={entryQty}
                    disabled={busy}
                    aria-label={entryQtyUnit ? `Quantity (${entryQtyUnit})` : "Quantity"}
                    onChange={(e) => onEntryQtyChange?.(e.target.value)}
                    onBlur={() => {
                      if (skipEntryQtyBlurCommitRef.current) {
                        skipEntryQtyBlurCommitRef.current = false;
                        return;
                      }
                      // Mouse away / click Scan code — same commit as Enter.
                      onEntryQtyCommit?.();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        // Escape cancels and moves focus — skip the blur commit.
                        skipEntryQtyBlurCommitRef.current = true;
                        onEntryQtyKeyDown?.(e);
                        return;
                      }
                      if (e.key === "Enter") {
                        // Enter commits once; blur that follows must not commit again.
                        skipEntryQtyBlurCommitRef.current = true;
                        onEntryQtyKeyDown?.(e);
                        e.currentTarget.blur();
                        return;
                      }
                      onEntryQtyKeyDown?.(e);
                    }}
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
