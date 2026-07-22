import { inventoryTransactionTypeLabel, salesChannelLabel } from "@/lib/user-facing-labels";
import {
  formatCustomerReturnReportQty,
  formatBaseQtyAsProductPack,
  formatInventoryQtyWithUom,
  formatReorderPointDisplay,
  formatReportQuantity,
} from "@/lib/inventory-qty-display";
import { formatDisplayQty } from "@/lib/stock-uom";
import { lpoRowDisplayNumber } from "@/lib/lpo-display";

/** @typedef {{ key: string, label: string, accessor: (row: object) => unknown, align?: 'left'|'right', badge?: (row: object) => { label: string, tone: string } | null, total?: boolean, sumFromRow?: (row: object) => number, footerCompute?: (rows: object[]) => number }} ReportColumn */

/** @typedef {{ id: string, label: string, compute: (rows: object[], summary?: object|null) => { value: string, hint?: string, tone?: string } }} ReportKpi */

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
    subtitle: "Daily sales by branch/channel across booked → completed (incl. unpaid / partial)",
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
        compute: (rows, summary) => ({
          value: String(Math.round(summary?.orders ?? sum(rows, "orders"))),
        }),
      },
      {
        id: "gross",
        label: "Total Sales",
        compute: (rows, summary) => ({ value: kes(summary?.gross ?? sum(rows, "gross")) }),
      },
      {
        id: "vat",
        label: "Total VAT",
        compute: (rows, summary) => ({ value: kes(summary?.vat ?? sum(rows, "vat")) }),
      },
      {
        id: "net",
        label: "Net Sales",
        compute: (rows, summary) => ({
          value: kes(summary?.net ?? summary?.net_ex_vat ?? sum(rows, "net")),
        }),
      },
      {
        id: "avg",
        label: "Average Order",
        compute: (rows, summary) => {
          const orders = Number(summary?.orders ?? sum(rows, "orders"));
          const gross = Number(summary?.gross ?? sum(rows, "gross"));
          return { value: orders > 0 ? kes(gross / orders) : "—" };
        },
      },
    ],
    footerTotals: ["orders", "gross", "vat", "net"],
    charts: [{ type: "bar", title: "Daily gross sales", labelKey: "sale_day", valueKey: "gross" }],
  },

  "sales-by-product": {
    title: "Sales by Product",
    subtitle: "Revenue and VAT by product across booked → completed orders",
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
        accessor: (r) => formatReportQuantity(r.qty_sold, r, "qty_sold"),
        align: "right",
        total: true,
      },
      {
        key: "net_ex_vat",
        label: "Net (ex VAT)",
        accessor: (r) => netExVatAmount(r, "total_revenue", "total_vat"),
        sumFromRow: (r) => netExVatAmount(r, "total_revenue", "total_vat"),
        align: "right",
        total: true,
      },
      { key: "total_vat", label: "VAT", accessor: (r) => r.total_vat, align: "right", total: true },
      { key: "total_revenue", label: "Gross (incl VAT)", accessor: (r) => r.total_revenue, align: "right", total: true },
      { key: "total_discount", label: "Discount", accessor: (r) => r.total_discount, align: "right", total: true },
    ],
    kpis: vatReportKpis("total_revenue", "total_vat"),
    footerTotals: ["qty_sold", "net_ex_vat", "total_vat", "total_revenue", "total_discount"],
  },

  "sales-by-supplier": {
    title: "Sales by Supplier",
    subtitle: "Revenue and VAT by product supplier across booked → completed orders",
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
      { key: "qty_sold", label: "Qty Sold", accessor: (r) => formatReportQuantity(r.qty_sold, r, "qty_sold"), align: "right", total: true },
      {
        key: "net_ex_vat",
        label: "Net (ex VAT)",
        accessor: (r) => netExVatAmount(r, "total_revenue", "total_vat"),
        sumFromRow: (r) => netExVatAmount(r, "total_revenue", "total_vat"),
        align: "right",
        total: true,
      },
      { key: "total_vat", label: "VAT", accessor: (r) => r.total_vat, align: "right", total: true },
      { key: "total_revenue", label: "Gross (incl VAT)", accessor: (r) => r.total_revenue, align: "right", total: true },
      { key: "total_discount", label: "Discount", accessor: (r) => r.total_discount, align: "right", total: true },
    ],
    kpis: vatReportKpis("total_revenue", "total_vat"),
    footerTotals: ["order_count", "qty_sold", "net_ex_vat", "total_vat", "total_revenue", "total_discount"],
  },

  "sales-by-channel": {
    title: "Sales by Channel",
    subtitle: "Gross sales, VAT, and collections by channel across booked → completed orders",
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
    subtitle: "Orders by user on the day they were placed (booked → completed, incl. unpaid / partial), with VAT breakdown",
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
        sumFromRow: (r) => netExVatAmount(r, "gross_sales", "total_vat"),
        align: "right",
        total: true,
      },
      { key: "total_vat", label: "VAT", accessor: (r) => r.total_vat, align: "right", total: true },
      { key: "gross_sales", label: "Gross (incl VAT)", accessor: (r) => r.gross_sales, align: "right", total: true },
      { key: "amount_collected", label: "Collected", accessor: (r) => r.amount_collected, align: "right", total: true },
    ],
    kpis: vatReportKpis("gross_sales", "total_vat"),
    footerTotals: ["order_count", "net_ex_vat", "total_vat", "gross_sales", "amount_collected"],
  },

  "category-sales": {
    title: "Sales by Category",
    subtitle: "Category revenue with VAT across booked → completed orders",
    section: "Sales",
    apiPath: "/reports/category-sales",
    dateColumn: "sale_date",
    showDateRange: true,
    columns: [
      { key: "sale_date", label: "Date", accessor: (r) => r.sale_date },
      { key: "category_name", label: "Category", accessor: (r) => r.category_name },
      { key: "subcategory_name", label: "Subcategory", accessor: (r) => r.subcategory_name },
      { key: "product_name", label: "Product", accessor: (r) => r.product_name, link: "product" },
      { key: "qty_sold", label: "Qty Sold", accessor: (r) => formatReportQuantity(r.qty_sold, r, "qty_sold"), align: "right", total: true },
      {
        key: "net_ex_vat",
        label: "Net (ex VAT)",
        accessor: (r) => netExVatAmount(r, "revenue", "vat"),
        sumFromRow: (r) => netExVatAmount(r, "revenue", "vat"),
        align: "right",
        total: true,
      },
      { key: "vat", label: "VAT", accessor: (r) => r.vat, align: "right", total: true },
      { key: "revenue", label: "Gross (incl VAT)", accessor: (r) => r.revenue, align: "right", total: true },
      { key: "discounts", label: "Discount", accessor: (r) => r.discounts, align: "right", total: true },
    ],
    kpis: vatReportKpis("revenue", "vat"),
    footerTotals: ["qty_sold", "net_ex_vat", "vat", "revenue", "discounts"],
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
            return formatBaseQtyAsProductPack(globalThreshold, r);
          }
          if (mode === "both") {
            const parts = [];
            if (productPoint > 0) parts.push(`Product ${formatReorderPointDisplay(r)}`);
            if (Number.isFinite(globalThreshold) && globalThreshold > 0) {
              parts.push(`Global ${formatBaseQtyAsProductPack(globalThreshold, r)}`);
            }
            return parts.length ? parts.join(" · ") : "—";
          }
          return productPoint > 0 ? formatReorderPointDisplay(r) : "—";
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
        compute: (rows, summary) => ({
          value: String(summary?.row_count ?? rows.length),
          tone: "warning",
        }),
      },
      {
        id: "out",
        label: "Out of stock",
        compute: (rows, summary) => ({
          value: String(
            summary?.out_of_stock_count ??
              rows.filter((r) => Number(r.total_base_units ?? r.total_quantity) <= 0).length,
          ),
          tone: "danger",
          hint: summary?.out_of_stock_count == null && rows.length ? "On this page" : undefined,
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
          hint: rows.length ? "On this page" : undefined,
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
        compute: (rows, summary) => ({
          value: String(summary?.row_count ?? rows.length),
        }),
      },
      {
        id: "received",
        label: "Received value",
        compute: (rows, summary) => ({
          value: kes(summary?.total_received ?? sum(rows, "total_received")),
        }),
      },
      {
        id: "sold",
        label: "Sold value",
        compute: (rows, summary) => ({
          value: kes(summary?.total_sold ?? sum(rows, "total_sold")),
        }),
      },
      {
        id: "stock_value",
        label: "Stock value",
        compute: (rows, summary) => ({
          value: kes(summary?.total_cost_value ?? sum(rows, "total_cost_value")),
        }),
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
        compute: (rows, summary) => ({
          value: String(summary?.row_count ?? rows.length),
        }),
      },
      {
        id: "stock_value",
        label: "Total stock value",
        compute: (rows, summary) => ({
          value: kes(
            summary?.cost_value ??
              summary?.stock_value ??
              rows.reduce((s, r) => s + (Number(r.cost_value ?? r.stock_value) || 0), 0),
          ),
        }),
      },
    ],
    footerTotals: ["cost_value"],
  },

  "profit-loss-by-product": {
    title: "Profit & Loss by Product",
    subtitle: "Gross profit = (qty × unit price) − (qty × cost price), with VAT shown separately",
    section: "Finance",
    apiPath: "/reports/profit-loss-by-product",
    showDateRange: true,
    defaultDateRangeDays: 0,
    columns: [
      { key: "product_name", label: "Product", accessor: (r) => r.product_name, link: "product" },
      {
        key: "qty_sold",
        label: "Qty Sold",
        accessor: (r) => r.qty_sold_label || formatReportQuantity(r.qty_sold, r, "qty_sold"),
        align: "right",
        total: true,
      },
      {
        key: "net_revenue",
        label: "Net (ex VAT)",
        accessor: (r) => r.net_revenue,
        align: "right",
        total: true,
      },
      { key: "total_vat", label: "VAT", accessor: (r) => r.total_vat, align: "right", total: true },
      { key: "gross_revenue", label: "Gross (incl VAT)", accessor: (r) => r.gross_revenue, align: "right", total: true },
      { key: "cogs", label: "COGS", accessor: (r) => r.cogs, align: "right", total: true },
      { key: "gross_profit", label: "Gross profit", accessor: (r) => r.gross_profit, align: "right", total: true },
      {
        key: "gross_margin_percent",
        label: "Margin %",
        accessor: (r) =>
          r.gross_margin_percent == null ? "—" : `${Number(r.gross_margin_percent).toFixed(1)}%`,
        align: "right",
      },
    ],
    kpis: [
      {
        id: "products",
        label: "Products",
        compute: (rows, summary) => ({
          value: String(summary?.product_count ?? rows.length),
        }),
      },
      {
        id: "gross_revenue",
        label: "Gross sales",
        compute: (rows, summary) => ({
          value: kes(summary?.gross_revenue ?? sum(rows, "gross_revenue")),
        }),
      },
      {
        id: "cogs",
        label: "COGS",
        compute: (rows, summary) => ({
          value: kes(summary?.cogs ?? sum(rows, "cogs")),
        }),
      },
      {
        id: "gross_profit",
        label: "Gross profit",
        compute: (rows, summary) => ({
          value: kes(summary?.gross_profit ?? sum(rows, "gross_profit")),
          hint:
            summary?.gross_margin_percent != null
              ? `${Number(summary.gross_margin_percent).toFixed(1)}% margin`
              : undefined,
        }),
      },
    ],
    useApiSummary: true,
    footerTotals: ["qty_sold", "net_revenue", "total_vat", "gross_revenue", "cogs", "gross_profit"],
    charts: [{ type: "bar", title: "Top products by gross profit", labelKey: "product_name", valueKey: "gross_profit" }],
  },

  "profit-loss": {
    title: "Profit & Loss Report",
    subtitle: "Operational revenue, COGS, and expenses",
    section: "Finance",
    apiPath: "/reports/profit-loss",
    dateColumn: "period",
    showDateRange: true,
    defaultDateRangeDays: 0,
    variant: "profit-loss",
  },

  "open-lpo": {
    title: "Open LPO lines",
    subtitle: "Purchase order lines still pending receive, grouped by LPO",
    section: "Purchases",
    apiPath: "/reports/open-lpo",
    dateColumn: "order_date",
    showDateRange: true,
    groupBy: {
      key: "lpo_no",
      titleColumnKey: "lpo_no",
      title: (row) => lpoRowDisplayNumber(row),
      subtitle: (row) =>
        [row.supplier_name, row.status_name, row.order_date ? `Ordered ${row.order_date}` : null]
          .filter(Boolean)
          .join(" · "),
      link: "lpo",
      subtotalKeys: ["pending_value"],
      subtotalLabel: "LPO total",
    },
    columns: [
      { key: "product_name", label: "Product", accessor: (r) => r.product_name, link: "product" },
      {
        key: "ordered_qty",
        label: "Ordered",
        accessor: (r) => formatReportQuantity(r.ordered_qty, r, "ordered_qty"),
        align: "right",
      },
      {
        key: "received_qty",
        label: "Received",
        accessor: (r) => formatReportQuantity(r.received_qty, r, "received_qty"),
        align: "right",
      },
      {
        key: "pending_qty",
        label: "Pending",
        accessor: (r) => formatReportQuantity(r.pending_qty, r, "pending_qty"),
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
      { key: "due_date", label: "Due date", accessor: (r) => r.due_date },
    ],
    kpis: [
      {
        id: "lpos",
        label: "Open LPOs",
        compute: (rows, summary) => ({
          value: String(summary?.lpo_count ?? new Set(rows.map((r) => r.lpo_no)).size),
          hint: summary?.lpo_count == null && rows.length ? "On this page" : undefined,
        }),
      },
      {
        id: "lines",
        label: "Open lines",
        compute: (rows, summary) => ({
          value: String(summary?.row_count ?? rows.length),
        }),
      },
      {
        id: "pending_value",
        label: "Pending value",
        compute: (rows, summary) => ({
          value: kes(summary?.pending_value ?? sum(rows, "pending_value")),
        }),
      },
    ],
    footerTotals: ["pending_value"],
  },

  "purchases-by-supplier": {
    title: "Purchases by supplier",
    subtitle: "Purchase order lines grouped by supplier with packaged quantities",
    section: "Purchases",
    apiPath: "/reports/purchases-by-supplier",
    dateColumn: "order_date",
    showDateRange: true,
    groupBy: {
      key: "supplier_id",
      titleColumnKey: "supplier_name",
      title: (row) => row.supplier_name || "Unknown supplier",
      subtitle: (row) => row.supplier_code || null,
      link: "supplier",
      subtotalKeys: ["pending_value"],
      subtotalLabel: "Supplier total",
    },
    columns: [
      { key: "order_date", label: "Order date", accessor: (r) => r.order_date },
      { key: "lpo_no", label: "LPO", accessor: (r) => lpoRowDisplayNumber(r), link: "lpo" },
      { key: "status_name", label: "Status", accessor: (r) => r.status_name },
      { key: "due_date", label: "Due date", accessor: (r) => r.due_date },
      { key: "product_name", label: "Product", accessor: (r) => r.product_name, link: "product" },
      {
        key: "total_qty_ordered",
        label: "Ordered qty",
        accessor: (r) => formatReportQuantity(r.total_qty_ordered, r, "total_qty_ordered"),
        align: "right",
      },
      {
        key: "total_qty_received",
        label: "Received qty",
        accessor: (r) => formatReportQuantity(r.total_qty_received, r, "total_qty_received"),
        align: "right",
      },
      {
        key: "total_qty_pending",
        label: "Pending qty",
        accessor: (r) => formatReportQuantity(r.total_qty_pending, r, "total_qty_pending"),
        align: "right",
      },
      { key: "pending_value", label: "Pending value", accessor: (r) => r.pending_value, align: "right", total: true },
      {
        key: "total_amount",
        label: "LPO total",
        accessor: (r) => r.total_amount,
        align: "right",
        total: true,
        footerCompute: (rows) =>
          rows.reduce((acc, row) => {
            const key = row.lpo_no;
            if (key == null || acc.seen.has(key)) return acc;
            acc.seen.add(key);
            acc.sum += Number(row.total_amount) || 0;
            return acc;
          }, { seen: new Set(), sum: 0 }).sum,
      },
    ],
    kpis: [
      {
        id: "suppliers",
        label: "Suppliers",
        compute: (rows, summary) => ({
          value: String(
            summary?.supplier_count ??
              new Set(rows.map((r) => r.supplier_id ?? r.supplier_name)).size,
          ),
          hint: summary?.supplier_count == null && rows.length ? "On this page" : undefined,
        }),
      },
      {
        id: "lpos",
        label: "LPO lines",
        compute: (rows, summary) => ({
          value: String(summary?.row_count ?? rows.length),
        }),
      },
      {
        id: "total",
        label: "LPO total",
        compute: (rows) => ({
          // total_amount repeats on each line — do not use SUM(summary.total_amount).
          value: kes(
            rows.reduce((acc, row) => {
              const key = row.lpo_no;
              if (key == null || acc.seen.has(key)) return acc;
              acc.seen.add(key);
              acc.sum += Number(row.total_amount) || 0;
              return acc;
            }, { seen: new Set(), sum: 0 }).sum,
          ),
          hint: rows.length ? "On this page" : undefined,
        }),
      },
      {
        id: "pending",
        label: "Pending value",
        compute: (rows, summary) => ({
          value: kes(summary?.pending_value ?? sum(rows, "pending_value")),
        }),
      },
    ],
    footerTotals: ["pending_value", "total_amount"],
  },

  "top-debtors": {
    title: "Top Debtors Report",
    subtitle: "Customers with outstanding balances",
    section: "Finance",
    apiPath: "/reports/top-debtors",
    dateColumn: null,
    showDateRange: true,
    defaultDateRangeDays: 6,
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
        compute: (rows, summary) => ({
          value: String(summary?.row_count ?? rows.length),
        }),
      },
      {
        id: "outstanding",
        label: "Total Outstanding",
        compute: (rows, summary) => ({
          value: kes(
            summary?.outstanding_balance ??
              summary?.invoice_balance ??
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
        compute: (rows, summary) => ({
          value: String(summary?.row_count ?? rows.length),
        }),
      },
      {
        id: "total",
        label: "Total collected",
        compute: (rows, summary) => ({
          value: kes(summary?.amount_paid ?? sum(rows, "amount_paid")),
        }),
      },
    ],
    footerTotals: ["amount_paid"],
  },

  returns: {
    title: "Customer Returns Report",
    subtitle: "Approved customer return lines with packaged quantities",
    section: "Inventory",
    apiPath: "/reports/returns",
    dateColumn: "return_date",
    showDateRange: true,
    columns: [
      { key: "return_date", label: "Date", accessor: (r) => r.return_date },
      { key: "customer_name", label: "Customer", accessor: (r) => r.customer_name, link: "customer" },
      {
        key: "product_name",
        label: "Product",
        accessor: (r) => r.product_name ?? r.product_code,
        link: "product",
      },
      {
        key: "quantity",
        label: "Qty",
        accessor: (r) => formatCustomerReturnReportQty(r.quantity, r),
        align: "right",
        total: true,
      },
      { key: "stock_location", label: "Location", accessor: (r) => r.stock_location ?? "—" },
      { key: "reason", label: "Reason", accessor: (r) => r.reason ?? "—" },
      { key: "returned_by", label: "Returned by", accessor: (r) => r.returned_by },
    ],
    footerTotals: ["quantity"],
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
        compute: (rows, summary) => ({
          value: String(summary?.row_count ?? rows.length),
        }),
      },
      {
        id: "products",
        label: "Products",
        compute: (rows, summary) => ({
          value: String(
            summary?.product_count ??
              new Set(rows.map((r) => r.product_code).filter(Boolean)).size,
          ),
          hint: summary?.product_count == null && rows.length ? "On this page" : undefined,
        }),
      },
    ],
  },

  "vat-collected": {
    title: "VAT Collected Report",
    subtitle: "VAT on sales across booked → completed orders (incl. unpaid / partial)",
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
        compute: (rows, summary) => ({
          value: kes(summary?.vat_collected ?? sum(rows, "vat_collected")),
        }),
      },
      {
        id: "taxable",
        label: "Taxable Sales",
        compute: (rows, summary) => ({
          value: kes(summary?.gross_sales ?? sum(rows, "gross_sales")),
        }),
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
        compute: (rows, summary) => ({
          value: String(summary?.row_count ?? rows.length),
        }),
      },
      {
        id: "sales",
        label: "Total Sales",
        compute: (rows, summary) => ({
          value: kes(summary?.gross_sales ?? sum(rows, "gross_sales")),
        }),
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
        compute: (rows, summary) => ({
          value: kes(summary?.total_amount ?? sum(rows, "total_amount")),
        }),
      },
      {
        id: "groups",
        label: "Categories",
        compute: (rows) => ({
          value: String(new Set(rows.map((r) => r.group_name)).size),
          hint: rows.length ? "On this page" : undefined,
        }),
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
      compute: (rows, summary) => {
        const gross = Number(summary?.[grossKey] ?? sum(rows, grossKey));
        const vat = Number(summary?.[vatKey] ?? sum(rows, vatKey));
        const net = Number(
          summary?.net_ex_vat ?? summary?.net_sales ?? summary?.net ?? Math.max(0, gross - vat),
        );
        return { value: kes(net) };
      },
    },
    {
      id: "vat",
      label: "VAT",
      compute: (rows, summary) => ({ value: kes(summary?.[vatKey] ?? sum(rows, vatKey)) }),
    },
    {
      id: "gross-incl-vat",
      label: "Sales (incl VAT)",
      compute: (rows, summary) => ({ value: kes(summary?.[grossKey] ?? sum(rows, grossKey)) }),
    },
  ];
}

/** Prefer API full-filter summary value, else sum visible/page rows. */
export function summaryOrSum(summary, rows, field, sumFromRow) {
  if (summary && summary[field] != null && summary[field] !== "") {
    return Number(summary[field]) || 0;
  }
  if (typeof sumFromRow === "function") {
    return rows.reduce((acc, row) => acc + (Number(sumFromRow(row)) || 0), 0);
  }
  return sum(rows, field);
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
  const qty = Number(row.available_total_units ?? row.total_base_units ?? row.total_quantity) || 0;
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
