/**
 * When POS keeps identical SKUs as separate cart lines (qty-based markups),
 * receipts/invoices should still show one row per product with summed qty + amounts.
 *
 * Does not re-price: amount = sum of line amounts (not a fresh markup for the total qty).
 *
 * @param {Array<object>|null|undefined} items
 * @returns {Array<object>}
 */
export function combineIdenticalSaleItemsForPrint(items) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length < 2) return rows;

  const groups = new Map();
  const order = [];

  for (const line of rows) {
    const code = String(
      line?.product_code ?? line?.product?.product_code ?? "",
    ).trim();
    if (!code) {
      order.push({ key: `__solo_${order.length}`, line, solo: true });
      continue;
    }
    // Normalize 1 / true / "1" so offline boolean flags still group with server ints.
    const wholesaleRetail = line?.on_wholesale_retail;
    const flag =
      wholesaleRetail === true ||
      wholesaleRetail === 1 ||
      wholesaleRetail === "1" ||
      Number(wholesaleRetail) === 1
        ? 1
        : 0;
    const key = `${code.toLowerCase()}|${flag}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push({ key, solo: false });
    }
    groups.get(key).push(line);
  }

  const combined = [];
  for (const entry of order) {
    if (entry.solo) {
      combined.push(entry.line);
      continue;
    }
    const group = groups.get(entry.key) ?? [];
    if (group.length === 1) {
      combined.push(group[0]);
      continue;
    }

    const first = group[0];
    const quantity = group.reduce((sum, row) => sum + Number(row?.quantity ?? 0), 0);
    const amount = group.reduce((sum, row) => sum + Number(row?.amount ?? 0), 0);
    const discount = group.reduce((sum, row) => sum + Number(row?.discount_given ?? 0), 0);
    const vat = group.reduce((sum, row) => sum + Number(row?.product_vat ?? 0), 0);

    combined.push({
      ...first,
      quantity,
      amount: Math.round(amount * 100) / 100,
      discount_given: Math.round(discount * 100) / 100,
      product_vat: Math.round(vat * 100) / 100,
      product_code:
        first.product_code ?? first.product?.product_code ?? codeFromKey(entry.key),
      // Force print helpers to derive unit price from amount ÷ qty (summed amounts).
      selling_price: null,
      unit_price: null,
      display_unit_price: null,
      price: null,
    });
  }

  return combined;
}

function codeFromKey(key) {
  const raw = String(key ?? "").split("|")[0] ?? "";
  return raw || null;
}
