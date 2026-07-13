import { inventoryTransactionTypeLabel, salesChannelLabel } from "@/lib/user-facing-labels";
import { formatInventoryQtyWithUom } from "@/lib/inventory-qty-display";

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
    /** @type {ReportColumn[]} */
    columns: [
      { key: "sale_day", label: "Date", accessor: (r) => r.sale_day },
      { key: "branch_name", label: "Branch", accessor: (r) => r.branch_name },
      { key: "channel", label: "Channel", accessor: (r) => salesChannelLabel(r.channel) },
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
      { key: "channel", label: "Channel", accessor: (r) => salesChannelLabel(r.channel) },
      {
        key: "qty_sold",
        label: "Qty Sold",
        accessor: (r) => formatInventoryQtyWithUom(r.qty_sold, r),
        align: "right",
        total: true,
      },
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
    subtitle: "Revenue and VAT by product supplier (packaged qty)",
    section: "Sales",
    apiPath: "/reports/sales-by-supplier",
    dateColumn: "sale_date",
    showDateRange: true,
    columns: [
      { key: "sale_date", label: "Date", accessor: (r) => r.sale_date },
      { key: "supplier_code", label: "Supplier Code", accessor: (r) => r.supplier_code || "—", link: "supplier" },
      { key: "supplier_name", label: "Supplier", accessor: (r) => r.supplier_name, link: "supplier" },
      { key: "product_name", label: "Product", accessor: (r) => r.product_name, link: "product" },
      { key: "channel", label: "Channel", accessor: (r) => salesChannelLabel(r.channel) },
      { key: "order_count", label: "Orders", accessor: (r) => r.order_count, align: "right", total: true },
      { key: "qty_sold", label: "Qty Sold", accessor: (r) => formatInventoryQtyWithUom(r.qty_sold, r), align: "right", total: true },
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
    footerTotals: ["order_count", "qty_sold", "total_vat", "total_revenue", "total_discount"],
  },

  "sales-by-channel": {
    title: "Sales by Channel",
    subtitle: "Gross sales, VAT, and collections by channel",
    section: "Sales",
    apiPath: "/reports/sales-by-channel",
    dateColumn: "sale_date",
    showDateRange: true,
    columns: [
      { key: "sale_date", label: "Date", accessor: (r) => r.sale_date },
      { key: "branch_name", label: "Branch", accessor: (r) => r.branch_name },
      { key: "channel", label: "Channel", accessor: (r) => salesChannelLabel(r.channel) },
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
      { key: "channel", label: "Channel", accessor: (r) => salesChannelLabel(r.channel) },
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
    subtitle: "Category revenue with VAT and packaged qty",
    section: "Sales",
    apiPath: "/reports/category-sales",
    dateColumn: "sale_date",
    showDateRange: true,
    columns: [
      { key: "sale_date", label: "Date", accessor: (r) => r.sale_date },
      { key: "category_name", label: "Category", accessor: (r) => r.category_name },
      { key: "subcategory_name", label: "Subcategory", accessor: (r) => r.subcategory_name },
      { key: "product_name", label: "Product", accessor: (r) => r.product_name, link: "product" },
      { key: "qty_sold", label: "Qty Sold", accessor: (r) => formatInventoryQtyWithUom(r.qty_sold, r), align: "right", total: true },
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
        label: "Available Qty",
        accessor: (r) =>
          formatInventoryQtyWithUom(
            r.available_total_units ?? r.total_base_units ?? r.total_quantity,
            r,
          ),
        align: "right",
      },
      {
        key: "reorder_point",
        label: "Reorder Point",
        accessor: (r) => {
          const mode = r.stock_alert_mode ?? "per_product";
          const globalThreshold = Number(r.global_low_stock_threshold);
          const productPoint = Number(r.reorder_point);
          if (mode === "global" && Number.isFinite(globalThreshold) && globalThreshold > 0) {
            return formatInventoryQtyWithUom(globalThreshold, r);
          }
          if (mode === "both") {
            const parts = [];
            if (productPoint > 0) parts.push(`Product ${formatInventoryQtyWithUom(productPoint, r)}`);
            if (Number.isFinite(globalThreshold) && globalThreshold > 0) {
              parts.push(`Global ${formatInventoryQtyWithUom(globalThreshold, r)}`);
            }
            return parts.length ? parts.join(" · ") : "—";
          }
          return productPoint > 0 ? formatInventoryQtyWithUom(productPoint, r) : "—";
        },
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
              const qty = Number(r.available_total_units ?? r.total_base_units ?? r.total_quantity) || 0;
              if (qty <= 0) return false;
              const mode = r.stock_alert_mode ?? "per_product";
              const globalThreshold = Number(r.global_low_stock_threshold) || 0;
              const productPoint = Number(r.reorder_point) || 0;
              const threshold =
                mode === "global"
                  ? globalThreshold
                  : mode === "both"
                    ? Math.max(productPoint, globalThreshold)
                    : productPoint;
              return threshold > 0 && qty <= threshold;
            }).length,
          ),
          tone: "warning",
        }),
      },
    ],
    footerTotals: [],
  },

  "stock-chain": {
    title: "Stock Chain Report",
    subtitle: "Receive → sell lifecycle with available stock and stock value",
    section: "Inventory",
    apiPath: "/reports/stock-chain",
    dateColumn: null,
    showDateRange: true,
    columns: [
      {
        key: "product_name",
        label: "Product",
        accessor: (r) => r.product_name,
        link: "product",
      },
      {
        key: "first_entered_at",
        label: "First stock in",
        accessor: (r) => r.first_entered_at,
      },
      {
        key: "first_sold_at",
        label: "First sale",
        accessor: (r) => r.first_sold_at,
      },
      {
        key: "last_movement_at",
        label: "Last movement",
        accessor: (r) => r.last_movement_at,
      },
      {
        key: "total_received",
        label: "Received value",
        accessor: (r) => r.total_received,
        align: "right",
        total: true,
      },
      {
        key: "total_sold",
        label: "Sold value",
        accessor: (r) => r.total_sold,
        align: "right",
        total: true,
      },
      {
        key: "current_shop_stock",
        label: "Shop available",
        accessor: (r) => formatInventoryQtyWithUom(r.current_shop_stock, r),
        align: "right",
      },
      {
        key: "current_store_stock",
        label: "Store available",
        accessor: (r) => formatInventoryQtyWithUom(r.current_store_stock, r),
        align: "right",
      },
      {
        key: "total_cost_value",
        label: "Stock value",
        accessor: (r) => r.total_cost_value,
        align: "right",
        total: true,
      },
    ],
    kpis: [
      {
        id: "skus",
        label: "Products",
        compute: (rows) => ({ value: String(rows.length) }),
      },
      {
        id: "received",
        label: "Received value",
        compute: (rows) => ({ value: kes(sum(rows, "total_received")) }),
      },
      {
        id: "sold",
        label: "Sold value",
        compute: (rows) => ({ value: kes(sum(rows, "total_sold")) }),
      },
      {
        id: "stock_value",
        label: "Stock value",
        compute: (rows) => ({ value: kes(sum(rows, "total_cost_value")) }),
      },
    ],
    footerTotals: ["total_received", "total_sold", "total_cost_value"],
  },

  "stock-valuation": {
    title: "Stock Valuation",
    subtitle: "Available stock with value at cost (on-hand ÷ conversion × unit cost)",
    section: "Inventory",
    apiPath: "/reports/stock-valuation",
    dateColumn: null,
    showDateRange: false,
    columns: [
      {
        key: "product_name",
        label: "Product",
        accessor: (r) => r.product_name,
        link: "product",
      },
      {
        key: "shop_quantity",
        label: "Shop available",
        accessor: (r) => formatInventoryQtyWithUom(r.shop_quantity ?? r.shop_qty, r),
        align: "right",
      },
      {
        key: "store_quantity",
        label: "Store available",
        accessor: (r) => formatInventoryQtyWithUom(r.store_quantity ?? r.store_qty, r),
        align: "right",
      },
      {
        key: "effective_unit_cost",
        label: "Unit cost",
        accessor: (r) => r.effective_unit_cost ?? r.unit_cost,
        align: "right",
      },
      {
        key: "cost_value",
        label: "Stock value",
        accessor: (r) => r.cost_value ?? r.stock_value,
        align: "right",
        total: true,
      },
    ],
    kpis: [
      {
        id: "skus",
        label: "Products",
        compute: (rows) => ({ value: String(rows.length) }),
      },
      {
        id: "stock_value",
        label: "Total stock value",
        compute: (rows) => ({
          value: kes(
            rows.reduce(
              (s, r) => s + (Number(r.cost_value ?? r.stock_value) || 0),
              0,
            ),
          ),
        }),
      },
    ],
    footerTotals: ["cost_value"],
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

  "open-lpo": {
    title: "Open LPO lines",
    subtitle: "Purchase order lines still pending receive",
    section: "Purchases",
    apiPath: "/reports/open-lpo",
    dateColumn: "order_date",
    showDateRange: true,
    columns: [
      { key: "lpo_no", label: "LPO", accessor: (r) => r.lpo_no, link: "lpo" },
      { key: "supplier_name", label: "Supplier", accessor: (r) => r.supplier_name, link: "supplier" },
      { key: "status_name", label: "Status", accessor: (r) => r.status_name },
      { key: "order_date", label: "Order date", accessor: (r) => r.order_date },
      { key: "due_date", label: "Due date", accessor: (r) => r.due_date },
      { key: "product_name", label: "Product", accessor: (r) => r.product_name, link: "product" },
      {
        key: "ordered_qty",
        label: "Ordered",
        accessor: (r) => formatInventoryQtyWithUom(r.ordered_qty, r),
        align: "right",
      },
      {
        key: "received_qty",
        label: "Received",
        accessor: (r) => formatInventoryQtyWithUom(r.received_qty, r),
        align: "right",
      },
      {
        key: "pending_qty",
        label: "Pending",
        accessor: (r) => formatInventoryQtyWithUom(r.pending_qty, r),
        align: "right",
      },
      { key: "cost_price", label: "Unit cost", accessor: (r) => r.cost_price, align: "right" },
      {
        key: "pending_value",
        label: "Pending value",
        accessor: (r) => r.pending_value,
        align: "right",
        total: true,
      },
    ],
    kpis: [
      {
        id: "lines",
        label: "Open lines",
        compute: (rows) => ({ value: String(rows.length) }),
      },
      {
        id: "pending_value",
        label: "Pending value",
        compute: (rows) => ({ value: kes(sum(rows, "pending_value")) }),
      },
    ],
    footerTotals: ["pending_value"],
  },

  "purchases-by-supplier": {
    title: "Purchases by supplier",
    subtitle: "LPO totals and pending receive by supplier",
    section: "Purchases",
    apiPath: "/reports/purchases-by-supplier",
    dateColumn: "order_date",
    showDateRange: true,
    columns: [
      { key: "order_date", label: "Order date", accessor: (r) => r.order_date },
      { key: "supplier_code", label: "Supplier code", accessor: (r) => r.supplier_code || "—", link: "supplier" },
      { key: "supplier_name", label: "Supplier", accessor: (r) => r.supplier_name, link: "supplier" },
      { key: "lpo_no", label: "LPO", accessor: (r) => r.lpo_no, link: "lpo" },
      { key: "status_name", label: "Status", accessor: (r) => r.status_name },
      { key: "due_date", label: "Due date", accessor: (r) => r.due_date },
      { key: "line_items", label: "Lines", accessor: (r) => r.line_items, align: "right", total: true },
      { key: "total_qty_ordered", label: "Ordered qty", accessor: (r) => r.total_qty_ordered, align: "right" },
      { key: "total_qty_received", label: "Received qty", accessor: (r) => r.total_qty_received, align: "right" },
      { key: "total_qty_pending", label: "Pending qty", accessor: (r) => r.total_qty_pending, align: "right" },
      { key: "pending_value", label: "Pending value", accessor: (r) => r.pending_value, align: "right", total: true },
      { key: "total_amount", label: "LPO total", accessor: (r) => r.total_amount, align: "right", total: true },
    ],
    kpis: [
      {
        id: "lpos",
        label: "LPOs",
        compute: (rows) => ({ value: String(rows.length) }),
      },
      {
        id: "total",
        label: "LPO total",
        compute: (rows) => ({ value: kes(sum(rows, "total_amount")) }),
      },
      {
        id: "pending",
        label: "Pending value",
        compute: (rows) => ({ value: kes(sum(rows, "pending_value")) }),
      },
    ],
    footerTotals: ["line_items", "pending_value", "total_amount"],
  },

  "top-debtors": {
    title: "Top Debtors Report",
    subtitle: "Customers with outstanding balances",
    section: "Finance",
    apiPath: "/reports/top-debtors",
    dateColumn: null,
    showDateRange: true,
    emptyDateRange: true,
    columns: [
      { key: "customer_name", label: "Customer", accessor: (r) => r.customer_name, link: "customer" },
      { key: "route_name", label: "Route", accessor: (r) => r.route_name },
      {
        key: "outstanding_balance",
        label: "Outstanding",
        accessor: (r) =>
          Number(r.outstanding_balance ?? Math.max(Number(r.current_balance) || 0, Number(r.invoice_balance) || 0)),
        align: "right",
        total: true,
      },
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
        compute: (rows) => ({
          value: kes(
            rows.reduce(
              (acc, r) =>
                acc +
                Number(
                  r.outstanding_balance ??
                    Math.max(Number(r.current_balance) || 0, Number(r.invoice_balance) || 0),
                ),
              0,
            ),
          ),
        }),
      },
    ],
    footerTotals: ["outstanding_balance", "open_invoices", "invoice_balance"],
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
      { key: "transaction_type", label: "Type", accessor: (r) => inventoryTransactionTypeLabel(r.transaction_type) },
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
        accessor: (r) =>
          Number(r.quantity_change) > 0
            ? formatInventoryQtyWithUom(r.quantity_change, r)
            : "—",
        align: "right",
      },
      {
        key: "out_qty",
        label: "Out Qty",
        accessor: (r) =>
          Number(r.quantity_change) < 0
            ? formatInventoryQtyWithUom(Math.abs(Number(r.quantity_change)), r)
            : "—",
        align: "right",
      },
      {
        key: "quantity_after",
        label: "Balance Qty",
        accessor: (r) => formatInventoryQtyWithUom(r.quantity_after, r),
        align: "right",
      },
      { key: "unit_cost", label: "Unit Cost", accessor: (r) => r.unit_cost, align: "right" },
    ],
    kpis: [
      {
        id: "movements",
        label: "Movements",
        compute: (rows) => ({ value: String(rows.length) }),
      },
      {
        id: "products",
        label: "Products",
        compute: (rows) => ({
          value: String(new Set(rows.map((r) => r.product_code).filter(Boolean)).size),
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
      { key: "channel", label: "Channel", accessor: (r) => salesChannelLabel(r.channel) },
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
