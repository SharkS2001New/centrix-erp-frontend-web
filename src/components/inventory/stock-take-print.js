import { openPrintWindow } from "@/lib/open-print-window";
import { escapeHtml } from "@/lib/sale-document-print-shared";
import { formatMixedStockDisplay } from "@/lib/stock-uom";
import { uomHierarchyChain } from "@/lib/uom-packaging";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(String(value).includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function locationLabel(location) {
  if (location === "shop") return "Shop";
  if (location === "store") return "Store / warehouse";
  return String(location ?? "");
}

/**
 * @param {object} options
 * @param {object} options.session
 * @param {Array<object>} options.rows grouped product rows with shop/store lines
 * @param {object} [options.organization]
 * @param {boolean} [options.blankCounted=false] leave counted column empty for handwriting
 */
export function buildStockTakePrintHtml({
  session,
  rows,
  organization = null,
  blankCounted = true,
}) {
  const orgName = organization?.org_name ?? "Stock take";
  const sessionCode = session?.session_code ?? "Stock take";
  const stockLocation = session?.stock_location ?? "both";
  const showShop = stockLocation === "shop" || stockLocation === "both";
  const showStore = stockLocation === "store" || stockLocation === "both";

  const bodyRows = rows
    .map((row, index) => {
      const cells = [];
      cells.push(`<td class="num">${index + 1}</td>`);
      cells.push(`<td class="product">
        <div class="name">${escapeHtml(row.product_name ?? row.product_code)}</div>
        <div class="code">${escapeHtml(row.product_code)}</div>
        <div class="uom">${escapeHtml(row.hierarchy ?? "")}</div>
      </td>`);

      if (showShop) {
        const line = row.shop;
        const system = line ? formatMixedStockDisplay(line.system_quantity, row.uom).text : "—";
        const counted = blankCounted
          ? ""
          : line
            ? formatMixedStockDisplay(line.counted_quantity, row.uom).text
            : "—";
        cells.push(`<td class="qty">${escapeHtml(system)}</td>`);
        cells.push(`<td class="qty counted">${escapeHtml(counted)}</td>`);
      }

      if (showStore) {
        const line = row.store;
        const system = line ? formatMixedStockDisplay(line.system_quantity, row.uom).text : "—";
        const counted = blankCounted
          ? ""
          : line
            ? formatMixedStockDisplay(line.counted_quantity, row.uom).text
            : "—";
        cells.push(`<td class="qty">${escapeHtml(system)}</td>`);
        cells.push(`<td class="qty counted">${escapeHtml(counted)}</td>`);
      }

      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");

  const shopHead = showShop
    ? `<th colspan="2">Shop</th>`
    : "";
  const storeHead = showStore
    ? `<th colspan="2">Store / warehouse</th>`
    : "";
  const shopSub = showShop
    ? `<th>System</th><th>Counted</th>`
    : "";
  const storeSub = showStore
    ? `<th>System</th><th>Counted</th>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(sessionCode)} — Stock take</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; color: #0f172a; margin: 0; padding: 24px; font-size: 12px; }
    h1 { margin: 0 0 4px; font-size: 20px; }
    .meta { color: #475569; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
    th { background: #f8fafc; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    .num { width: 32px; text-align: center; color: #64748b; }
    .product .name { font-weight: 600; }
    .product .code, .product .uom { font-size: 10px; color: #64748b; }
    .qty { width: 90px; text-align: right; white-space: nowrap; }
    .counted { min-height: 28px; background: #fffbeb; }
    .notes { margin-top: 16px; font-size: 11px; color: #475569; }
    @media print { body { padding: 12px; } }
  </style>
</head>
<body>
  <h1>Stock take count sheet</h1>
  <p class="meta">
    ${escapeHtml(orgName)} · ${escapeHtml(sessionCode)} ·
    ${escapeHtml(formatDate(session?.created_at ?? new Date().toISOString()))} ·
    Location: ${escapeHtml(locationLabel(stockLocation))}
  </p>
  <table>
    <thead>
      <tr>
        <th rowspan="2">#</th>
        <th rowspan="2">Product</th>
        ${shopHead}
        ${storeHead}
      </tr>
      <tr>
        ${shopSub}
        ${storeSub}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || '<tr><td colspan="99">No products in this session.</td></tr>'}
    </tbody>
  </table>
  <p class="notes">Write physical counts in the highlighted Counted columns, then enter them in Centrix.</p>
</body>
</html>`;
}

export function printStockTakeSheet(options) {
  const html = buildStockTakePrintHtml(options);
  openPrintWindow(html, "width=900,height=960");
}

export function stockTakePrintRowsFromLines(lines, productByCode, uomById) {
  const map = new Map();
  for (const line of lines) {
    let row = map.get(line.product_code);
    if (!row) {
      const product = productByCode.get(line.product_code);
      const uom = product ? uomById.get(product.unit_id) : null;
      row = {
        product_code: line.product_code,
        product_name: line.product_name ?? product?.product_name ?? line.product_code,
        uom,
        hierarchy: uomHierarchyChain(uom),
        shop: null,
        store: null,
      };
      map.set(line.product_code, row);
    }
    if (line.stock_location === "shop") row.shop = line;
    if (line.stock_location === "store") row.store = line;
  }
  return [...map.values()].sort((a, b) =>
    String(a.product_name).localeCompare(String(b.product_name)),
  );
}
