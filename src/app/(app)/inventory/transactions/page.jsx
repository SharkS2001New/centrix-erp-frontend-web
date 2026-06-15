"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  FilterSelect,
  PaginationBar,
  PrimaryLink,
  SearchInput,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  defaultDateRange,
  formatMovementDate,
  formatMovementDateTime,
  formatStockQty,
  InventoryPageShell,
  InventoryTableShell,
  movementLocationLabel,
  ProductCodeLink,
  rowInDateRange,
  transactionTypeLabel,
} from "@/components/inventory/inventory-shared";

const PAGE_SIZE = 12;

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

function groupMovementsByProduct(rows, productByCode) {
  const map = new Map();
  for (const row of rows) {
    let group = map.get(row.product_code);
    if (!group) {
      const product = productByCode.get(row.product_code);
      group = {
        product_code: row.product_code,
        product_name: product?.product_name ?? row.product_code,
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
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const initialRange = defaultDateRange(7);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "all");
  const referenceIdFilter = searchParams.get("reference_id") || "";
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [txnRes, prodRes, uomRes, userRes] = await Promise.all([
        apiRequest("/reports/stock-movement", {
          searchParams: { branch_id: branchId, per_page: 300 },
        }),
        apiRequest("/products", { searchParams: { per_page: 500 } }),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }).catch(() => ({ data: [] })),
      ]);
      setRows(txnRes.data ?? []);
      setProducts(prodRes.data ?? []);
      setUoms(uomRes.data ?? []);
      setUsers(userRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inventory movements");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const uomByProduct = useMemo(() => {
    const uomById = new Map(uoms.map((u) => [u.id, u]));
    const map = new Map();
    for (const p of products) {
      map.set(p.product_code, uomById.get(p.unit_id));
    }
    return map;
  }, [products, uoms]);

  const productByCode = useMemo(
    () => new Map(products.map((p) => [p.product_code, p])),
    [products],
  );
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!rowInDateRange(row, fromDate, toDate, ["created_at"])) return false;
      if (typeFilter !== "all" && row.transaction_type !== typeFilter) return false;
      if (referenceIdFilter && String(row.reference_id ?? "") !== referenceIdFilter) return false;
      if (!q) return true;
      const product = productByCode.get(row.product_code);
      return (
        row.product_code?.toLowerCase().includes(q) ||
        product?.product_name?.toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter, fromDate, toDate, productByCode, referenceIdFilter]);

  const productGroups = useMemo(
    () => groupMovementsByProduct(filtered, productByCode),
    [filtered, productByCode],
  );

  const totalMovements = filtered.length;
  const totalPages = Math.max(1, Math.ceil(productGroups.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = productGroups.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, fromDate, toDate]);

  useEffect(() => {
    setExpanded(new Set(pageSlice.map((g) => g.product_code)));
  }, [safePage, productGroups]);

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
      action={<PrimaryLink href="/inventory/transfers/new">Transfer stock</PrimaryLink>}
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
          {productGroups.length} product{productGroups.length === 1 ? "" : "s"} ·{" "}
          {totalMovements} movement{totalMovements === 1 ? "" : "s"}
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
        ) : pageSlice.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">No movements found.</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-200">
              {pageSlice.map((group) => {
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
              page={safePage}
              totalPages={totalPages}
              total={productGroups.length}
              pageSize={PAGE_SIZE}
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
