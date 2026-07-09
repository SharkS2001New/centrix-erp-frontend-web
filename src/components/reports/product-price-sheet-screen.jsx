"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { fetchProductCatalogCached } from "@/lib/catalog-cache";
import { useAuth } from "@/contexts/auth-context";
import { mergeSalesSettings } from "@/lib/sales-settings";
import {
  buildPriceSheetRow,
  groupPriceSheetBySubcategory,
  priceSheetCellValue,
  priceSheetColumnVisibility,
  priceSheetPriceWithMargin,
} from "@/lib/product-price-sheet";
import { openPrintWindow } from "@/lib/open-print-window";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  SearchInput,
  TABLE_BODY_ROW_CLASS,
  TABLE_SECTION_ROW_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { HrSearchableSelect } from "@/components/hr/hr-searchable-select";
import {
  REPORT_FILTER_SEARCH_WRAPPER_CLASS,
  reportFilterSearchControlClass,
} from "@/components/reports/report-filter-search-select";

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
  subtitle,
  effectiveDate,
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
    .title { text-align: center; font-size: 22px; font-weight: 800; color: #4c5ba4; letter-spacing: 0.04em; margin: 0; }
    .subtitle { text-align: center; font-size: 11px; font-style: italic; margin: 4px 0 2px; color: #495057; }
    .effective { text-align: center; font-size: 10px; margin-bottom: 12px; color: #6c757d; }
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
  <p class="subtitle">${escapeHtml(subtitle)}</p>
  <p class="effective">Effective Date: ${escapeHtml(effectiveDate)}</p>
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
  const [subcategoryFilter, setSubcategoryFilter] = useState("all");
  const [rows, setRows] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [printColumns, setPrintColumns] = useState(DEFAULT_PRINT_COLUMNS);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [products, uomRes, retailRes, catRes, subRes] = await Promise.all([
        fetchProductCatalogCached(organization?.id, { status: "all" }),
        apiRequest("/uoms", { searchParams: { per_page: 300 } }),
        apiRequest("/retail-package-settings", { searchParams: { per_page: 500 } }),
        apiRequest("/categories", { searchParams: { per_page: 200 } }),
        apiRequest("/sub-categories", { searchParams: { per_page: 500 } }),
      ]);

      const uomById = new Map((uomRes.data ?? []).map((u) => [u.id, u]));
      const retailByCode = new Map(
        (retailRes.data ?? []).map((r) => [r.product_code, r]),
      );
      const catById = new Map((catRes.data ?? []).map((c) => [c.id, c]));
      const subById = new Map((subRes.data ?? []).map((s) => [s.id, s]));

      const subcategoryNameFor = (product) => {
        const sub = subById.get(product.subcategory_id);
        return sub?.subcategory_name ?? "Uncategorized";
      };

      const categoryNameFor = (product) => {
        const sub = subById.get(product.subcategory_id);
        if (!sub) return "Uncategorized";
        const cat = catById.get(sub.category_id);
        return cat?.category_name ?? sub.subcategory_name ?? "Uncategorized";
      };

      const built = (products ?? [])
        .filter((p) => Number(p.unit_price) > 0)
        .map((product) =>
          buildPriceSheetRow({
            product,
            uom: uomById.get(product.unit_id),
            retailPackage: retailByCode.get(product.product_code),
            categoryName: categoryNameFor(product),
            subcategoryName: subcategoryNameFor(product),
            retailPricingEnabled,
          }),
        );

      setRows(built);
      setSubcategories(
        [...subById.values()].sort((a, b) =>
          String(a.subcategory_name).localeCompare(String(b.subcategory_name)),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load price sheet data");
    } finally {
      setLoading(false);
    }
  }, [retailPricingEnabled, organization?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const subcategoryOptions = useMemo(
    () => [
      { value: "all", label: "All subcategories" },
      ...subcategories.map((subcategory) => ({
        value: subcategory.subcategory_name,
        label: subcategory.subcategory_name,
      })),
    ],
    [subcategories],
  );

  const filteredRows = useMemo(() => {
    const q = String(search ?? "").trim().toLowerCase();
    return rows.filter((row) => {
      if (subcategoryFilter !== "all" && row.subcategory_name !== subcategoryFilter) return false;
      if (!q) return true;
      return (
        String(row.product_name).toLowerCase().includes(q) ||
        String(row.product_code).toLowerCase().includes(q)
      );
    });
  }, [rows, search, subcategoryFilter]);

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

  const effectiveDate = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const subtitle = retailPricingEnabled
    ? "Pricing in pieces, dozens, and cartons with expected profit margins (grouped by subcategory)"
    : "Wholesale pricing and expected profit margins by packaging";

  function handlePrint() {
    const html = buildPriceSheetPrintHtml({
      groups,
      columns,
      organizationName: organization?.org_name ?? capabilities?.profile_label ?? "",
      subtitle,
      effectiveDate,
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

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Search products">
          <SearchInput
            className={REPORT_FILTER_SEARCH_WRAPPER_CLASS}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or code…"
          />
        </Field>
        <Field label="Subcategory">
          <div className={REPORT_FILTER_SEARCH_WRAPPER_CLASS}>
            <HrSearchableSelect
              value={subcategoryFilter}
              onChange={setSubcategoryFilter}
              options={subcategoryOptions}
              placeholder="All subcategories"
              inputClassName={reportFilterSearchControlClass(inputClassName())}
            />
          </div>
        </Field>
        <Field label="Prepared by">
          <input
            className={inputClassName()}
            readOnly
            value={user?.full_name ?? user?.username ?? "—"}
          />
        </Field>
      </div>

      <div className="mb-4 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Columns</p>
            <p className="text-xs text-slate-500">
              Product name is always included. These selections also apply when printing.
            </p>
          </div>
          <button
            type="button"
            className="text-xs font-medium text-[#185FA5] hover:underline"
            onClick={() => setPrintColumns(DEFAULT_PRINT_COLUMNS)}
          >
            Reset
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {PRINT_COLUMN_OPTIONS.map((option) => {
            const available =
              option.key === "unitCost"
                ? hasCostRows
                : option.key === "packaging"
                  ? true
                  : Boolean(availableColumns[option.key]);
            return (
              <label
                key={option.key}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  available
                    ? "border-slate-200 bg-white text-slate-700"
                    : "border-slate-100 bg-slate-50 text-slate-400"
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
                />
                {option.label}
              </label>
            );
          })}
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading products and pricing tiers…</p>
      ) : !groups.length ? (
        <p className="text-sm text-slate-500">No products with a unit price to display.</p>
      ) : (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          <div className="border-b border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-5 py-4 text-center">
            <h2 className="theme-heading text-xl font-extrabold tracking-wide uppercase">
              Product price list
            </h2>
            <p className="theme-subtext mt-1 text-sm italic">{subtitle}</p>
            {showMargins ? (
              <p className="theme-subtext mt-1 text-xs">
                Expected margin % = (full wholesale price − last cost) ÷ full wholesale price. Shown only on full price.
              </p>
            ) : null}
            <p className="theme-subtext mt-1 text-xs">Effective date: {effectiveDate}</p>
          </div>

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
            <span className="theme-subtext">Printed: {effectiveDate}</span>
          </div>
        </div>
      )}
    </CatalogPageShell>
  );
}
