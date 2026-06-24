/** @typedef {{ key: string, label: string, accessor: (row: object) => unknown, align?: 'left'|'right', badge?: (row: object) => { label: string, tone: string } | null, total?: boolean }} ReportColumn */

/** @typedef {{ id: string, label: string, compute: (rows: object[]) => { value: string, hint?: string, tone?: string } }} ReportKpi */

/**
 * @param {object} def
 * @returns {object}
 */
export function getReportDefinition(key, def) {
  return { key, ...def };
}

export const FEATURED_REPORT_KEYS = [
  "daily-sales",
  "stock-on-hand",
  "profit-loss",
  "top-debtors",
  "stock-movement",
  "vat-collected",
  "till-sessions",
  "expenses",
];

export const REPORT_DEFINITIONS = {
  "daily-sales": {
    title: "Daily Sales Report",
    subtitle: "Daily sales summary by branch and channel",
    section: "Sales",
    apiPath: "/reports/daily-sales",
    dateColumn: "sale_day",
    showDateRange: true,
    extraFilters: [
      {
        id: "include_legacy_archive",
        type: "checkbox",
        label: "Include legacy archive (requires date range)",
      },
    ],
    /** @type {ReportColumn[]} */
    columns: [
      { key: "sale_day", label: "Date", accessor: (r) => r.sale_day },
      {
        key: "source",
        label: "Source",
        accessor: () => null,
        badge: (r) =>
          r.legacy_archive
            ? { label: "Legacy archive", tone: "warning" }
            : { label: "Centrix", tone: "neutral" },
      },
      { key: "branch_name", label: "Branch", accessor: (r) => r.branch_name },
      { key: "channel", label: "Channel", accessor: (r) => r.channel },
      { key: "orders", label: "Transactions", accessor: (r) => r.orders, align: "right", total: true },
      { key: "gross", label: "Gross Sales", accessor: (r) => r.gross, align: "right", total: true },
      { key: "vat", label: "VAT", accessor: (r) => r.vat, align: "right", total: true },
      { key: "net", label: "Net Sales", accessor: (r) => r.net, align: "right", total: true },
    ],
    /** @type {ReportKpi[]} */
    kpis: [
      {
        id: "transactions",
        label: "Transactions",
        compute: (rows) => ({ value: String(Math.round(sum(rows, "orders"))) }),
      },
      {
        id: "gross",
        label: "Total Sales",
        compute: (rows) => ({ value: kes(sum(rows, "gross")) }),
      },
      {
        id: "vat",
        label: "Total VAT",
        compute: (rows) => ({ value: kes(sum(rows, "vat")) }),
      },
      {
        id: "net",
        label: "Net Sales",
        compute: (rows) => ({ value: kes(sum(rows, "net")) }),
      },
      {
        id: "avg",
        label: "Average Order",
        compute: (rows) => {
          const orders = sum(rows, "orders");
          const gross = sum(rows, "gross");
          return { value: orders > 0 ? kes(gross / orders) : "—" };
        },
      },
    ],
    footerTotals: ["orders", "gross", "vat", "net"],
    charts: [{ type: "bar", title: "Daily gross sales", labelKey: "sale_day", valueKey: "gross" }],
  },

  "stock-on-hand": {
    title: "Stock On Hand Report",
    subtitle: "Current inventory levels and valuation",
    section: "Inventory",
    apiPath: "/reports/stock-on-hand",
    dateColumn: null,
    showDateRange: false,
    extraFilters: [{ id: "lowStockOnly", label: "Low stock only", type: "checkbox" }],
    columns: [
      { key: "product_code", label: "Product Code", accessor: (r) => r.product_code },
      { key: "product_name", label: "Product Name", accessor: (r) => r.product_name },
      { key: "total_base_units", label: "On Hand Qty", accessor: (r) => r.total_base_units, align: "right", total: true },
      { key: "uom_name", label: "UOM", accessor: (r) => r.uom_name },
      { key: "wholesale_price", label: "Unit Price", accessor: (r) => r.wholesale_price, align: "right" },
      {
        key: "status",
        label: "Status",
        accessor: (r) => stockStatus(r).label,
        badge: (r) => stockStatus(r),
      },
    ],
    kpis: [
      {
        id: "products",
        label: "Total Products",
        compute: (rows) => ({ value: String(rows.length) }),
      },
      {
        id: "qty",
        label: "Total Quantity",
        compute: (rows) => ({ value: formatQty(sum(rows, "total_base_units")) }),
      },
      {
        id: "low",
        label: "Low Stock Items",
        compute: (rows) => ({
          value: String(
            rows.filter((r) => {
              const qty = Number(r.total_base_units) || 0;
              if (qty <= 0) return true;
              return r.product_alert === "REORDER";
            }).length,
          ),
          tone: "warning",
        }),
      },
      {
        id: "out",
        label: "Out of Stock",
        compute: (rows) => ({
          value: String(rows.filter((r) => Number(r.total_base_units) <= 0).length),
          tone: "danger",
        }),
      },
    ],
    filterRows: (rows, filters) => {
      if (!filters.lowStockOnly) return rows;
      return rows.filter((r) => {
        const qty = Number(r.total_base_units) || 0;
        return qty <= 0 || r.product_alert === "REORDER";
      });
    },
  },

  "low-stock": {
    title: "Low Stock / Reorder Report",
    subtitle: "Products at or below reorder point, including out of stock",
    section: "Inventory",
    apiPath: "/reports/low-stock",
    dateColumn: null,
    showDateRange: false,
    columns: [
      { key: "product_code", label: "Product Code", accessor: (r) => r.product_code },
      { key: "product_name", label: "Product Name", accessor: (r) => r.product_name },
      {
        key: "total_base_units",
        label: "On Hand Qty",
        accessor: (r) => r.total_base_units ?? r.total_quantity,
        align: "right",
        total: true,
      },
      {
        key: "reorder_point",
        label: "Reorder Point",
        accessor: (r) => r.reorder_point,
        align: "right",
      },
      {
        key: "status",
        label: "Status",
        accessor: (r) => stockStatus(r).label,
        badge: (r) => stockStatus(r),
      },
    ],
    kpis: [
      {
        id: "items",
        label: "Alert items",
        compute: (rows) => ({ value: String(rows.length), tone: "warning" }),
      },
      {
        id: "out",
        label: "Out of stock",
        compute: (rows) => ({
          value: String(rows.filter((r) => Number(r.total_base_units ?? r.total_quantity) <= 0).length),
          tone: "danger",
        }),
      },
      {
        id: "low",
        label: "Below reorder",
        compute: (rows) => ({
          value: String(
            rows.filter((r) => {
              const qty = Number(r.total_base_units ?? r.total_quantity) || 0;
              return qty > 0 && Number(r.reorder_point) > 0 && qty <= Number(r.reorder_point);
            }).length,
          ),
          tone: "warning",
        }),
      },
    ],
    footerTotals: ["total_base_units"],
  },

  "profit-loss": {
    title: "Profit & Loss Report",
    subtitle: "Operational revenue, COGS, and expenses",
    section: "Finance",
    apiPath: "/reports/profit-loss",
    dateColumn: "period",
    showDateRange: true,
    variant: "profit-loss",
  },

  "top-debtors": {
    title: "Top Debtors Report",
    subtitle: "Customers with outstanding balances",
    section: "Finance",
    apiPath: "/reports/top-debtors",
    dateColumn: null,
    showDateRange: false,
    columns: [
      { key: "customer_num", label: "Customer Code", accessor: (r) => r.customer_num },
      { key: "customer_name", label: "Customer Name", accessor: (r) => r.customer_name },
      { key: "route_name", label: "Route", accessor: (r) => r.route_name },
      { key: "current_balance", label: "Outstanding", accessor: (r) => r.current_balance, align: "right", total: true },
      { key: "open_invoices", label: "Open Invoices", accessor: (r) => r.open_invoices, align: "right", total: true },
      { key: "invoice_balance", label: "Invoice Balance", accessor: (r) => r.invoice_balance, align: "right", total: true },
    ],
    kpis: [
      {
        id: "debtors",
        label: "Debtors",
        compute: (rows) => ({ value: String(rows.length) }),
      },
      {
        id: "outstanding",
        label: "Total Outstanding",
        compute: (rows) => ({ value: kes(sum(rows, "current_balance")) }),
      },
    ],
    footerTotals: ["current_balance", "open_invoices", "invoice_balance"],
  },

  "stock-movement": {
    title: "Stock Movement Report",
    subtitle: "Inventory ledger transactions",
    section: "Inventory",
    apiPath: "/reports/stock-movement",
    dateColumn: "created_at",
    showDateRange: true,
    columns: [
      { key: "created_at", label: "Date", accessor: (r) => r.created_at },
      { key: "reference", label: "Reference", accessor: (r) => `${r.reference_type ?? "—"} #${r.reference_id ?? "—"}` },
      { key: "transaction_type", label: "Type", accessor: (r) => r.transaction_type },
      { key: "product_code", label: "Product", accessor: (r) => r.product_code },
      { key: "stock_location", label: "Location", accessor: (r) => r.stock_location },
      {
        key: "in_qty",
        label: "In Qty",
        accessor: (r) => (Number(r.quantity_change) > 0 ? r.quantity_change : null),
        align: "right",
      },
      {
        key: "out_qty",
        label: "Out Qty",
        accessor: (r) => (Number(r.quantity_change) < 0 ? Math.abs(Number(r.quantity_change)) : null),
        align: "right",
      },
      { key: "quantity_after", label: "Balance Qty", accessor: (r) => r.quantity_after, align: "right" },
      { key: "unit_cost", label: "Unit Cost", accessor: (r) => r.unit_cost, align: "right" },
    ],
    kpis: [
      {
        id: "inward",
        label: "Total Inward Qty",
        compute: (rows) => ({
          value: formatQty(rows.reduce((s, r) => s + Math.max(0, Number(r.quantity_change) || 0), 0)),
        }),
      },
      {
        id: "outward",
        label: "Total Outward Qty",
        compute: (rows) => ({
          value: formatQty(rows.reduce((s, r) => s + Math.max(0, -(Number(r.quantity_change) || 0)), 0)),
        }),
      },
    ],
  },

  "vat-collected": {
    title: "VAT Collected Report",
    subtitle: "VAT collected on completed sales",
    section: "Finance",
    apiPath: "/reports/vat-collected",
    dateColumn: "sale_date",
    showDateRange: true,
    columns: [
      { key: "sale_date", label: "Date", accessor: (r) => r.sale_date },
      { key: "branch_name", label: "Branch", accessor: (r) => r.branch_name },
      { key: "channel", label: "Channel", accessor: (r) => r.channel },
      { key: "orders", label: "Orders", accessor: (r) => r.orders, align: "right", total: true },
      { key: "gross_sales", label: "Taxable Sales", accessor: (r) => r.gross_sales, align: "right", total: true },
      { key: "vat_collected", label: "VAT Collected", accessor: (r) => r.vat_collected, align: "right", total: true },
    ],
    kpis: [
      {
        id: "vat",
        label: "Total VAT Collected",
        compute: (rows) => ({ value: kes(sum(rows, "vat_collected")) }),
      },
      {
        id: "taxable",
        label: "Taxable Sales",
        compute: (rows) => ({ value: kes(sum(rows, "gross_sales")) }),
      },
    ],
    footerTotals: ["orders", "gross_sales", "vat_collected"],
  },

  "till-sessions": {
    title: "Till Sessions Report",
    subtitle: "Float sessions, sales, and cash variance",
    section: "Operations",
    apiPath: "/reports/till-sessions",
    dateColumn: "session_date",
    showDateRange: true,
    columns: [
      { key: "till_number", label: "Till No", accessor: (r) => r.till_number },
      { key: "cashier", label: "Cashier", accessor: (r) => r.cashier },
      { key: "session_date", label: "Date", accessor: (r) => r.session_date },
      { key: "opening_float", label: "Opening Float", accessor: (r) => r.opening_float, align: "right" },
      { key: "gross_sales", label: "Sales", accessor: (r) => r.gross_sales, align: "right", total: true },
      { key: "expected_amount", label: "Expected Cash", accessor: (r) => r.expected_amount, align: "right" },
      { key: "closing_amount", label: "Actual Cash", accessor: (r) => r.closing_amount, align: "right" },
      {
        key: "variance",
        label: "Variance",
        accessor: (r) => tillVariance(r),
        align: "right",
      },
      {
        key: "status",
        label: "Status",
        accessor: (r) => r.status,
        badge: (r) => tillStatusBadge(r.status),
      },
    ],
    kpis: [
      {
        id: "sessions",
        label: "Sessions",
        compute: (rows) => ({ value: String(rows.length) }),
      },
      {
        id: "sales",
        label: "Total Sales",
        compute: (rows) => ({ value: kes(sum(rows, "gross_sales")) }),
      },
    ],
  },

  expenses: {
    title: "Expenses Report",
    subtitle: "Expenses by group and date",
    section: "Finance",
    apiPath: "/reports/expenses",
    dateColumn: "expense_date",
    showDateRange: true,
    variant: "expenses",
    columns: [
      { key: "expense_date", label: "Date", accessor: (r) => r.expense_date },
      { key: "branch_name", label: "Branch", accessor: (r) => r.branch_name },
      { key: "group_name", label: "Category", accessor: (r) => r.group_name },
      { key: "expense_count", label: "Count", accessor: (r) => r.expense_count, align: "right", total: true },
      { key: "total_amount", label: "Amount", accessor: (r) => r.total_amount, align: "right", total: true },
    ],
    kpis: [
      {
        id: "total",
        label: "Total Expenses",
        compute: (rows) => ({ value: kes(sum(rows, "total_amount")) }),
      },
      {
        id: "groups",
        label: "Categories",
        compute: (rows) => ({ value: String(new Set(rows.map((r) => r.group_name)).size) }),
      },
    ],
    footerTotals: ["expense_count", "total_amount"],
  },
};

function sum(rows, field) {
  return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

function kes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `KES ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatQty(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function stockStatus(row) {
  const qty = Number(row.total_base_units) || 0;
  if (qty <= 0) return { label: "Out of Stock", tone: "danger" };
  if (row.product_alert === "REORDER") return { label: "Low Stock", tone: "warning" };
  return { label: "In Stock", tone: "success" };
}

function tillVariance(row) {
  const expected = Number(row.expected_amount);
  const actual = Number(row.closing_amount);
  if (Number.isNaN(expected) || Number.isNaN(actual)) return null;
  return actual - expected;
}

function tillStatusBadge(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "closed") return { label: "Closed", tone: "success" };
  if (normalized === "open") return { label: "Open", tone: "primary" };
  return { label: status ?? "—", tone: "neutral" };
}
