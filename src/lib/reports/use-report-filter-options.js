import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import {
  INVENTORY_LOCATION_OPTIONS,
  INVENTORY_TXN_TYPE_OPTIONS,
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  REPORT_EXTRA_FILTERS,
  SALES_CHANNEL_OPTIONS,
  STOCK_LOCATION_FILTER_OPTIONS,
} from "@/lib/reports/report-filter-config";

function mapSelectOptions(rows, valueKey, labelKey) {
  return [
    { value: "", label: "All" },
    ...rows.map((row) => ({
      value: String(row[valueKey] ?? ""),
      label: String(row[labelKey] ?? row[valueKey] ?? ""),
    })),
  ];
}

/**
 * @param {string | undefined} reportKey
 */
export function useReportFilterOptions(reportKey) {
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cashiers, setCashiers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);

  const needed = useMemo(() => {
    const keys = new Set();
    for (const filter of REPORT_EXTRA_FILTERS[reportKey] ?? []) {
      if (filter.optionsKey) keys.add(filter.optionsKey);
    }
    return keys;
  }, [reportKey]);

  useEffect(() => {
    if (!reportKey || needed.size === 0) return;

    const loaders = [];

    if (needed.has("categories")) {
      loaders.push(
        apiRequest("/categories", { searchParams: { per_page: 200 } })
          .then((res) => setCategories(res.data ?? []))
          .catch(() => setCategories([])),
      );
    }
    if (needed.has("subcategories")) {
      loaders.push(
        apiRequest("/sub-categories", { searchParams: { per_page: 300 } })
          .then((res) => setSubcategories(res.data ?? []))
          .catch(() => setSubcategories([])),
      );
    }
    if (needed.has("products")) {
      loaders.push(
        apiRequest("/products", { searchParams: { per_page: 200 } })
          .then((res) => setProducts(res.data ?? []))
          .catch(() => setProducts([])),
      );
    }
    if (needed.has("suppliers")) {
      loaders.push(
        apiRequest("/suppliers", { searchParams: { per_page: 200 } })
          .then((res) => setSuppliers(res.data ?? []))
          .catch(() => setSuppliers([])),
      );
    }
    if (needed.has("customers")) {
      loaders.push(
        apiRequest("/customers", { searchParams: { per_page: 200 } })
          .then((res) => setCustomers(res.data ?? []))
          .catch(() => setCustomers([])),
      );
    }
    if (needed.has("cashiers")) {
      loaders.push(
        apiRequest("/users", { searchParams: { per_page: 200 } })
          .then((res) => setCashiers(res.data ?? []))
          .catch(() => setCashiers([])),
      );
    }
    if (needed.has("routes")) {
      loaders.push(
        apiRequest("/routes", { searchParams: { per_page: 200 } })
          .then((res) => setRoutes(res.data ?? []))
          .catch(() => setRoutes([])),
      );
    }
    if (needed.has("paymentMethods")) {
      loaders.push(
        apiRequest("/payment-methods", { searchParams: { per_page: 100 } })
          .then((res) => setPaymentMethods(res.data ?? []))
          .catch(() => setPaymentMethods([])),
      );
    }

    void Promise.all(loaders);
  }, [reportKey, needed]);

  const optionsByKey = useMemo(
    () => ({
      channels: SALES_CHANNEL_OPTIONS,
      paymentStatuses: PAYMENT_STATUS_OPTIONS,
      orderStatuses: ORDER_STATUS_OPTIONS,
      stockLocations: STOCK_LOCATION_FILTER_OPTIONS,
      inventoryLocations: INVENTORY_LOCATION_OPTIONS,
      transactionTypes: INVENTORY_TXN_TYPE_OPTIONS,
      categories: mapSelectOptions(categories, "id", "category_name"),
      subcategories: mapSelectOptions(subcategories, "id", "subcategory_name"),
      products: [
        { value: "", label: "All products" },
        ...products.map((p) => ({
          value: p.product_code,
          label: `${p.product_name ?? p.product_code} (${p.product_code})`,
        })),
      ],
      suppliers: mapSelectOptions(suppliers, "id", "supplier_name"),
      customers: [
        { value: "", label: "All customers" },
        ...customers.map((c) => ({
          value: String(c.customer_num ?? ""),
          label: `${c.customer_name ?? c.customer_num} (#${c.customer_num})`,
        })),
      ],
      cashiers: [
        { value: "", label: "All cashiers" },
        ...cashiers.map((u) => ({
          value: String(u.id),
          label: u.full_name ?? u.username ?? `User #${u.id}`,
        })),
      ],
      routes: [
        { value: "", label: "All routes" },
        ...routes.map((r) => ({
          value: r.route_name ?? String(r.id),
          label: r.route_name ?? `Route #${r.id}`,
        })),
      ],
      paymentMethods: [
        { value: "", label: "All methods" },
        ...paymentMethods.map((m) => ({
          value: m.method_code ?? String(m.id),
          label: m.method_name ?? m.method_code,
        })),
      ],
    }),
    [categories, subcategories, products, suppliers, customers, cashiers, routes, paymentMethods],
  );

  return optionsByKey;
}
