/** Feature permission codes — aligned with API config/permission_registry.php */

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
    vat_rates: { view: "catalogue.vat_rates.view" },
    price_history: { view: "catalogue.price_history.view" },
  },
  customers: {
    customers: { view: "customers.customers.view" },
    statements: { view: "customers.statements.view" },
  },
  sales: {
    dashboard: { view: "sales.dashboard.view" },
    orders: { view: "sales.orders.view" },
    vouchers: { view: "sales.vouchers.view" },
    loyalty_cards: { view: "sales.loyalty_cards.view" },
    reservations: { view: "sales.reservations.view" },
    returns: { view: "sales.returns.view", create: "sales.returns.create" },
  },
  pos: {
    till_management: { view: "pos.till_management.view" },
    checkout: { create: "pos.checkout.create" },
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
    lpo: { view: "purchasing.lpo.view" },
    suppliers: { view: "purchasing.suppliers.view" },
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
    employees: { view: "hr.employees.view" },
    positions: { view: "hr.positions.view" },
    shifts: { view: "hr.shifts.view" },
    allowances: { view: "hr.allowances.view" },
    deductions: { view: "hr.deductions.view" },
    overtime: { view: "hr.overtime.view" },
    cash_advances: { view: "hr.cash_advances.view" },
    attendance: { view: "hr.attendance.view" },
    leave: { view: "hr.leave.view" },
    payroll: { view: "hr.payroll.view" },
  },
  admin: {
    overview: { view: "admin.overview.view" },
    company: { view: "admin.company.view" },
    branches: { view: "admin.branches.view" },
    users: { view: "admin.users.view" },
    roles: { view: "admin.roles.view" },
    audit: { view: "admin.audit.view" },
    settings: { view: "admin.settings.view" },
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
  };
  return map[reportKey] ?? P.reports.hub.view;
}
