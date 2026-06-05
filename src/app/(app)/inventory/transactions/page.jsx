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
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  defaultDateRange,
  formatStockQty,
  InventoryPageShell,
  InventoryTableShell,
  ProductCodeLink,
  rowInDateRange,
  transactionTypeLabel,
} from "@/components/inventory/inventory-shared";

const PAGE_SIZE = 20;

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
];

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

  const initialRange = defaultDateRange(7);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(searchParams.get("type") || "all");
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
      if (!q) return true;
      const product = productByCode.get(row.product_code);
      return (
        row.product_code?.toLowerCase().includes(q) ||
        product?.product_name?.toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter, fromDate, toDate, productByCode]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, fromDate, toDate]);

  return (
    <InventoryPageShell
      title="Inventory movements"
      subtitle="History of purchases, sales, adjustments, and other stock changes"
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
          {filtered.length} movement{filtered.length === 1 ? "" : "s"} in range
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
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium text-right">Quantity</th>
                    <th className="px-4 py-3 font-medium">User</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No movements found.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((row) => {
                      const product = productByCode.get(row.product_code);
                      const actor = userById.get(row.created_by);
                      const qty = Number(row.quantity_change ?? 0);
                      const qtyLabel = formatStockQty(Math.abs(qty), uomByProduct.get(row.product_code));
                      return (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-600">
                            {row.created_at
                              ? formatShortDate(String(row.created_at).slice(0, 10))
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-900">
                              {product?.product_name ?? row.product_code}
                            </span>
                            <div className="mt-0.5">
                              <ProductCodeLink code={row.product_code} />
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {transactionTypeLabel(row.transaction_type)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums font-medium ${
                              qty > 0 ? "text-emerald-700" : qty < 0 ? "text-red-700" : "text-slate-600"
                            }`}
                          >
                            {qty > 0 ? "+" : qty < 0 ? "−" : ""}
                            {qtyLabel}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {actor?.full_name ?? actor?.username ?? "—"}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </InventoryTableShell>
    </InventoryPageShell>
  );
}
