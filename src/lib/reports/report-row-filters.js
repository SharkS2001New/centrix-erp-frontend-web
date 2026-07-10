/** Hide POS sale movements when external POS is not enabled (typical distribution setups). */
export function filterStockMovementRows(rows = [], capabilities) {
  if (capabilities?.modules?.["sales.pos"]) return rows;
  return rows.filter(
    (row) => String(row.transaction_type ?? "").toUpperCase() !== "POS_SALE",
  );
}
