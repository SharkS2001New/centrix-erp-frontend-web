/** Feature permission codes — aligned with API config/permission_registry.php */

import { HR_REPORT_KEYS } from "@/lib/reports/hr-reports";
import {
  ORDER_QUEUE_SLUGS,
  orderQueuePermissionCode,
  SALES_ORDERS_VIEW_ALL_QUEUES,
} from "@/lib/order-queue-permissions";

const ORDER_QUEUE_VIEW_PERMISSIONS = [
  ...ORDER_QUEUE_SLUGS.map((slug) => orderQueuePermissionCode(slug)),
  SALES_ORDERS_VIEW_ALL_QUEUES,
];

export { ORDER_QUEUE_VIEW_PERMISSIONS };

export const P = {
  dashboard: {
    overview: { view: "dashboard.overview.view" },
    sales: { view: "dashboard.sales.view" },
    inventory: { view: "dashboard.inventory.view" },
  },
  catalogue: {
    products: {
      view: "catalogue.products.view",
      create: "catalogue.products.create",
      edit: "catalogue.products.edit",
      delete: "catalogue.products.delete",
    },
    categories: { view: "catalogue.categories.view" },
    uoms: { view: "catalogue.uoms.view" },
    retail_packages: { view: "catalogue.retail_packages.view" },
    vat_rates: {
      view: "catalogue.vat_rates.view",
      create: "catalogue.vat_rates.create",
      edit: "catalogue.vat_rates.edit",
      delete: "catalogue.vat_rates.delete",
    },
    price_history: { view: "catalogue.price_history.view" },
  },
  customers: {
    customers: { view: "customers.customers.view" },
    statements: { view: "customers.statements.view" },
  },
  payments: {
    sale_payments: { view: "payments.sale_payments.view", create: "payments.sale_payments.create", edit: "payments.sale_payments.edit" },
    customer_invoices: { view: "payments.customer_invoices.view", create: "payments.customer_invoices.create", edit: "payments.customer_invoices.edit" },
    customer_payments: { view: "payments.customer_payments.view", create: "payments.customer_payments.create", edit: "payments.customer_payments.edit" },
  },
  sales: {
    dashboard: { view: "dashboard.sales.view" },
    order_queues: {
      all: { view: "sales.order_queue_all.view" },
      booked: { view: "sales.order_queue_booked.view" },
      pending: { view: "sales.order_queue_pending.view" },
      unpaid: { view: "sales.order_queue_unpaid.view" },
      pending_payment: { view: "sales.order_queue_pending_payment.view" },
      paid: { view: "sales.order_queue_paid.view" },
      processed: { view: "sales.order_queue_processed.view" },
      delivered: { view: "sales.order_queue_delivered.view" },
      completed: { view: "sales.order_queue_completed.view" },
      cancelled: { view: "sales.order_queue_cancelled.view" },
      expired: { view: "sales.order_queue_expired.view" },
      pending_approval: { view: "sales.order_queue_pending_approval.view" },
      editable: { view: "sales.order_queue_editable.view" },
      mobile: { view: "sales.order_queue_mobile.view" },
    },
    orders: {
      view: SALES_ORDERS_VIEW_ALL_QUEUES,
      create: "sales.orders.create",
      edit: "sales.orders.edit",
      approve: "sales.orders.approve",
    },
    discounts: {
      give: "sales.discounts.give",
    },
    vouchers: { view: "sales.vouchers.view" },
    loyalty_cards: { view: "sales.loyalty_cards.view" },
    reservations: { view: "sales.reservations.view" },
    returns: { view: "sales.returns.view", create: "sales.returns.create" },
    loading_sheets: { view: "sales.loading_sheets.view" },
    field_attendance: { view: "sales.field_attendance.view", create: "sales.field_attendance.create" },
    legacy_orders: { view: "sales.legacy_orders.view" },
  },
  mobile_sales: {
    dashboard: { view: "mobile_sales.dashboard.view" },
    orders: { view: "mobile_sales.orders.view", create: "mobile_sales.orders.create", edit: "mobile_sales.orders.edit" },
    customers: { view: "mobile_sales.customers.view", create: "mobile_sales.customers.create", edit: "mobile_sales.customers.edit" },
    catalog: { view: "mobile_sales.catalog.view" },
    stock: { view: "mobile_sales.stock.view" },
    routes: { view: "mobile_sales.routes.view" },
    payments: { view: "mobile_sales.payments.view", create: "mobile_sales.payments.create" },
  },
  mobile_driver: {
    trips: { view: "mobile_driver.trips.view" },
    deliveries: { view: "mobile_driver.deliveries.view", deliver: "mobile_driver.deliveries.deliver" },
    pod: { view: "mobile_driver.pod.view", create: "mobile_driver.pod.create" },
    cash: { view: "mobile_driver.cash.view", create: "mobile_driver.cash.create" },
  },
  pos: {
    till_management: { view: "pos.till_management.view" },
    checkout: { create: "pos.checkout.create" },
    terminal: { view: "pos.terminal.view" },
    end_of_day: { view: "pos.end_of_day.view" },
  },
  hotel_bar_pos: {
    terminal: { view: "hotel_bar_pos.terminal.view" },
    checks: {
      view: "hotel_bar_pos.checks.view",
      create: "hotel_bar_pos.checks.create",
      edit: "hotel_bar_pos.checks.edit",
    },
    room_charge: { create: "hotel_bar_pos.room_charge.create" },
    shift: { view: "hotel_bar_pos.shift.view", create: "hotel_bar_pos.shift.create" },
  },
  hospitality: {
    dashboard: { view: "hospitality.dashboard.view" },
    outlets: {
      view: "hospitality.outlets.view",
      create: "hospitality.outlets.create",
      edit: "hospitality.outlets.edit",
    },
    rooms: {
      view: "hospitality.rooms.view",
      create: "hospitality.rooms.create",
      edit: "hospitality.rooms.edit",
    },
    reservations: {
      view: "hospitality.reservations.view",
      create: "hospitality.reservations.create",
      edit: "hospitality.reservations.edit",
    },
    frontdesk: { view: "hospitality.frontdesk.view", edit: "hospitality.frontdesk.edit" },
    folios: {
      view: "hospitality.folios.view",
      create: "hospitality.folios.create",
      edit: "hospitality.folios.edit",
    },
    housekeeping: { view: "hospitality.housekeeping.view", edit: "hospitality.housekeeping.edit" },
    night_audit: {
      view: "hospitality.night_audit.view",
      create: "hospitality.night_audit.create",
    },
    reports: { view: "hospitality.reports.view" },
    settings: { view: "hospitality.settings.view", edit: "hospitality.settings.edit" },
  },
  inventory: {
    dashboard: { view: "dashboard.inventory.view" },
    stock: { view: "inventory.stock.view" },
    receipts: { view: "inventory.receipts.view" },
    movements: { view: "inventory.movements.view" },
    transfers: { view: "inventory.transfers.view", create: "inventory.transfers.create" },
    damages: { view: "inventory.damages.view" },
    adjustments: { view: "inventory.adjustments.view", create: "inventory.adjustments.create" },
    stock_take: {
      view: "inventory.stock_take.view",
      create: "inventory.stock_take.create",
      approve: "inventory.stock_take.approve",
    },
  },
  purchasing: {
    lpo: {
      view: "purchasing.lpo.view",
      create: "purchasing.lpo.create",
      edit: "purchasing.lpo.edit",
      delete: "purchasing.lpo.delete",
      approve: "purchasing.lpo.approve",
    },
    suppliers: {
      view: "purchasing.suppliers.view",
      create: "purchasing.suppliers.create",
      edit: "purchasing.suppliers.edit",
      delete: "purchasing.suppliers.delete",
    },
    supplier_payments: { view: "purchasing.supplier_payments.view" },
    supplier_returns: { view: "purchasing.supplier_returns.view" },
  },
  fulfillment: {
    overview: { view: "fulfillment.overview.view" },
    drivers: { view: "fulfillment.drivers.view", create: "fulfillment.drivers.create", edit: "fulfillment.drivers.edit", delete: "fulfillment.drivers.delete" },
    vehicles: { view: "fulfillment.vehicles.view", create: "fulfillment.vehicles.create", edit: "fulfillment.vehicles.edit", delete: "fulfillment.vehicles.delete" },
    routes: { view: "fulfillment.routes.view", create: "fulfillment.routes.create", edit: "fulfillment.routes.edit", delete: "fulfillment.routes.delete" },
    schedules: { view: "fulfillment.schedules.view", edit: "fulfillment.schedules.edit" },
    dispatch: { view: "fulfillment.dispatch.view", manage: "fulfillment.dispatch.manage" },
    trips: { view: "fulfillment.trips.view", create: "fulfillment.trips.create", edit: "fulfillment.trips.edit", delete: "fulfillment.trips.delete" },
    picking: { view: "fulfillment.picking.view", edit: "fulfillment.picking.edit" },
    loading_lists: { view: "fulfillment.loading_lists.view" },
    pod: { view: "fulfillment.pod.view" },
  },
  accounting: {
    dashboard: { view: "accounting.dashboard.view" },
    chart_of_accounts: { view: "accounting.chart_of_accounts.view" },
    journal_entries: { view: "accounting.journal_entries.view" },
    fiscal_periods: { view: "accounting.fiscal_periods.view" },
    settings: { view: "accounting.settings.view" },
    account_mappings: { view: "accounting.account_mappings.view" },
    export_queue: { view: "accounting.export_queue.view" },
    general_ledger: { view: "accounting.general_ledger.view" },
    trial_balance: { view: "accounting.trial_balance.view" },
    profit_loss: { view: "accounting.profit_loss.view" },
    balance_sheet: { view: "accounting.balance_sheet.view" },
    cash_flow: { view: "accounting.cash_flow.view" },
    accounts_receivable: { view: "accounting.accounts_receivable.view" },
    accounts_payable: { view: "accounting.accounts_payable.view" },
    expenses: { view: "accounting.expenses.view" },
    bank_reconciliation: {
      view: "accounting.bank_reconciliation.view",
      manage: "accounting.bank_reconciliation.manage",
    },
  },
  reports: {
    hub: { view: "reports.hub.view" },
    daily_sales: { view: "reports.daily_sales.view" },
    sales_by_product: { view: "reports.sales_by_product.view" },
    sales_by_supplier: { view: "reports.sales_by_supplier.view" },
    sales_by_user: { view: "reports.sales_by_user.view" },
    sales_by_customer: { view: "reports.sales_by_customer.view" },
    sales_by_channel: { view: "reports.sales_by_channel.view" },
    sales_pipeline: { view: "reports.sales_pipeline.view" },
    category_sales: { view: "reports.category_sales.view" },
    mobile_route_sales: { view: "reports.mobile_route_sales.view" },
    dispatch_trips: { view: "reports.dispatch_trips.view" },
    trip_cash_settlement: { view: "reports.trip_cash_settlement.view" },
    pod_compliance: { view: "reports.pod_compliance.view" },
    driver_deliveries: { view: "reports.driver_deliveries.view" },
    ar_aging: { view: "reports.ar_aging.view" },
    credit_outstanding: { view: "reports.credit_outstanding.view" },
    top_debtors: { view: "reports.top_debtors.view" },
    invoice_payments: { view: "reports.invoice_payments.view" },
    customer_statement: { view: "reports.customer_statement.view" },
    stock_on_hand: { view: "reports.stock_on_hand.view" },
    low_stock: { view: "reports.low_stock.view" },
    stock_movement: { view: "reports.stock_movement.view" },
    stock_chain: { view: "reports.stock_chain.view" },
    stock_valuation: { view: "reports.stock_valuation.view" },
    stock_reservations: { view: "reports.stock_reservations.view" },
    stock_transfers: { view: "reports.stock_transfers.view" },
    branch_stock_transfers: { view: "reports.branch_stock_transfers.view" },
    returns: { view: "reports.returns.view" },
    price_list: { view: "reports.price_list.view" },
    open_lpo: { view: "reports.open_lpo.view" },
    purchases_by_supplier: { view: "reports.purchases_by_supplier.view" },
    stock_receipts: { view: "reports.stock_receipts.view" },
    supplier_returns: { view: "reports.supplier_returns.view" },
    damages: { view: "reports.damages.view" },
    eod_cashier: { view: "reports.eod_cashier.view" },
    eod_report: { view: "reports.eod_report.view" },
    till_sessions: { view: "reports.till_sessions.view" },
    discount_summary: { view: "reports.discount_summary.view" },
    payment_collection: { view: "reports.payment_collection.view" },
    vat_collected: { view: "reports.vat_collected.view" },
    profit_loss: { view: "reports.profit_loss.view" },
    expenses: { view: "reports.expenses.view" },
    journal_register: { view: "reports.journal_register.view" },
    subledger_reconciliation: { view: "reports.subledger_reconciliation.view" },
    kra_receipts: { view: "reports.kra_receipts.view" },
    payroll_summary: { view: "reports.payroll_summary.view" },
    legacy_archive: { view: "reports.legacy_archive.view" },
    builder: {
      view: "reports.builder.view",
      create: "reports.builder.create",
      edit: "reports.builder.edit",
      delete: "reports.builder.delete",
    },
  },
  ai: {
    assist: { create: "ai.assist.create" },
  },
  hr: {
    manage: "hr.manage",
    employees: { view: "hr.employees.view", create: "hr.employees.create", edit: "hr.employees.edit", delete: "hr.employees.delete" },
    departments: { view: "hr.departments.view" },
    positions: { view: "hr.positions.view" },
    kpis: {
      view: "hr.kpis.view",
      create: "hr.kpis.create",
      edit: "hr.kpis.edit",
      delete: "hr.kpis.delete",
    },
    shifts: { view: "hr.shifts.view" },
    allowances: { view: "hr.allowances.view" },
    deductions: { view: "hr.deductions.view" },
    overtime: { view: "hr.overtime.view" },
    cash_advances: { view: "hr.cash_advances.view", approve: "hr.cash_advances.approve" },
    attendance: { view: "hr.attendance.view" },
    leave: { view: "hr.leave.view", approve: "hr.leave.approve" },
    payroll: { view: "hr.payroll.view", create: "hr.payroll.create", approve: "hr.payroll.approve" },
  },
  admin: {
    overview: { view: "admin.overview.view" },
    company: { view: "admin.company.view", edit: "admin.company.edit" },
    license: { view: "admin.license.view" },
    settings: { view: "admin.settings.view", edit: "admin.settings.edit" },
    branches: { view: "admin.branches.view" },
    users: { view: "admin.users.view" },
    roles: { view: "admin.roles.view", edit: "admin.roles.edit" },
    audit: { view: "admin.audit.view" },
    kra_responses: { view: "admin.kra_responses.view" },
    till_printing: { view: "admin.till_printing.view", edit: "admin.till_printing.edit" },
    payment_methods: {
      view: "admin.payment_methods.view",
      create: "admin.payment_methods.create",
      edit: "admin.payment_methods.edit",
      delete: "admin.payment_methods.delete",
    },
    discount_approvals: { approve: "admin.discount_approvals.approve" },
    notifications: { view: "admin.notifications.view" },
  },
};

export function reportPermissionCode(reportKey) {
  const map = {
    "daily-sales": P.reports.daily_sales.view,
    "sales-by-product": P.reports.sales_by_product.view,
    "sales-by-supplier": P.reports.sales_by_supplier.view,
    "sales-by-user": P.reports.sales_by_user.view,
    "sales-by-customer": P.reports.sales_by_customer.view,
    "sales-by-channel": P.reports.sales_by_channel.view,
    "sales-pipeline": P.reports.sales_pipeline.view,
    "category-sales": P.reports.category_sales.view,
    "items-currently-in-stock": P.inventory.stock.view,
    "stock-on-hand": P.reports.stock_on_hand.view,
    "profit-loss": P.reports.profit_loss.view,
    "top-debtors": P.reports.top_debtors.view,
    "credit-outstanding": P.reports.credit_outstanding.view,
    "invoice-payments": P.reports.invoice_payments.view,
    "stock-movement": P.reports.stock_movement.view,
    "stock-chain": P.reports.stock_chain.view,
    "stock-valuation": P.reports.stock_valuation.view,
    "stock-reservations": P.reports.stock_reservations.view,
    "stock-transfers": P.reports.stock_transfers.view,
    "branch-stock-transfers": P.reports.branch_stock_transfers.view,
    returns: P.reports.returns.view,
    "price-list": P.reports.price_list.view,
    "low-stock": P.reports.low_stock.view,
    "open-lpo": P.reports.open_lpo.view,
    "purchases-by-supplier": P.reports.purchases_by_supplier.view,
    "stock-receipts": P.reports.stock_receipts.view,
    "supplier-returns": P.reports.supplier_returns.view,
    damages: P.reports.damages.view,
    "vat-collected": P.reports.vat_collected.view,
    "till-sessions": P.reports.till_sessions.view,
    "eod-cashier": P.reports.eod_cashier.view,
    "eod-report": P.reports.eod_report.view,
    "discount-summary": P.reports.discount_summary.view,
    "payment-collection": P.reports.payment_collection.view,
    expenses: P.reports.expenses.view,
    "payroll-summary": P.hr.payroll.view,
    "leave-balance": P.hr.leave.view,
    "statutory-deductions": P.hr.payroll.view,
    "bank-transfer": P.hr.payroll.view,
    "staff-turnover": P.hr.employees.view,
    headcount: P.hr.employees.view,
    "contract-expiry": P.hr.employees.view,
    "hr-dashboard-kpi": P.hr.employees.view,
    "general-ledger": P.accounting.general_ledger.view,
    "trial-balance": P.accounting.trial_balance.view,
    "balance-sheet": P.accounting.balance_sheet.view,
    "profit-loss-gl": P.accounting.profit_loss.view,
    "cash-flow": P.accounting.cash_flow.view,
    "accounts-receivable": P.accounting.accounts_receivable.view,
    "accounts-payable": P.accounting.accounts_payable.view,
    "subledger-reconciliation": P.reports.subledger_reconciliation.view,
    "customer-statement": P.reports.customer_statement.view,
    "audit-trail": P.admin.audit.view,
    "kra-receipts": P.reports.kra_receipts.view,
    "mobile-route-sales": P.reports.mobile_route_sales.view,
    "dispatch-trips": P.reports.dispatch_trips.view,
    "trip-cash-settlement": P.reports.trip_cash_settlement.view,
    "pod-compliance": P.reports.pod_compliance.view,
    "driver-deliveries": P.reports.driver_deliveries.view,
    "legacy-archive": P.reports.legacy_archive.view,
    "journal-register": P.reports.journal_register.view,
    "ar-aging": P.reports.ar_aging.view,
  };
  return map[reportKey] ?? P.reports.hub.view;
}

const ACCOUNTING_REPORT_KEYS = new Set([
  "general-ledger",
  "trial-balance",
  "balance-sheet",
  "profit-loss-gl",
  "cash-flow",
  "accounts-receivable",
  "accounts-payable",
  "journal-register",
]);

const HR_REPORT_KEY_SET = new Set(HR_REPORT_KEYS);

function canViewHrReport(reportKey, hasPermission) {
  const code = reportPermissionCode(reportKey);
  return (
    hasPermission(code) ||
    hasPermission(P.hr.payroll.view) ||
    hasPermission(P.hr.leave.view) ||
    hasPermission(P.hr.employees.view) ||
    hasPermission(P.reports.hub.view)
  );
}

/** @param {(code: string) => boolean} hasPermission */
export function canViewReport(reportKey, hasPermission) {
  if (reportKey === "stock-on-hand") {
    return canViewReport("items-currently-in-stock", hasPermission);
  }
  if (HR_REPORT_KEY_SET.has(reportKey)) {
    return canViewHrReport(reportKey, hasPermission);
  }
  if (reportKey === "items-currently-in-stock") {
    return (
      hasPermission(P.inventory.stock.view) ||
      hasPermission(P.reports.stock_on_hand.view) ||
      hasPermission(P.reports.hub.view)
    );
  }
  if (reportKey === "customer-statement") {
    return (
      hasPermission(P.reports.customer_statement.view) ||
      hasPermission(P.customers.customers.view) ||
      hasPermission(P.reports.hub.view)
    );
  }
  if (reportKey === "supplier-statement") {
    return (
      hasPermission(P.purchasing.suppliers.view) ||
      hasPermission(P.reports.hub.view)
    );
  }
  if (reportKey === "audit-trail") {
    return hasPermission(P.admin.audit.view) || hasPermission(P.reports.hub.view);
  }
  if (ACCOUNTING_REPORT_KEYS.has(reportKey)) {
    return hasPermission(reportPermissionCode(reportKey)) || hasPermission(P.reports.hub.view);
  }
  return (
    hasPermission(reportPermissionCode(reportKey)) ||
    hasPermission(P.reports.hub.view)
  );
}
