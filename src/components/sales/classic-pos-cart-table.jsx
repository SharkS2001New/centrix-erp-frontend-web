"use client";

/**
 * Classic External POS cart — Light Stores style grid with in-cell scan lookup dropdown.
 */
export function ClassicPosCartTable({
  lines = [],
  selectedLineId,
  onSelectLine,
  orderCaption = "New Order",
  showLineDiscount = false,
  formatQty,
  formatMoney,
  linePackage,
  lineUnitPrice,
  lineDiscount,
  lineAmount,
  scanSearch = null,
  qtyRef,
  entryDescription,
  entryPackage,
  entryQty,
  entryUnitPrice,
  entryAmount,
  entryReady,
  busy = false,
  onEntryQtyChange,
  onEntryQtyKeyDown,
}) {
  return (
    <div className="classic-pos-cart-table-wrap">
      <div className="classic-pos-cart-caption">{orderCaption}</div>
      <table className="classic-pos-cart-table">
        <thead>
          <tr>
            <th className="classic-pos-cart-rownum" aria-label="#" />
            <th>Scan code</th>
            <th>Product description</th>
            <th className="text-center">Package</th>
            <th className="text-center">Qty</th>
            <th className="text-center">Price</th>
            {showLineDiscount ? <th className="text-center">Discount</th> : null}
            <th className="text-center">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const selected = String(selectedLineId) === String(line.id);
            return (
              <tr
                key={line.id}
                className={selected ? "classic-pos-cart-row--selected" : undefined}
                onClick={() => onSelectLine?.(line.id)}
              >
                <td className="classic-pos-cart-rownum">{index + 1}</td>
                <td className="font-mono">{line.product_code}</td>
                <td>{line.product_name}</td>
                <td className="text-center">
                  {linePackage?.(line) ?? line.package_label ?? line.uom_name ?? "—"}
                </td>
                <td className="text-center tabular-nums">{formatQty?.(line) ?? line.quantity}</td>
                <td className="text-center tabular-nums">{lineUnitPrice?.(line)}</td>
                {showLineDiscount ? (
                  <td className="text-center tabular-nums">{lineDiscount?.(line)}</td>
                ) : null}
                <td className="text-center tabular-nums font-semibold">{lineAmount?.(line)}</td>
              </tr>
            );
          })}

          <tr className="classic-pos-cart-entry-row">
            <td className="classic-pos-cart-rownum">{lines.length + 1}</td>
            <td className="classic-pos-cart-scan-cell">{scanSearch}</td>
            <td className="classic-pos-cart-entry-muted">
              {entryReady ? entryDescription : ""}
            </td>
            <td className="text-center classic-pos-cart-entry-muted">
              {entryReady ? entryPackage : ""}
            </td>
            <td className="text-center">
              {entryReady ? (
                <input
                  ref={qtyRef}
                  type="number"
                  min="0"
                  step="any"
                  className="classic-pos-cart-qty-input"
                  value={entryQty}
                  disabled={busy}
                  onChange={(e) => onEntryQtyChange?.(e.target.value)}
                  onKeyDown={onEntryQtyKeyDown}
                />
              ) : (
                <span className="classic-pos-cart-entry-muted">—</span>
              )}
            </td>
            <td className="text-center tabular-nums classic-pos-cart-entry-muted">
              {entryReady ? formatMoney?.(entryUnitPrice) : ""}
            </td>
            {showLineDiscount ? <td /> : null}
            <td className="text-center tabular-nums font-semibold classic-pos-cart-entry-muted">
              {entryReady ? formatMoney?.(entryAmount) : ""}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
