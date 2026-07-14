"use client";

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";
import {
  fetchCategoriesCached,
  fetchSubCategoriesCached,
} from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import { mergeSalesSettings } from "@/lib/sales-settings";
import {
  groupPriceSheetBySubcategory,
  priceSheetCellValue,
  priceSheetColumnVisibility,
  priceSheetPriceWithMargin,
} from "@/lib/product-price-sheet";
import { openPrintWindow } from "@/lib/open-print-window";
import {
  CatalogPageShell,
  Field,
  FILTER_CONTROL_CLASS,
  FilterSelect,
  PrimaryButton,
  SearchInput,
  SECONDARY_BTN_CLASS,
  TABLE_BODY_ROW_CLASS,
  TABLE_SECTION_ROW_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";
import { REPORT_FILTER_SEARCH_WRAPPER_CLASS } from "@/components/reports/report-filter-search-select";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPriceSheetPrintHtml({
  groups,
  columns,
  organizationName,
  showCost,
  showMargins,
}) {
  const colCount =
    1 +
    (columns.packaging ? 1 : 0) +
    (showCost ? 1 : 0) +
    (columns.retail ? 1 : 0) +
    (columns.dozens ? 1 : 0) +
    (columns.aboveDozens ? 1 : 0) +
    (columns.wholesale ? 1 : 0);

  const headCells = [
    "<th>Product Name</th>",
    columns.packaging ? "<th>Packaging</th>" : "",
    showCost ? '<th class="num">Unit Cost</th>' : "",
    columns.retail ? '<th class="num">Price (Retail)</th>' : "",
    columns.dozens ? '<th class="num">Price (Dozens)</th>' : "",
    columns.aboveDozens ? '<th class="num">Price (Above Dozens)</th>' : "",
    columns.wholesale ? '<th class="num">Full Price (Wholesale)</th>' : "",
  ].join("");

  const priceCell = (price, enabled = true) => {
    if (!enabled) return "—";
    return escapeHtml(priceSheetCellValue(price, enabled));
  };

  const fullPriceCell = (row) => {
    if (showMargins) {
      return escapeHtml(priceSheetPriceWithMargin(row.wholesale_price, row.wholesale_margin));
    }
    return escapeHtml(priceSheetCellValue(row.wholesale_price));
  };

  const body = groups
    .map((group) => {
      const categoryRow = `<tr class="category"><td colspan="${colCount}">Subcategory: ${escapeHtml(group.category)}</td></tr>`;
      const itemRows = group.items
        .map((row) => {
          const cells = [
            `<td>${escapeHtml(row.product_name)}</td>`,
            columns.packaging ? `<td>${escapeHtml(row.packaging)}</td>` : "",
            showCost
              ? `<td class="num">${escapeHtml(priceSheetCellValue(row.last_cost_price, row.last_cost_price != null))}</td>`
              : "",
            columns.retail
              ? `<td class="num">${priceCell(row.retail_price, row.sell_on_retail)}</td>`
              : "",
            columns.dozens
              ? `<td class="num">${priceCell(
                  row.dozens_price,
                  row.sell_on_retail && row.has_middle_pack,
                )}</td>`
              : "",
            columns.aboveDozens
              ? `<td class="num">${priceCell(row.above_dozens_price, row.sell_on_retail)}</td>`
              : "",
            columns.wholesale
              ? `<td class="num">${fullPriceCell(row)}</td>`
              : "",
          ].join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return categoryRow + itemRows;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <title>Product Price Sheet</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; color: #212529; font-size: 10px; }
    .title { text-align: center; font-size: 22px; font-weight: 800; color: #4c5ba4; letter-spacing: 0.04em; margin: 0 0 12px; }
    .org { text-align: center; font-size: 10px; color: #6c757d; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #4c5ba4; color: #fff; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; }
    thead th.num { text-align: right; }
    tbody td { padding: 5px 8px; border-bottom: 1px solid #dee2e6; vertical-align: top; color: #212529; }
    tbody td.num { text-align: right; white-space: nowrap; font-weight: 600; }
    tr.category td { background: #eef0f8; color: #4c5ba4; font-weight: 700; text-transform: uppercase; font-size: 9px; padding: 6px 8px; }
    .footer { margin-top: 10px; display: flex; justify-content: space-between; font-size: 9px; color: #6c757d; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1 class="title">PRODUCT PRICE SHEET</h1>
  ${organizationName ? `<p class="org">${escapeHtml(organizationName)}</p>` : ""}
  <table>
    <thead><tr>${headCells}</tr></thead>
    <tbody>${body}</tbody>
  </table>
  <div class="footer">
    <span>Printed: ${escapeHtml(new Date().toLocaleString("en-GB"))}</span>
    <span>Centrix ERP</span>
  </div>
</body>
</html>`;
}

const DEFAULT_PRINT_COLUMNS = {
  packaging: true,
  unitCost: true,
  retail: true,
  dozens: true,
  aboveDozens: true,
  wholesale: true,
};

const PRINT_COLUMN_OPTIONS = [
  { key: "packaging", label: "Packaging" },
  { key: "unitCost", label: "Unit cost" },
  { key: "retail", label: "Retail price" },
  { key: "dozens", label: "Dozens price" },
  { key: "aboveDozens", label: "Above dozens price" },
  { key: "wholesale", label: "Full price (wholesale)" },
];

export function ProductPriceSheetScreen() {
  const { capabilities, organization, user } = useAuth();
  const retailPricingEnabled = Boolean(
    mergeSalesSettings(capabilities?.module_settings).enable_retail_pricing,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [rows, setRows] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [categories, setCategories] = useState([]);
  const [printColumns, setPrintColumns] = useState(DEFAULT_PRINT_COLUMNS);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsButtonRef = useRef(null);
  const [columnsMenuStyle, setColumnsMenuStyle] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sheetParams = {
        per_page: 200,
        wholesale_only: retailPricingEnabled ? 0 : 1,
      };
      if (user?.branch_id) sheetParams.branch_id = user.branch_id;

      const [builtRows, cats, subs] = await Promise.all([
        fetchAllPaginatedRowsSmart("/reports/product-price-sheet", sheetParams, { perPage: 200 }),
        fetchCategoriesCached(organization?.id),
        fetchSubCategoriesCached(organization?.id),
      ]);

      const rowsWithStatus = (builtRows ?? []).map((row) => {
        const qty = Number(row.stock_qty ?? 0);
        const reorder = Number(row.reorder_point ?? 0);
        return {
          ...row,
          stock_status:
            qty <= 0 ? "out_of_stock" : reorder > 0 && qty <= reorder ? "low_stock" : "in_stock",
        };
      });

      setRows(rowsWithStatus);
      setCategories(cats ?? []);
      setSubcategories(
        [...(subs ?? [])].sort((a, b) =>
          String(a.subcategory_name).localeCompare(String(b.subcategory_name)),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load price sheet data");
    } finally {
      setLoading(false);
    }
  }, [retailPricingEnabled, organization?.id, user?.branch_id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!columnsOpen || !columnsButtonRef.current) {
      setColumnsMenuStyle(null);
      return;
    }
    const rect = columnsButtonRef.current.getBoundingClientRect();
    setColumnsMenuStyle({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [columnsOpen]);

  const subcategoryOptions = useMemo(() => {
    const options = [{ value: "all", label: "All subcategories" }];
    const byCat = new Map();
    for (const sub of subcategories) {
      const catId = String(sub.category_id ?? "");
      if (!byCat.has(catId)) byCat.set(catId, []);
      byCat.get(catId).push(sub);
    }
    for (const [catId, subs] of byCat) {
      const cat = categories.find((c) => String(c.id) === catId);
      options.push({
        value: `hdr-${catId}`,
        label: cat?.category_name ?? "Uncategorized",
        isHeader: true,
      });
      for (const subcategory of [...subs].sort((a, b) =>
        String(a.subcategory_name).localeCompare(String(b.subcategory_name)),
      )) {
        options.push({
          value: subcategory.subcategory_name,
          label: subcategory.subcategory_name,
        });
      }
    }
    return options;
  }, [subcategories, categories]);

  const filteredRows = useMemo(() => {
    const q = String(deferredSearch ?? "").trim().toLowerCase();
    return rows.filter((row) => {
      if (subcategoryFilter !== "all" && row.subcategory_name !== subcategoryFilter) return false;
      if (stockFilter === "in_stock" && row.stock_status !== "in_stock") return false;
      if (stockFilter === "low_stock" && row.stock_status !== "low_stock") return false;
      if (stockFilter === "out_of_stock" && row.stock_status !== "out_of_stock") return false;
      if (!q) return true;
      return (
        String(row.product_name).toLowerCase().includes(q) ||
        String(row.product_code).toLowerCase().includes(q)
      );
    });
  }, [rows, deferredSearch, subcategoryFilter, stockFilter]);

  const groups = useMemo(
    () => groupPriceSheetBySubcategory(filteredRows),
    [filteredRows],
  );

  const availableColumns = useMemo(
    () => priceSheetColumnVisibility(filteredRows, { retailPricingEnabled }),
    [filteredRows, retailPricingEnabled],
  );

  const columns = useMemo(
    () => ({
      packaging: printColumns.packaging,
      retail: availableColumns.retail && printColumns.retail,
      dozens: availableColumns.dozens && printColumns.dozens,
      aboveDozens: availableColumns.aboveDozens && printColumns.aboveDozens,
      wholesale: availableColumns.wholesale && printColumns.wholesale,
    }),
    [availableColumns, printColumns],
  );

  const hasCostRows = useMemo(
    () => filteredRows.some((row) => row.last_cost_price != null && Number(row.last_cost_price) > 0),
    [filteredRows],
  );
  const showCost = hasCostRows && printColumns.unitCost;

  const showMargins = hasCostRows && columns.wholesale;

  const visibleColumnCount =
    1 +
    (columns.packaging ? 1 : 0) +
    (showCost ? 1 : 0) +
    (columns.retail ? 1 : 0) +
    (columns.dozens ? 1 : 0) +
    (columns.aboveDozens ? 1 : 0) +
    (columns.wholesale ? 1 : 0);

  function handlePrint() {
    const html = buildPriceSheetPrintHtml({
      groups,
      columns,
      organizationName: organization?.org_name ?? capabilities?.profile_label ?? "",
      showCost,
      showMargins,
    });
    openPrintWindow(html, "width=1100,height=800");
  }

  return (
    <CatalogPageShell
      title="Product price list"
      subtitle="Selling prices, unit costs, and expected profit margins from catalog and retail tiers."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/reports"
            className="theme-secondary-btn rounded-lg border px-3 py-2 text-sm font-medium"
          >
            ← Reports
          </Link>
          <PrimaryButton type="button" showIcon={false} onClick={handlePrint} disabled={!groups.length}>
            Print / PDF
          </PrimaryButton>
        </div>
      }
    >
      {!retailPricingEnabled ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Retail pricing is off in sales settings — only wholesale prices are shown. Enable{" "}
          <strong>Retail pricing</strong> under Inventory settings to show retail tier columns.
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search products">
          <SearchInput
            className={REPORT_FILTER_SEARCH_WRAPPER_CLASS}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or code…"
          />
        </Field>
        <Field label="Subcategory">
          <div className="min-w-[14rem]">
            <PosSearchableSelect
              value={subcategoryFilter}
              onChange={(value) => setSubcategoryFilter(value || "all")}
              options={subcategoryOptions}
              placeholder="All subcategories"
              searchPlaceholder="Search subcategory…"
              minSearchLength={0}
              idleSearchLabel="Type to search subcategory"
              emptyLabel="No subcategories found"
              inputClassName={FILTER_CONTROL_CLASS}
            />
          </div>
        </Field>
        <Field label="Stock">
          <FilterSelect
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            options={[
              { value: "all", label: "All products" },
              { value: "in_stock", label: "In stock" },
              { value: "low_stock", label: "Low stock" },
              { value: "out_of_stock", label: "Out of stock" },
            ]}
          />
        </Field>
        <Field label="Prepared by">
          <input
            className={inputClassName()}
            readOnly
            value={user?.full_name ?? user?.username ?? "—"}
          />
        </Field>
        <div className="relative shrink-0 pb-0.5">
          <button
            ref={columnsButtonRef}
            type="button"
            onClick={() => setColumnsOpen((open) => !open)}
            className={`${SECONDARY_BTN_CLASS} gap-2 px-3 py-2.5`}
          >
            Columns
          </button>
          {columnsOpen && typeof document !== "undefined" && columnsMenuStyle
            ? createPortal(
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[70] cursor-default"
                    aria-label="Close column picker"
                    onClick={() => setColumnsOpen(false)}
                  />
                  <div
                    style={{
                      position: "fixed",
                      top: columnsMenuStyle.top,
                      right: columnsMenuStyle.right,
                      zIndex: 80,
                    }}
                    className="theme-panel w-56 rounded-xl border p-3 shadow-lg"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <p className="theme-subtext text-xs font-semibold uppercase tracking-wide">
                        Show columns
                      </p>
                      <button
                        type="button"
                        onClick={() => setPrintColumns(DEFAULT_PRINT_COLUMNS)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-500"
                      >
                        Reset
                      </button>
                    </div>
                    <ul className="max-h-72 space-y-1 overflow-y-auto">
                      {PRINT_COLUMN_OPTIONS.map((option) => {
                        const available =
                          option.key === "unitCost"
                            ? hasCostRows
                            : option.key === "packaging"
                              ? true
                              : Boolean(availableColumns[option.key]);
                        return (
                          <li key={option.key}>
                            <label
                              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                                available
                                  ? "cursor-pointer text-[var(--theme-text-muted)] hover:bg-[var(--theme-hover)]"
                                  : "cursor-not-allowed opacity-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(printColumns[option.key]) && available}
                                disabled={!available}
                                onChange={(event) =>
                                  setPrintColumns((prev) => ({
                                    ...prev,
                                    [option.key]: event.target.checked,
                                  }))
                                }
                                className="rounded border-slate-300"
                              />
                              {option.label}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </>,
                document.body,
              )
            : null}
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading products and pricing tiers…</p>
      ) : !groups.length ? (
        <p className="text-sm text-slate-500">No products with a unit price to display.</p>
      ) : (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="theme-table min-w-full text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-semibold uppercase tracking-wide">
                  <th className="px-3 py-2.5">Product name</th>
                  {columns.packaging ? <th className="px-3 py-2.5">Packaging</th> : null}
                  {showCost ? <th className="px-3 py-2.5 text-right">Unit cost</th> : null}
                  {columns.retail ? (
                    <th className="px-3 py-2.5 text-right">Price (retail)</th>
                  ) : null}
                  {columns.dozens ? (
                    <th className="px-3 py-2.5 text-right">Price (Dozens)</th>
                  ) : null}
                  {columns.aboveDozens ? (
                    <th className="px-3 py-2.5 text-right">Price (Above dozens)</th>
                  ) : null}
                  {columns.wholesale ? (
                    <th className="px-3 py-2.5 text-right">Full price (Wholesale)</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.category}>
                    <tr className={TABLE_SECTION_ROW_CLASS}>
                      <td
                        colSpan={visibleColumnCount}
                        className="px-3 py-2 text-xs font-bold uppercase tracking-wide"
                      >
                        Subcategory: {group.category}
                      </td>
                    </tr>
                    {group.items.map((row) => (
                      <tr key={row.product_code} className={TABLE_BODY_ROW_CLASS}>
                        <td className="px-3 py-2 font-medium">{row.product_name}</td>
                        {columns.packaging ? (
                          <td className="theme-subtext px-3 py-2">{row.packaging}</td>
                        ) : null}
                        {showCost ? (
                          <td className="theme-subtext px-3 py-2 text-right font-semibold tabular-nums">
                            {priceSheetCellValue(row.last_cost_price, row.last_cost_price != null)}
                          </td>
                        ) : null}
                        {columns.retail ? (
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {priceSheetCellValue(row.retail_price, row.sell_on_retail)}
                          </td>
                        ) : null}
                        {columns.dozens ? (
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {priceSheetCellValue(
                              row.dozens_price,
                              row.sell_on_retail && row.has_middle_pack,
                            )}
                          </td>
                        ) : null}
                        {columns.aboveDozens ? (
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {priceSheetCellValue(row.above_dozens_price, row.sell_on_retail)}
                          </td>
                        ) : null}
                        {columns.wholesale ? (
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {showMargins
                              ? priceSheetPriceWithMargin(row.wholesale_price, row.wholesale_margin)
                              : priceSheetCellValue(row.wholesale_price)}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="theme-table-footer flex items-center justify-between px-4 py-2 text-xs">
            <span className="theme-subtext">{filteredRows.length} product(s)</span>
            <span className="theme-subtext">
              Printed:{" "}
              {new Date().toLocaleString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      )}
    </CatalogPageShell>
  );
}
