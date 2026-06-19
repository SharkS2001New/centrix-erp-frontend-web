/** Feature permission codes — aligned with API config/permission_registry.php */

import { HR_REPORT_KEYS } from "@/lib/reports/hr-reports";

export const P = {
  dashboard: {
    overview: { view: "dashboard.overview.view" },
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
    sale_payments: { view: "payments.sale_payments.view", manage: "payments.sale_payments.manage" },
    customer_invoices: { view: "payments.customer_invoices.view", manage: "payments.customer_invoices.manage" },
    customer_payments: { view: "payments.customer_payments.view", manage: "payments.customer_payments.manage" },
  },
  sales: {
    dashboard: { view: "sales.dashboard.view" },
    orders: { view: "sales.orders.view", create: "sales.orders.create", edit: "sales.orders.edit", approve: "sales.orders.approve" },
    vouchers: { view: "sales.vouchers.view" },
    loyalty_cards: { view: "sales.loyalty_cards.view" },
    reservations: { view: "sales.reservations.view" },
    returns: { view: "sales.returns.view", create: "sales.returns.create" },
  },
  pos: {
    till_management: { view: "pos.till_management.view" },
    checkout: { create: "pos.checkout.create" },
    terminal: { view: "pos.terminal.view" },
    end_of_day: { view: "pos.end_of_day.view" },
  },
  inventory: {
    stock: { view: "inventory.stock.view" },
    receipts: { view: "inventory.receipts.view" },
    movements: { view: "inventory.movements.view" },
    transfers: { view: "inventory.transfers.view", create: "inventory.transfers.create" },
    damages: { view: "inventory.damages.view" },
    stock_take: { view: "inventory.stock_take.view" },
  },
  purchasing: {
    lpo: { view: "purchasing.lpo.view", approve: "purchasing.lpo.approve" },
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
    drivers: { view: "fulfillment.drivers.view" },
    vehicles: { view: "fulfillment.vehicles.view" },
    routes: { view: "fulfillment.routes.view" },
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
  },
  reports: {
    hub: { view: "reports.hub.view" },
    daily_sales: { view: "reports.daily_sales.view" },
    stock_on_hand: { view: "reports.stock_on_hand.view" },
    profit_loss: { view: "reports.profit_loss.view" },
    top_debtors: { view: "reports.top_debtors.view" },
    stock_movement: { view: "reports.stock_movement.view" },
    vat_collected: { view: "reports.vat_collected.view" },
    till_sessions: { view: "reports.till_sessions.view" },
    expenses: { view: "reports.expenses.view" },
    customer_statement: { view: "reports.customer_statement.view" },
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
    employees: { view: "hr.employees.view", edit: "hr.manage" },
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
    company: { view: "admin.company.view" },
    branches: { view: "admin.branches.view" },
    users: { view: "admin.users.view" },
    roles: { view: "admin.roles.view" },
    audit: { view: "admin.audit.view" },
    settings: { view: "admin.settings.view" },
    payment_methods: {
      view: "admin.payment_methods.view",
      create: "admin.payment_methods.create",
      edit: "admin.payment_methods.edit",
      delete: "admin.payment_methods.delete",
    },
  },
};

/** @param {string} reportKey kebab-case report route key */
export function reportPermissionCode(reportKey) {
  const map = {
    "daily-sales": P.reports.daily_sales.view,
    "stock-on-hand": P.reports.stock_on_hand.view,
    "profit-loss": P.reports.profit_loss.view,
    "top-debtors": P.reports.top_debtors.view,
    "stock-movement": P.reports.stock_movement.view,
    "vat-collected": P.reports.vat_collected.view,
    "till-sessions": P.reports.till_sessions.view,
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
    "journal-register": P.accounting.journal_entries.view,
    "subledger-reconciliation": P.accounting.general_ledger.view,
    "customer-statement": P.reports.customer_statement.view,
    "audit-trail": P.admin.audit.view,
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
  if (HR_REPORT_KEY_SET.has(reportKey)) {
    return canViewHrReport(reportKey, hasPermission);
  }
  if (reportKey === "customer-statement") {
    return (
      hasPermission(P.reports.customer_statement.view) ||
      hasPermission(P.customers.customers.view) ||
      hasPermission(P.reports.hub.view)
    );
  }
  if (reportKey === "audit-trail") {
    return hasPermission(P.admin.audit.view) || hasPermission(P.reports.hub.view);
  }
  if (ACCOUNTING_REPORT_KEYS.has(reportKey)) {
    return hasPermission(reportPermissionCode(reportKey)) || hasPermission(P.reports.hub.view);
  }
  return hasPermission(reportPermissionCode(reportKey));
}
