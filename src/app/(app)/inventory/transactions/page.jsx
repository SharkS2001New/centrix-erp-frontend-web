"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  FilterSelect,
  PaginationBar,
  PrimaryLink,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { P } from "@/lib/permission-codes";
import {
  defaultDateRange,
  formatMovementDate,
  formatMovementDateTime,
  formatStockQty,
  InventoryPageShell,
  InventoryTableShell,
  movementLocationLabel,
  ProductCodeLink,
  transactionTypeLabel,
} from "@/components/inventory/inventory-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { STOCK_MOVEMENT_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "PURCHASE", label: "Purchase" },
  { value: "POS_SALE", label: "POS sale" },
  { value: "MOBILE_SALE", label: "Mobile sale" },
  { value: "BACKEND_SALE", label: "Backend sale" },
  { value: "DAMAGE", label: "Damage" },
  { value: "ADJUSTMENT", label: "Adjustment" },
  { value: "STOCK_TAKE", label: "Stock take" },
  { value: "TRANSFER", label: "Transfer" },
  { value: "RETURN", label: "Customer return" },
  { value: "SUPPLIER_RETURN", label: "Supplier return" },
];

function groupMovementsByProduct(rows) {
  const map = new Map();
  for (const row of rows) {
    let group = map.get(row.product_code);
    if (!group) {
      const product = row.product;
      group = {
        product_code: row.product_code,
        product_name: product?.product_name ?? row.product_code,
        unit_id: product?.unit_id,
        movements: [],
        netChange: 0,
        latestAt: row.created_at,
      };
      map.set(row.product_code, group);
    }
    group.movements.push(row);
    group.netChange += Number(row.quantity_change ?? 0);
    if (String(row.created_at) > String(group.latestAt)) {
      group.latestAt = row.created_at;
    }
  }

  for (const group of map.values()) {
    group.movements.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const types = new Set(group.movements.map((m) => m.transaction_type));
    group.typeSummary = [...types].map((t) => transactionTypeLabel(t)).join(", ");
  }

  return [...map.values()].sort(
    (a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime(),
  );
}

function netChangeClass(value) {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-red-700";
  return "text-slate-500";
}

export default function InventoryTransactionsPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [rows, setRows] = useState([]);
  const [totalMovements, setTotalMovements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [uoms, setUoms] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const initialRange = defaultDateRange(7);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "all");
  const referenceIdFilter = searchParams.get("reference_id") || "";
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [page, setPage] = useState(1);

  const loadReferenceData = useCallback(async () => {
    try {
      const [uomRes, userRes] = await Promise.all([
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
      ]);
      setUoms(uomRes.data ?? []);
      setUsers(userRes.data ?? []);
    } catch {
      /* non-blocking */
    }
  }, []);

  const loadMovements = useCallback(async () => {
    setError(null);
    setListLoading(true);
    try {
      const extra = {
        branch_id: branchId,
        from_date: fromDate,
        to_date: toDate,
      };
      if (typeFilter !== "all") extra.transaction_type = typeFilter;
      if (referenceIdFilter) extra.reference_id = referenceIdFilter;

      const searchParamsApi = buildPageParams({
        page,
        perPage: 48,
        q: debouncedSearch,
        extra,
      });
      const txnRes = await apiRequest("/reports/stock-movement", { searchParams: searchParamsApi });
      const parsed = parsePaginator(txnRes);
      setRows(parsed.items);
      setTotalMovements(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory movements");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [branchId, fromDate, toDate, typeFilter, referenceIdFilter, page, debouncedSearch]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, typeFilter, fromDate, toDate]);

  const uomByProduct = useMemo(() => {
    const uomById = new Map(uoms.map((u) => [u.id, u]));
    const map = new Map();
    for (const row of rows) {
      if (!map.has(row.product_code)) {
        map.set(row.product_code, uomById.get(row.product?.unit_id));
      }
    }
    return map;
  }, [rows, uoms]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const productGroups = useMemo(() => groupMovementsByProduct(rows), [rows]);

  useEffect(() => {
    setExpanded(new Set(productGroups.map((g) => g.product_code)));
  }, [page, productGroups]);

  function toggleProduct(code) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  return (
    <InventoryPageShell
      title="Inventory movements"
      subtitle="Stock changes grouped by product — expand to see each movement"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Inventory movements"
            filename="stock-movements"
            apiPath="/reports/stock-movement"
            columns={STOCK_MOVEMENT_EXPORT_COLUMNS}
            totalCount={totalMovements}
            getSearchParams={() => {
              const extra = {
                branch_id: branchId,
                from_date: fromDate,
                to_date: toDate,
              };
              if (typeFilter !== "all") extra.transaction_type = typeFilter;
              if (referenceIdFilter) extra.reference_id = referenceIdFilter;
              return {
                per_page: 200,
                ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
                ...extra,
              };
            }}
            disabled={loading || listLoading}
          />
          <PrimaryLink href="/inventory/transfers/new" permission={P.inventory.transfers.create}>
            Transfer stock
          </PrimaryLink>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="From">
          <input
            type="date"
            className={inputClassName()}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            className={inputClassName()}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </Field>
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product…"
          className="max-w-md"
        />
        <FilterSelect
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          options={TYPE_OPTIONS}
        />
        <p className="pb-2 text-xs text-slate-500">
          {productGroups.length} product{productGroups.length === 1 ? "" : "s"} on this page ·{" "}
          {totalMovements} movement{totalMovements === 1 ? "" : "s"} total
        </p>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <InventoryTableShell>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading movements…</p>
        ) : productGroups.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">No movements found.</p>
        ) : (
          <>
            <ul className={`divide-y divide-slate-200 ${listLoading ? "opacity-60" : ""}`}>
              {productGroups.map((group) => {
                const isOpen = expanded.has(group.product_code);
                const uom = uomByProduct.get(group.product_code);
                const netLabel = formatStockQty(Math.abs(group.netChange), uom);
                return (
                  <li key={group.product_code}>
                    <button
                      type="button"
                      onClick={() => toggleProduct(group.product_code)}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50"
                    >
                      <ChevronIcon open={isOpen} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium text-slate-900">{group.product_name}</span>
                          <ProductCodeLink code={group.product_code} />
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {group.movements.length} movement{group.movements.length === 1 ? "" : "s"} ·{" "}
                          {group.typeSummary} · last{" "}
                          {group.latestAt ? formatMovementDate(group.latestAt) : "—"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-medium tabular-nums ${netChangeClass(group.netChange)}`}
                      >
                        {group.netChange > 0 ? "+" : group.netChange < 0 ? "−" : ""}
                        {netLabel}
                        <span className="ml-1 text-xs font-normal text-slate-400">net</span>
                      </span>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-slate-100 bg-slate-50/50 px-4 pb-3">
                        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
                          <colgroup>
                            <col className="w-[22%]" />
                            <col className="w-[18%]" />
                            <col className="w-[22%]" />
                            <col className="w-[18%]" />
                            <col className="w-[20%]" />
                          </colgroup>
                          <thead>
                            <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              <th className="py-2 pr-3">Date</th>
                              <th className="py-2 pr-3">Location</th>
                              <th className="py-2 pr-3">Type</th>
                              <th className="py-2 pr-6 text-right">Quantity</th>
                              <th className="py-2 pl-4 text-right">User</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.movements.map((row) => {
                              const actor = userById.get(row.created_by);
                              const qty = Number(row.quantity_change ?? 0);
                              const qtyLabel = formatStockQty(Math.abs(qty), uom);
                              return (
                                <tr key={row.id} className="border-t border-slate-100 first:border-t-0">
                                  <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600">
                                    {formatMovementDateTime(row.created_at)}
                                  </td>
                                  <td className="py-2.5 pr-3 whitespace-nowrap text-slate-700">
                                    {movementLocationLabel(row)}
                                  </td>
                                  <td className="py-2.5 pr-3 text-slate-700">
                                    {transactionTypeLabel(row.transaction_type)}
                                  </td>
                                  <td
                                    className={`py-2.5 pr-6 text-right tabular-nums font-medium ${netChangeClass(qty)}`}
                                  >
                                    {qty > 0 ? "+" : qty < 0 ? "−" : ""}
                                    {qtyLabel}
                                  </td>
                                  <td className="py-2.5 pl-4 text-right text-slate-600">
                                    {actor?.full_name ?? actor?.username ?? "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <PaginationBar
              page={page}
              totalPages={totalPages}
              total={totalMovements}
              pageSize={48}
              onChange={setPage}
            />
          </>
        )}
      </InventoryTableShell>
    </InventoryPageShell>
  );
}

function ChevronIcon({ open }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`shrink-0 text-slate-400 transition ${open ? "rotate-90" : ""}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
