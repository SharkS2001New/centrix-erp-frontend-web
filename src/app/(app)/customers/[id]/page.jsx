"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { formatShortDate } from "@/components/catalog/catalog-shared";
import { CustomerLocationSection } from "@/components/customers/customer-location-section";
import {
  customerInitials,
  formatCustomerKes,
} from "@/components/customers/customer-form";
import { CustomerShopImageDisplay } from "@/components/customers/customer-shop-image-display";
import { hasValidCustomerLocation } from "@/lib/customer-location";
import {
  indexProductsByCode,
  saleLineProductLabel,
} from "@/lib/sale-line-items";
import { orderSourceLabel } from "@/lib/sales";

export default function CustomerDetailPage() {
  const params = useParams();
  const customerNum = params.id;

  const [customer, setCustomer] = useState(null);
  const [branchName, setBranchName] = useState(null);
  const [routeName, setRouteName] = useState(null);
  const [productByCode, setProductByCode] = useState({});
  const [orders, setOrders] = useState([]);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderItemsById, setOrderItemsById] = useState({});
  const [itemsLoadingId, setItemsLoadingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [cust, salesRes, productsRes] = await Promise.all([
        apiRequest(`/customers/${customerNum}`),
        apiRequest(`/customers/${customerNum}/sales`, { searchParams: { per_page: 20 } }),
        apiRequest("/products", { searchParams: { per_page: 500 } }).catch(() => ({ data: [] })),
      ]);
      setCustomer(cust);
      setProductByCode(indexProductsByCode(productsRes.data ?? []));

      if (cust.branch_id) {
        try {
          const branch = await apiRequest(`/branches/${cust.branch_id}`);
          setBranchName(branch.branch_name ?? null);
        } catch {
          setBranchName(null);
        }
      } else {
        setBranchName(null);
      }

      if (cust.route_id) {
        try {
          const route = await apiRequest(`/routes/${cust.route_id}`);
          setRouteName(route.route_name ?? null);
        } catch {
          setRouteName(null);
        }
      } else {
        setRouteName(null);
      }

      setOrders(salesRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customer");
    } finally {
      setLoading(false);
    }
  }, [customerNum]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isActive = useMemo(() => customer && !customer.deleted_at, [customer]);

  async function toggleOrderItems(order) {
    const orderId = order.id;
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }

    setExpandedOrderId(orderId);

    if (order.items?.length || orderItemsById[orderId]) return;

    setItemsLoadingId(orderId);
    try {
      const sale = await apiRequest(`/sales/${orderId}`);
      setOrderItemsById((prev) => ({
        ...prev,
        [orderId]: sale.items ?? [],
      }));
    } catch {
      setOrderItemsById((prev) => ({ ...prev, [orderId]: [] }));
    } finally {
      setItemsLoadingId(null);
    }
  }

  return (
    <div className="theme-workspace min-h-full">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/customers"
            className="text-sm text-[#185FA5] hover:text-[#144f8a]"
          >
            ← Back to customers
          </Link>
          <h1 className="mt-2 text-xl font-medium text-slate-900">Customer Profile</h1>
        </div>
        {customer && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/accounting/customer-invoices?customer=${customer.customer_num}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Invoices
            </Link>
            <Link
              href={`/reports/customer-statement?customer=${customer.customer_num}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#185FA5] px-4 py-2 text-sm font-medium text-[#185FA5] hover:bg-[#E6F1FB]"
            >
              Customer Statement
            </Link>
            <Link
              href={`/customers/${customer.customer_num}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
            >
              <PencilIcon />
              Edit customer
            </Link>
          </div>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading customer…</p>
      ) : customer ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(480px,42%)_minmax(0,1fr)] xl:grid-cols-[minmax(560px,45%)_minmax(0,1fr)]">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
            <div className="flex flex-col items-center text-center">
              {customer.shop_image || customer.shop_image_url ? (
                <div className="h-28 w-28 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
                  <CustomerShopImageDisplay
                    customerNum={customer.customer_num}
                    imageUrl={customer.shop_image_url ?? customer.shop_image}
                    alt={`${customer.customer_name} shop`}
                    className="h-28 w-28 object-cover"
                  />
                </div>
              ) : (
                <CustomerAvatar name={customer.customer_name} large />
              )}
              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                {customer.customer_name}
              </h2>
              <p className="mt-0.5 font-mono text-xs text-slate-500">
                #{customer.customer_num}
              </p>
              <CustomerTypeBadge type={customer.customer_type} />
            </div>

            <dl className="mt-6 space-y-3 border-t border-slate-200 pt-5 text-sm">
              <ProfileRow label="Branch" value={branchName || "—"} />
              <ProfileRow label="Phone" value={customer.phone_number || "—"} />
              <ProfileRow label="Alt. phone" value={customer.additional_phone || "—"} />
              <ProfileRow label="Town" value={customer.town || "—"} />
              <ProfileRow
                label="Route"
                value={customer.customer_type === "route" ? routeName || "—" : "—"}
              />
              <ProfileRow label="Credit limit" value={formatCustomerKes(customer.credit_limit)} />
              <ProfileRow
                label="Balance"
                value={formatCustomerKes(customer.current_balance)}
                highlight={Number(customer.current_balance ?? 0) > 0}
              />
              <ProfileRow label="Payment terms" value={customer.terms_of_payment || "—"} />
              <ProfileRow label="KRA PIN" value={customer.kra_pin || "—"} />
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <StatusBadge active={isActive} />
                </dd>
              </div>
            </dl>

            {hasValidCustomerLocation(customer.latitude, customer.longitude) ? (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <CustomerLocationSection
                  latitude={customer.latitude}
                  longitude={customer.longitude}
                  onChange={() => {}}
                  readOnly
                  mapModalTitle={customer.customer_name}
                  mapModalSubtitle={`Customer #${customer.customer_num}`}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h3 className="text-[15px] font-medium text-slate-900">Recent orders</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Expand an order to view line items
              </p>
            </div>
            {orders.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                No orders yet for this customer.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const orderId = order.id;
                  const isExpanded = expandedOrderId === orderId;
                  const itemCount = order.items?.length ?? orderItemsById[orderId]?.length ?? 0;
                  const items = order.items ?? orderItemsById[orderId] ?? [];
                  const itemsLoading = itemsLoadingId === orderId;

                  return (
                    <li key={orderId ?? order.order_num}>
                      <button
                        type="button"
                        onClick={() => toggleOrderItems(order)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-slate-50"
                        aria-expanded={isExpanded}
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <ChevronIcon expanded={isExpanded} />
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900">
                              Order #{order.order_num}
                            </p>
                            <p className="text-xs text-slate-500">
                              <span className="capitalize">
                                {order.status?.replace(/_/g, " ") ?? "—"}
                              </span>
                              {order.payment_status ? (
                                <>
                                  {" · "}
                                  <span className="capitalize">
                                    {order.payment_status.replace(/_/g, " ")}
                                  </span>
                                </>
                              ) : null}
                              {order.order_source || order.channel ? (
                                <>
                                  {" · "}
                                  <span>{orderSourceLabel(order.order_source, order.channel)}</span>
                                </>
                              ) : null}
                              {" · "}
                              {formatShortDate(order.completed_at ?? order.created_at)}
                              {itemCount > 0
                                ? ` · ${itemCount} item${itemCount === 1 ? "" : "s"}`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <p className="shrink-0 font-medium text-slate-800">
                          {formatCustomerKes(order.order_total)}
                        </p>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-3">
                          {itemsLoading ? (
                            <p className="py-2 text-xs text-slate-500">Loading items…</p>
                          ) : items.length === 0 ? (
                            <p className="py-2 text-xs text-slate-500">No line items.</p>
                          ) : (
                            <ul className="space-y-2">
                              {items.map((line) => {
                                const label = saleLineProductLabel(line, productByCode);
                                const showCode =
                                  line.product_code && label !== line.product_code;
                                return (
                                  <li
                                    key={line.id ?? `${line.line_no}-${line.product_code}`}
                                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate font-medium text-slate-900">
                                        {label}
                                      </p>
                                      {showCode ? (
                                        <p className="font-mono text-xs text-slate-500">
                                          {line.product_code}
                                        </p>
                                      ) : null}
                                      <p className="text-xs text-slate-500">
                                        {line.quantity}
                                        {line.uom ? ` ${line.uom}` : ""} ×{" "}
                                        {formatCustomerKes(line.selling_price)}
                                      </p>
                                    </div>
                                    <p className="shrink-0 font-medium text-slate-900">
                                      {formatCustomerKes(line.amount)}
                                    </p>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CustomerAvatar({ name, large = false }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-[#E6F1FB] font-semibold text-[#0C447C] ${
        large ? "h-28 w-28 text-2xl" : "h-20 w-20 text-xl"
      }`}
    >
      {customerInitials(name)}
    </div>
  );
}

function ProfileRow({ label, value, highlight = false }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd
        className={`text-right ${highlight ? "font-medium text-amber-700" : "text-slate-800"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function CustomerTypeBadge({ type }) {
  const styles =
    type === "route"
      ? "bg-[#EEEDFE] text-[#3C3489]"
      : type === "regular"
        ? "bg-emerald-50 text-emerald-800"
        : "bg-[#E6F1FB] text-[#0C447C]";
  const label =
    type === "route" ? "Route" : type === "regular" ? "Regular" : type === "debtor" ? "Debtor" : type || "Debtor";

  return (
    <span
      className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${styles}`}
    >
      {label}
    </span>
  );
}

function StatusBadge({ active }) {
  return active ? (
    <span className="inline-flex rounded-full bg-[#EAF3DE] px-2.5 py-0.5 text-[11px] font-medium text-[#27500A]">
      Active
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-[#FCEBEB] px-2.5 py-0.5 text-[11px] font-medium text-[#791F1F]">
      Deleted
    </span>
  );
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function ChevronIcon({ expanded }) {
  return (
    <svg
      className={`mt-0.5 shrink-0 text-slate-400 transition ${expanded ? "rotate-90" : ""}`}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
