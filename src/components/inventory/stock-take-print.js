import { printHtmlDocument } from "@/lib/print-dispatch";
import { escapeHtml } from "@/lib/sale-document-print-shared";
import { downloadExcelFromRows } from "@/lib/spreadsheet";
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

/** Print / Excel column keys. Product name is always included. */
export const STOCK_TAKE_EXPORT_COLUMN_KEYS = [
  "rowNumber",
  "productCode",
  "uom",
  "shopCurrent",
  "shopCounted",
  "shopVariance",
  "storeCurrent",
  "storeCounted",
  "storeVariance",
];

export const STOCK_TAKE_EXPORT_COLUMN_OPTIONS = [
  { key: "rowNumber", label: "Row #" },
  { key: "productCode", label: "Product code" },
  { key: "uom", label: "UOM / packaging" },
  { key: "shopCurrent", label: "Shop — Current stock", location: "shop" },
  { key: "shopCounted", label: "Shop — Counted", location: "shop" },
  { key: "shopVariance", label: "Shop — Variance", location: "shop" },
  { key: "storeCurrent", label: "Store — Current stock", location: "store" },
  { key: "storeCounted", label: "Store — Counted", location: "store" },
  { key: "storeVariance", label: "Store — Variance", location: "store" },
];

export function defaultStockTakeExportColumns(session, { includeCounted = true } = {}) {
  const loc = String(session?.stock_location ?? "both");
  const showShop = loc === "shop" || loc === "both";
  const showStore = loc === "store" || loc === "both";
  return {
    rowNumber: true,
    productCode: true,
    uom: true,
    shopCurrent: showShop,
    shopCounted: showShop && includeCounted,
    shopVariance: showShop && includeCounted,
    storeCurrent: showStore,
    storeCounted: showStore && includeCounted,
    storeVariance: showStore && includeCounted,
  };
}

export function normalizeStockTakeExportColumns(raw, session) {
  const defaults = defaultStockTakeExportColumns(session, { includeCounted: true });
  const next = { ...defaults };
  if (raw && typeof raw === "object") {
    for (const key of STOCK_TAKE_EXPORT_COLUMN_KEYS) {
      if (typeof raw[key] === "boolean") next[key] = raw[key];
    }
  }
  const loc = String(session?.stock_location ?? "both");
  if (loc === "shop") {
    next.storeCurrent = false;
    next.storeCounted = false;
    next.storeVariance = false;
  }
  if (loc === "store") {
    next.shopCurrent = false;
    next.shopCounted = false;
    next.shopVariance = false;
  }
  return next;
}

export function stockTakeExportColumnStorageKey(sessionId) {
  return `centrix.stock-take.export-columns.${sessionId ?? "default"}`;
}

/**
 * Same basis as the stock-take screen "Current stock" column (in progress):
 * live ERP qty when present, else the session snapshot (system_quantity).
 */
export function stockTakeCurrentQty(line) {
  if (!line) return 0;
  if (line.live_quantity != null && line.live_quantity !== "") {
    return Number(line.live_quantity);
  }
  return Number(line.system_quantity ?? 0);
}

/** Book qty frozen on the line (updated to live-at-complete when the session closes). */
export function stockTakeBookQty(line) {
  return Number(line?.system_quantity ?? 0);
}

/**
 * Qty shown in "Current stock":
 * - In progress: live ERP (what complete will adjust from)
 * - Completed: book snapshot at close (so variance stays the stock-take adjustment)
 */
export function stockTakeDisplayCurrentQty(line, { completed = false } = {}) {
  if (!line) return 0;
  return completed ? stockTakeBookQty(line) : stockTakeCurrentQty(line);
}

/**
 * Variance = counted − basis. Basis is live while open, book after complete
 * (matches ledger: quantity_change = counted − live_at_complete, then system_quantity stored as that live).
 */
export function stockTakeVarianceBase(line, { completed = false } = {}) {
  if (!line) return 0;
  const counted = Number(line.counted_quantity ?? 0);
  const basis = completed ? stockTakeBookQty(line) : stockTakeCurrentQty(line);
  return counted - basis;
}

function formatLineQty(line, uom, { completed = false } = {}) {
  if (!line) return "—";
  return formatMixedStockDisplay(stockTakeDisplayCurrentQty(line, { completed }), uom).text;
}

function formatCountedQty(line, uom, blankCounted) {
  if (!line) return "—";
  if (blankCounted) return "";
  return formatMixedStockDisplay(Number(line.counted_quantity ?? 0), uom).text;
}

function formatVarianceQty(line, uom, blankCounted, { completed = false } = {}) {
  if (!line || blankCounted) return blankCounted ? "" : "—";
  if (!line.is_counted) return "—";
  const variance = stockTakeVarianceBase(line, { completed });
  if (Math.abs(variance) < 0.0001) return "0";
  const text = formatMixedStockDisplay(Math.abs(variance), uom).text;
  return `${variance > 0 ? "+" : "−"}${text}`;
}

function resolveColumns(session, columns) {
  return normalizeStockTakeExportColumns(columns, session);
}

function shopCols(cols) {
  return [cols.shopCurrent, cols.shopCounted, cols.shopVariance].filter(Boolean).length;
}

function storeCols(cols) {
  return [cols.storeCurrent, cols.storeCounted, cols.storeVariance].filter(Boolean).length;
}

/**
 * @param {object} options
 * @param {object} options.session
 * @param {Array<object>} options.rows
 * @param {object} [options.organization]
 * @param {boolean} [options.blankCounted]
 * @param {Record<string, boolean>} [options.columns]
 */
export function buildStockTakePrintHtml({
  session,
  rows,
  organization = null,
  blankCounted = true,
  columns: columnsInput = null,
}) {
  const cols = resolveColumns(session, columnsInput);
  const orgName = organization?.org_name ?? "Stock take";
  const sessionCode = session?.session_code ?? "Stock take";
  const stockLocation = session?.stock_location ?? "both";
  const completed = String(session?.status ?? "").toLowerCase() === "completed";
  const nShop = shopCols(cols);
  const nStore = storeCols(cols);

  const bodyRows = rows
    .map((row, index) => {
      const cells = [];
      if (cols.rowNumber) cells.push(`<td class="num">${index + 1}</td>`);

      const codeLine = cols.productCode
        ? `<div class="code">${escapeHtml(row.product_code ?? "")}</div>`
        : "";
      const uomLine = cols.uom
        ? `<div class="uom">${escapeHtml(row.hierarchy ?? "")}</div>`
        : "";
      cells.push(`<td class="product">
        <div class="name">${escapeHtml(row.product_name ?? row.product_code)}</div>
        ${codeLine}
        ${uomLine}
      </td>`);

      if (nShop > 0) {
        const line = row.shop;
        if (cols.shopCurrent) {
          cells.push(`<td class="qty">${escapeHtml(formatLineQty(line, row.uom, { completed }))}</td>`);
        }
        if (cols.shopCounted) {
          cells.push(
            `<td class="qty counted">${escapeHtml(formatCountedQty(line, row.uom, blankCounted))}</td>`,
          );
        }
        if (cols.shopVariance) {
          cells.push(
            `<td class="qty">${escapeHtml(formatVarianceQty(line, row.uom, blankCounted, { completed }))}</td>`,
          );
        }
      }

      if (nStore > 0) {
        const line = row.store;
        if (cols.storeCurrent) {
          cells.push(`<td class="qty">${escapeHtml(formatLineQty(line, row.uom, { completed }))}</td>`);
        }
        if (cols.storeCounted) {
          cells.push(
            `<td class="qty counted">${escapeHtml(formatCountedQty(line, row.uom, blankCounted))}</td>`,
          );
        }
        if (cols.storeVariance) {
          cells.push(
            `<td class="qty">${escapeHtml(formatVarianceQty(line, row.uom, blankCounted, { completed }))}</td>`,
          );
        }
      }

      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");

  const rowNumHead = cols.rowNumber ? `<th rowspan="2">#</th>` : "";
  const shopHead = nShop > 0 ? `<th colspan="${nShop}">Shop</th>` : "";
  const storeHead = nStore > 0 ? `<th colspan="${nStore}">Store / warehouse</th>` : "";

  const shopSub = [
    cols.shopCurrent ? "<th>Current stock</th>" : "",
    cols.shopCounted ? "<th>Counted</th>" : "",
    cols.shopVariance ? "<th>Variance</th>" : "",
  ].join("");
  const storeSub = [
    cols.storeCurrent ? "<th>Current stock</th>" : "",
    cols.storeCounted ? "<th>Counted</th>" : "",
    cols.storeVariance ? "<th>Variance</th>" : "",
  ].join("");

  const colCount = (cols.rowNumber ? 1 : 0) + 1 + nShop + nStore;

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
        ${rowNumHead}
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
      ${bodyRows || `<tr><td colspan="${colCount}">No products in this session.</td></tr>`}
    </tbody>
  </table>
  <p class="notes">${
    blankCounted && (cols.shopCounted || cols.storeCounted)
      ? "Write physical counts in the highlighted Counted columns, then enter them in Centrix."
      : "Generated from Centrix stock take."
  }</p>
</body>
</html>`;
}

export async function printStockTakeSheet(options) {
  const html = buildStockTakePrintHtml(options);
  return printHtmlDocument(html, {
    jobType: "stock_take",
    documentId: options?.session?.id ?? options?.session?.session_code ?? null,
    windowFeatures: "width=900,height=960",
  });
}

/** Flat header + data rows for Excel (same column selection as print). */
export function buildStockTakeExcelRows({
  session,
  rows,
  blankCounted = true,
  columns: columnsInput = null,
}) {
  const cols = resolveColumns(session, columnsInput);
  const completed = String(session?.status ?? "").toLowerCase() === "completed";
  const headers = [];
  if (cols.rowNumber) headers.push("#");
  headers.push("Product");
  if (cols.productCode) headers.push("Product code");
  if (cols.uom) headers.push("UOM");
  if (cols.shopCurrent) headers.push("Shop current stock");
  if (cols.shopCounted) headers.push("Shop counted");
  if (cols.shopVariance) headers.push("Shop variance");
  if (cols.storeCurrent) headers.push("Store current stock");
  if (cols.storeCounted) headers.push("Store counted");
  if (cols.storeVariance) headers.push("Store variance");

  const data = rows.map((row, index) => {
    const out = [];
    if (cols.rowNumber) out.push(index + 1);
    out.push(row.product_name ?? row.product_code ?? "");
    if (cols.productCode) out.push(row.product_code ?? "");
    if (cols.uom) out.push(row.hierarchy ?? "");
    if (cols.shopCurrent) out.push(formatLineQty(row.shop, row.uom, { completed }));
    if (cols.shopCounted) out.push(formatCountedQty(row.shop, row.uom, blankCounted));
    if (cols.shopVariance) out.push(formatVarianceQty(row.shop, row.uom, blankCounted, { completed }));
    if (cols.storeCurrent) out.push(formatLineQty(row.store, row.uom, { completed }));
    if (cols.storeCounted) out.push(formatCountedQty(row.store, row.uom, blankCounted));
    if (cols.storeVariance) out.push(formatVarianceQty(row.store, row.uom, blankCounted, { completed }));
    return out;
  });

  return [headers, ...data];
}

export async function exportStockTakeExcel(options) {
  const sessionCode = String(options?.session?.session_code ?? "stock-take")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 10);
  const excelRows = buildStockTakeExcelRows(options);
  await downloadExcelFromRows(
    `${sessionCode || "stock-take"}-${stamp}.xlsx`,
    "Stock take",
    excelRows,
  );
}

function uomFromLineOrMap(line, product, uomById) {
  const fromMap = product?.unit_id != null ? uomById.get(product.unit_id) : null;
  if (fromMap) return fromMap;
  if (line?.conversion_factor != null || line?.uom_name || line?.uom_type) {
    return {
      id: line.unit_id,
      conversion_factor: line.conversion_factor,
      full_name: line.uom_name,
      small_packaging_label: line.small_packaging_label,
      middle_packaging_label: line.middle_packaging_label,
      middle_factor: line.middle_factor,
      uom_type: line.uom_type,
    };
  }
  return null;
}

export function stockTakePrintRowsFromLines(lines, productByCode, uomById) {
  const map = new Map();
  for (const line of lines) {
    let row = map.get(line.product_code);
    if (!row) {
      const product = productByCode.get(line.product_code);
      const uom = uomFromLineOrMap(line, product, uomById);
      row = {
        product_code: line.product_code,
        product_name: line.product_name ?? product?.product_name ?? line.product_code,
        uom,
        hierarchy: uomHierarchyChain(uom),
        shop: null,
        store: null,
      };
      map.set(line.product_code, row);
    } else if (!row.uom) {
      const product = productByCode.get(line.product_code);
      row.uom = uomFromLineOrMap(line, product, uomById);
      row.hierarchy = uomHierarchyChain(row.uom);
    }
    if (line.stock_location === "shop") row.shop = line;
    if (line.stock_location === "store") row.store = line;
  }
  return [...map.values()].sort((a, b) =>
    String(a.product_name).localeCompare(String(b.product_name)),
  );
}
