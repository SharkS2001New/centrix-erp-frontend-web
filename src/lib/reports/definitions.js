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
  "items-currently-in-stock",
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

  "sales-by-product": {
    title: "Sales by Product",
    subtitle: "Revenue and VAT by product",
    section: "Sales",
    apiPath: "/reports/sales-by-product",
    dateColumn: "sale_date",
    showDateRange: true,
    columns: [
      { key: "sale_date", label: "Date", accessor: (r) => r.sale_date },
      { key: "product_name", label: "Product", accessor: (r) => r.product_name, link: "product" },
      { key: "channel", label: "Channel", accessor: (r) => r.channel },
      { key: "qty_sold", label: "Qty Sold", accessor: (r) => r.qty_sold, align: "right", total: true },
      {
        key: "net_ex_vat",
        label: "Net (ex VAT)",
        accessor: (r) => netExVatAmount(r, "total_revenue", "total_vat"),
        align: "right",
        total: true,
      },
      { key: "total_vat", label: "VAT", accessor: (r) => r.total_vat, align: "right", total: true },
      { key: "total_revenue", label: "Gross (incl VAT)", accessor: (r) => r.total_revenue, align: "right", total: true },
      { key: "total_discount", label: "Discount", accessor: (r) => r.total_discount, align: "right", total: true },
    ],
    kpis: vatReportKpis("total_revenue", "total_vat"),
    footerTotals: ["qty_sold", "total_vat", "total_revenue", "total_discount"],
  },

  "sales-by-supplier": {
    title: "Sales by Supplier",
    subtitle: "Revenue and VAT grouped by product supplier",
    section: "Sales",
    apiPath: "/reports/sales-by-supplier",
    dateColumn: "sale_date",
    showDateRange: true,
    columns: [
      { key: "sale_date", label: "Date", accessor: (r) => r.sale_date },
      { key: "supplier_code", label: "Supplier Code", accessor: (r) => r.supplier_code || "—", link: "supplier" },
      { key: "supplier_name", label: "Supplier", accessor: (r) => r.supplier_name, link: "supplier" },
      { key: "channel", label: "Channel", accessor: (r) => r.channel },
      { key: "order_count", label: "Orders", accessor: (r) => r.order_count, align: "right", total: true },
      { key: "products_sold", label: "Products", accessor: (r) => r.products_sold, align: "right", total: true },
      { key: "qty_sold", label: "Qty Sold", accessor: (r) => r.qty_sold, align: "right", total: true },
      {
        key: "net_ex_vat",
        label: "Net (ex VAT)",
        accessor: (r) => netExVatAmount(r, "total_revenue", "total_vat"),
        align: "right",
        total: true,
      },
      { key: "total_vat", label: "VAT", accessor: (r) => r.total_vat, align: "right", total: true },
      { key: "total_revenue", label: "Gross (incl VAT)", accessor: (r) => r.total_revenue, align: "right", total: true },
      { key: "total_discount", label: "Discount", accessor: (r) => r.total_discount, align: "right", total: true },
    ],
    kpis: vatReportKpis("total_revenue", "total_vat"),
    footerTotals: ["order_count", "products_sold", "qty_sold", "total_vat", "total_revenue", "total_discount"],
    charts: [{ type: "bar", title: "Revenue by supplier", labelKey: "supplier_name", valueKey: "total_revenue" }],
  },

  "sales-by-channel": {
    title: "Sales by Channel",
    subtitle: "Gross sales, VAT, and collections by channel",
    section: "Sales",
    apiPath: "/reports/sales-by-channel",
    dateColumn: "sale_date",
    showDateRange: true,
    extraFilters: [
      {
        id: "include_legacy_archive",
        type: "checkbox",
        label: "Include legacy archive (requires date range)",
      },
    ],
    columns: [
      { key: "sale_date", label: "Date", accessor: (r) => r.sale_date },
      { key: "branch_name", label: "Branch", accessor: (r) => r.branch_name },
      { key: "channel", label: "Channel", accessor: (r) => r.channel },
      { key: "payment_status", label: "Payment", accessor: (r) => r.payment_status },
      { key: "order_count", label: "Orders", accessor: (r) => r.order_count, align: "right", total: true },
      { key: "net_sales", label: "Net (ex VAT)", accessor: (r) => r.net_sales, align: "right", total: true },
      { key: "total_vat", label: "VAT", accessor: (r) => r.total_vat, align: "right", total: true },
      { key: "gross_sales", label: "Gross (incl VAT)", accessor: (r) => r.gross_sales, align: "right", total: true },
      { key: "collected", label: "Collected", accessor: (r) => r.collected, align: "right", total: true },
    ],
    kpis: vatReportKpis("gross_sales", "total_vat"),
    footerTotals: ["order_count", "net_sales", "total_vat", "gross_sales", "collected"],
  },

  "sales-by-user": {
    title: "Sales by User",
    subtitle: "Sales performance by user with VAT breakdown",
    section: "Sales",
    apiPath: "/reports/sales-by-user",
    dateColumn: "sale_date",
    showDateRange: true,
    columns: [
      { key: "sale_date", label: "Date", accessor: (r) => r.sale_date },
      { key: "salesperson", label: "User", accessor: (r) => r.salesperson },
      { key: "channel", label: "Channel", accessor: (r) => r.channel },
      { key: "order_count", label: "Orders", accessor: (r) => r.order_count, align: "right", total: true },
      {
        key: "net_ex_vat",
        label: "Net (ex VAT)",
        accessor: (r) => netExVatAmount(r, "gross_sales", "total_vat"),
        align: "right",
        total: true,
      },
      { key: "total_vat", label: "VAT", accessor: (r) => r.total_vat, align: "right", total: true },
      { key: "gross_sales", label: "Gross (incl VAT)", accessor: (r) => r.gross_sales, align: "right", total: true },
      { key: "amount_collected", label: "Collected", accessor: (r) => r.amount_collected, align: "right", total: true },
    ],
    kpis: vatReportKpis("gross_sales", "total_vat"),
    footerTotals: ["order_count", "total_vat", "gross_sales", "amount_collected"],
  },

  "category-sales": {
    title: "Sales by Category",
    subtitle: "Category revenue with VAT",
    section: "Sales",
    apiPath: "/reports/category-sales",
    dateColumn: "sale_date",
    showDateRange: true,
    columns: [
      { key: "sale_date", label: "Date", accessor: (r) => r.sale_date },
      { key: "category_name", label: "Category", accessor: (r) => r.category_name },
      { key: "subcategory_name", label: "Subcategory", accessor: (r) => r.subcategory_name },
      { key: "qty_sold", label: "Qty Sold", accessor: (r) => r.qty_sold, align: "right", total: true },
      {
        key: "net_ex_vat",
        label: "Net (ex VAT)",
        accessor: (r) => netExVatAmount(r, "revenue", "vat"),
        align: "right",
        total: true,
      },
      { key: "vat", label: "VAT", accessor: (r) => r.vat, align: "right", total: true },
      { key: "revenue", label: "Gross (incl VAT)", accessor: (r) => r.revenue, align: "right", total: true },
      { key: "discounts", label: "Discount", accessor: (r) => r.discounts, align: "right", total: true },
    ],
    kpis: vatReportKpis("revenue", "vat"),
    footerTotals: ["qty_sold", "vat", "revenue", "discounts"],
  },

  "low-stock": {
    title: "Low Stock / Reorder Report",
    subtitle: "Products at or below reorder point, including out of stock",
    section: "Inventory",
    apiPath: "/reports/low-stock",
    dateColumn: null,
    showDateRange: false,
    columns: [
      { key: "product_name", label: "Product", accessor: (r) => r.product_name, link: "product" },
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
      { key: "customer_num", label: "Customer Code", accessor: (r) => r.customer_num, link: "customer" },
      { key: "customer_name", label: "Customer Name", accessor: (r) => r.customer_name, link: "customer" },
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

  "invoice-payments": {
    title: "Customer invoice payments",
    subtitle: "Payments recorded against customer invoices",
    section: "Finance",
    apiPath: "/reports/invoice-payments",
    dateColumn: "date_paid",
    defaultDateRangeDays: 364,
    showDateRange: true,
    columns: [
      { key: "date_paid", label: "Date paid", accessor: (r) => r.date_paid },
      { key: "invoice_number", label: "Invoice #", accessor: (r) => r.invoice_number, link: "invoice" },
      { key: "customer_num", label: "Customer #", accessor: (r) => r.customer_num, link: "customer" },
      { key: "customer_name", label: "Customer", accessor: (r) => r.customer_name, link: "customer" },
      { key: "amount_paid", label: "Amount", accessor: (r) => r.amount_paid, align: "right", total: true },
      { key: "method_name", label: "Method", accessor: (r) => r.method_name },
      { key: "reference_number", label: "Reference", accessor: (r) => r.reference_number ?? "—" },
      { key: "received_by", label: "Received by", accessor: (r) => r.received_by },
    ],
    kpis: [
      {
        id: "payments",
        label: "Payments",
        compute: (rows) => ({ value: String(rows.length) }),
      },
      {
        id: "total",
        label: "Total collected",
        compute: (rows) => ({ value: kes(sum(rows, "amount_paid")) }),
      },
    ],
    footerTotals: ["amount_paid"],
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
      {
        key: "product_name",
        label: "Product",
        accessor: (r) => r.product_name ?? r.product?.product_name ?? r.product_code,
        link: "product",
      },
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

function netExVatAmount(row, grossKey, vatKey) {
  return Math.max(0, (Number(row[grossKey]) || 0) - (Number(row[vatKey]) || 0));
}

function vatReportKpis(grossKey, vatKey) {
  return [
    {
      id: "gross-ex-vat",
      label: "Sales (ex VAT)",
      compute: (rows) => ({
        value: kes(Math.max(0, sum(rows, grossKey) - sum(rows, vatKey))),
      }),
    },
    {
      id: "vat",
      label: "VAT",
      compute: (rows) => ({ value: kes(sum(rows, vatKey)) }),
    },
    {
      id: "gross-incl-vat",
      label: "Sales (incl VAT)",
      compute: (rows) => ({ value: kes(sum(rows, grossKey)) }),
    },
  ];
}

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
