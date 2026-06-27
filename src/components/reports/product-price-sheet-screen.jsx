"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { fetchAllPaginated } from "@/lib/paginated-api";
import { mergeSalesSettings } from "@/lib/sales-settings";
import {
  buildPriceSheetRow,
  groupPriceSheetByCategory,
  priceSheetCellValue,
  priceSheetColumnVisibility,
} from "@/lib/product-price-sheet";
import { openPrintWindow } from "@/lib/open-print-window";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  PrimaryButton,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";

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
}) {
  const colCount =
    2 +
    (columns.retail ? 1 : 0) +
    (columns.dozens ? 1 : 0) +
    (columns.aboveDozens ? 1 : 0) +
    (columns.wholesale ? 1 : 0);

  const headCells = [
    "<th>Product Name</th>",
    "<th>Packaging</th>",
    columns.retail ? '<th class="num retail">Price (Retail)</th>' : "",
    columns.dozens ? '<th class="num dozens">Price (Dozens)</th>' : "",
    columns.aboveDozens ? '<th class="num above">Price (Above Dozens)</th>' : "",
    columns.wholesale ? '<th class="num wholesale">Price (Wholesale)</th>' : "",
  ].join("");

  const body = groups
    .map((group) => {
      const categoryRow = `<tr class="category"><td colspan="${colCount}">Category: ${escapeHtml(group.category)}</td></tr>`;
      const itemRows = group.items
        .map((row) => {
          const cells = [
            `<td>${escapeHtml(row.product_name)}</td>`,
            `<td>${escapeHtml(row.packaging)}</td>`,
            columns.retail
              ? `<td class="num retail">${escapeHtml(priceSheetCellValue(row.retail_price, row.sell_on_retail))}</td>`
              : "",
            columns.dozens
              ? `<td class="num dozens">${escapeHtml(
                  priceSheetCellValue(
                    row.dozens_price,
                    row.sell_on_retail && row.has_middle_pack,
                  ),
                )}</td>`
              : "",
            columns.aboveDozens
              ? `<td class="num above">${escapeHtml(
                  priceSheetCellValue(row.above_dozens_price, row.sell_on_retail),
                )}</td>`
              : "",
            columns.wholesale
              ? `<td class="num wholesale">${escapeHtml(priceSheetCellValue(row.wholesale_price))}</td>`
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
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 16px; color: #0f172a; font-size: 10px; }
    .title { text-align: center; font-size: 22px; font-weight: 800; color: #15803d; letter-spacing: 0.04em; margin: 0; }
    .subtitle { text-align: center; font-size: 11px; font-style: italic; margin: 4px 0 2px; }
    .effective { text-align: center; font-size: 10px; margin-bottom: 12px; }
    .org { text-align: center; font-size: 10px; color: #475569; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #1e3a5f; color: #fff; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; }
    thead th.num { text-align: right; }
    tbody td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tbody td.num { text-align: right; white-space: nowrap; font-weight: 600; }
    tr.category td { background: #dbeafe; color: #1e40af; font-weight: 700; text-transform: uppercase; font-size: 9px; padding: 6px 8px; }
    td.retail, th.retail { color: #185FA5; }
    td.dozens, th.dozens { color: #15803d; }
    td.above, th.above { color: #c2410c; }
    td.wholesale, th.wholesale { color: #991b1b; }
    .footer { margin-top: 10px; display: flex; justify-content: space-between; font-size: 9px; color: #64748b; }
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

export function ProductPriceSheetScreen() {
  const { capabilities, organization, user } = useAuth();
  const retailPricingEnabled = Boolean(
    mergeSalesSettings(capabilities?.module_settings).enable_retail_pricing,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [products, uomRes, retailRes, catRes, subRes] = await Promise.all([
        fetchAllPaginated(apiRequest, "/products", { perPage: 200 }),
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
            retailPricingEnabled,
          }),
        );

      setRows(built);
      setCategories(
        [...catById.values()].sort((a, b) =>
          String(a.category_name).localeCompare(String(b.category_name)),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load price sheet data");
    } finally {
      setLoading(false);
    }
  }, [retailPricingEnabled]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (categoryFilter !== "all" && row.category_name !== categoryFilter) return false;
      if (!q) return true;
      return (
        String(row.product_name).toLowerCase().includes(q) ||
        String(row.product_code).toLowerCase().includes(q)
      );
    });
  }, [rows, search, categoryFilter]);

  const groups = useMemo(
    () => groupPriceSheetByCategory(filteredRows),
    [filteredRows],
  );

  const columns = useMemo(
    () => priceSheetColumnVisibility(filteredRows, { retailPricingEnabled }),
    [filteredRows, retailPricingEnabled],
  );

  const effectiveDate = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const subtitle = retailPricingEnabled
    ? "Pricing in pieces, dozens, and cartons (grouped by category)"
    : "Wholesale pricing by packaging (retail pricing is disabled in sales settings)";

  function handlePrint() {
    const html = buildPriceSheetPrintHtml({
      groups,
      columns,
      organizationName: organization?.org_name ?? capabilities?.profile_label ?? "",
      subtitle,
      effectiveDate,
    });
    openPrintWindow(html, "width=1100,height=800");
  }

  return (
    <CatalogPageShell
      title="Product price sheet"
      subtitle="Computed from catalog unit prices, UOM packaging, and retail package tiers."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/reports"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
          <SearchInput value={search} onChange={setSearch} placeholder="Name or code…" />
        </Field>
        <Field label="Category">
          <FilterSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "all", label: "All categories" },
              ...categories.map((c) => ({
                value: c.category_name,
                label: c.category_name,
              })),
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
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading products and pricing tiers…</p>
      ) : !groups.length ? (
        <p className="text-sm text-slate-500">No products with a unit price to display.</p>
      ) : (
        <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-sky-50 px-5 py-4 text-center">
            <h2 className="text-xl font-extrabold tracking-wide text-emerald-800">
              PRODUCT PRICE SHEET
            </h2>
            <p className="mt-1 text-sm italic text-slate-600">{subtitle}</p>
            <p className="mt-1 text-xs text-slate-500">Effective date: {effectiveDate}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-[#1e3a5f] text-left text-xs font-semibold uppercase tracking-wide text-white">
                  <th className="px-3 py-2.5">Product name</th>
                  <th className="px-3 py-2.5">Packaging</th>
                  {columns.retail ? (
                    <th className="px-3 py-2.5 text-right text-sky-200">Price (Retail)</th>
                  ) : null}
                  {columns.dozens ? (
                    <th className="px-3 py-2.5 text-right text-emerald-200">Price (Dozens)</th>
                  ) : null}
                  {columns.aboveDozens ? (
                    <th className="px-3 py-2.5 text-right text-orange-200">Price (Above dozens)</th>
                  ) : null}
                  {columns.wholesale ? (
                    <th className="px-3 py-2.5 text-right text-red-200">Price (Wholesale)</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.category}>
                    <tr className="bg-sky-100/80">
                      <td
                        colSpan={
                          2 +
                          (columns.retail ? 1 : 0) +
                          (columns.dozens ? 1 : 0) +
                          (columns.aboveDozens ? 1 : 0) +
                          (columns.wholesale ? 1 : 0)
                        }
                        className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-[#1e40af]"
                      >
                        Category: {group.category}
                      </td>
                    </tr>
                    {group.items.map((row) => (
                      <tr key={row.product_code} className="border-t border-slate-100 hover:bg-slate-50/80">
                        <td className="px-3 py-2 font-medium text-slate-900">{row.product_name}</td>
                        <td className="px-3 py-2 text-slate-600">{row.packaging}</td>
                        {columns.retail ? (
                          <td className="px-3 py-2 text-right font-semibold text-[#185FA5]">
                            {priceSheetCellValue(row.retail_price, row.sell_on_retail)}
                          </td>
                        ) : null}
                        {columns.dozens ? (
                          <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                            {priceSheetCellValue(
                              row.dozens_price,
                              row.sell_on_retail && row.has_middle_pack,
                            )}
                          </td>
                        ) : null}
                        {columns.aboveDozens ? (
                          <td className="px-3 py-2 text-right font-semibold text-orange-700">
                            {priceSheetCellValue(row.above_dozens_price, row.sell_on_retail)}
                          </td>
                        ) : null}
                        {columns.wholesale ? (
                          <td className="px-3 py-2 text-right font-semibold text-red-800">
                            {priceSheetCellValue(row.wholesale_price)}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            <span>{filteredRows.length} product(s)</span>
            <span>Printed: {effectiveDate}</span>
          </div>
        </div>
      )}
    </CatalogPageShell>
  );
}
