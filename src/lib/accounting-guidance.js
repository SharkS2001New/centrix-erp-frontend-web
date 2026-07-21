/**
 * Accounting module guide — parts, screens, workflow steps, and glossary.
 * Used by the in-app help dialog (? button in the Accounting workspace).
 */

export const ACCOUNTING_GUIDE_PARTS = [
  {
    id: "overview",
    part: 1,
    title: "Overview",
    summary: "What the Accounting module does and how it connects to sales, purchases, and payroll.",
    intro:
      "Centrix Accounting is your general ledger (GL). When enabled, everyday operations — sales, stock receipts, expenses, customer payments, supplier payments, and payroll — can automatically post journal entries. You review balances, reconcile the bank, and run financial statements from here.",
    bullets: [
      "Native ledger: journals are stored inside Centrix (Chart of accounts → Journal entries → Reports).",
      "External ledger (optional): operations queue exports to QuickBooks Online instead of posting locally.",
      "Every journal has a debit side and a credit side — total debits must equal total credits.",
      "Amounts are organization-scoped; each tenant has its own chart and sequence numbers.",
    ],
    tip: "Start at Finance overview (/accounting) for a snapshot, then work through Setup before month-end close.",
  },
  {
    id: "setup",
    part: 2,
    title: "Setup",
    summary: "Chart of accounts, fiscal periods, account codes, and auto-posting rules.",
    intro:
      "Before heavy use, confirm your chart of accounts exists and auto-posting toggles match how your business runs.",
    bullets: [
      "Chart of accounts — asset, liability, equity, revenue, and expense accounts (e.g. 1000 Cash, 2000 AP, 4000 Sales).",
      "Accounting settings — turn auto-post on/off for sales, purchases, expenses, payments, payroll, and returns.",
      "Account codes map — link payment methods (Cash, M-Pesa, Bank) to the correct GL cash/bank accounts.",
      "Fiscal periods — open/close months; posting to a closed period is blocked.",
      "Year-end close — transfers P&L balances into Retained earnings (org admin / accounting manage).",
    ],
    screens: ["chart-of-accounts", "settings", "fiscal-periods"],
    tip: "Non-production environments can seed a standard 13-account chart from Accounting settings.",
  },
  {
    id: "operations",
    part: 3,
    title: "Daily operations",
    summary: "How Backoffice, POS, and Purchasing feed the ledger automatically.",
    intro:
      "Most entries are system-generated when auto-post is enabled. You rarely need manual journals for routine trade.",
    bullets: [
      "Sales (POS / backoffice) — Dr Cash or AR, Cr Revenue (+ VAT payable). COGS/inventory when applicable.",
      "Stock receive (LPO) — Dr Inventory, Cr Accounts payable.",
      "Expenses — Dr Operating expense, Cr Cash/Bank (after approval if required).",
      "Customer payment — Dr Cash/Bank, Cr Accounts receivable.",
      "Supplier payment — Dr Accounts payable, Cr Cash/Bank.",
      "Payroll (mark paid) — Dr Payroll expense, Cr Bank + statutory liabilities.",
      "Returns — reverse revenue/VAT; credit notes when KRA device is enabled.",
    ],
    tip: "If a balance looks wrong, find the source document (sale, receipt, payment) and trace its journal in Journal entries.",
  },
  {
    id: "receivables",
    part: 4,
    title: "Accounts receivable",
    summary: "Credit sales, customer invoices, and what customers still owe.",
    intro:
      "When customers buy on credit, sales debit AR. Customer payments credit AR. Invoices formalize what's outstanding.",
    bullets: [
      "Credit sales post Dr AR at checkout or order completion.",
      "Customer invoices are created for credit sales — track invoice number, total, and amount paid.",
      "Receivables ledger — aged-style view of who owes what.",
      "Reports hub also has AR aging, top debtors, and invoice payment reports.",
      "Subledger reconciliation compares GL AR balance to the operational customer subledger.",
    ],
    screens: ["customer-invoices", "accounts-receivable"],
  },
  {
    id: "payables",
    part: 5,
    title: "Accounts payable",
    summary: "Supplier purchases, payables balance, and recording supplier payments.",
    intro:
      "Receiving stock against an LPO increases AP. Paying the supplier decreases AP and reduces bank/cash.",
    bullets: [
      "Stock receive on an LPO posts Dr Inventory, Cr AP (when auto-post purchases is on).",
      "Payables ledger — received purchases minus returns and payments per supplier.",
      "Record supplier payments under Suppliers → Payments (or supplier profile).",
      "Supplier payments post Dr AP, Cr Bank when auto-post payments is enabled.",
      "Full LPO payment can mark the purchase order as cleared.",
    ],
    screens: ["accounts-payable"],
    tip: "Supplier payments live under the Suppliers module; the GL impact appears in Payables ledger and Journal entries.",
  },
  {
    id: "ledger",
    part: 6,
    title: "General ledger",
    summary: "Manual journals, the GL report, and when to post by hand.",
    intro:
      "Use manual journal entries for adjustments, accruals, or corrections that have no operational source document.",
    bullets: [
      "Create a draft journal → add lines (account, debit, credit) → post (or submit for approval if enabled).",
      "Posted journals cannot be edited — reverse and re-enter if wrong.",
      "General ledger report — all posted lines by account and date range.",
      "Journal register (Reports) — list of journal headers with filters.",
      "Each line shows entry number, date, description, and reference (sale, expense, etc.).",
    ],
    screens: ["journal-entries", "general-ledger"],
  },
  {
    id: "banking",
    part: 7,
    title: "Bank reconciliation",
    summary: "Bank register, matching statement lines to the books, and finishing a reconciliation.",
    intro:
      "Reconciliation proves your GL bank balance matches the bank statement for a period.",
    bullets: [
      "Bank register — checkbook view with running balance and cleared/uncleared status.",
      "Start reconciliation — pick bank account, statement end date, and ending balance from the bank.",
      "Import CSV statement lines (date, description, reference, amount).",
      "Match bank lines to book transactions (or use suggested matches).",
      "Exclude lines that are not part of this period. Unmatch if you made a mistake.",
      "Add adjustment — posts a small balancing journal when difference is immaterial.",
      "Finish when difference = 0 — matched items are cleared from future reconciliations.",
    ],
    screens: ["bank-register", "bank-reconciliation"],
  },
  {
    id: "statements",
    part: 8,
    title: "Financial statements",
    summary: "Trial balance, balance sheet, profit & loss, and cash flow.",
    intro:
      "These reports roll up posted journal balances. Always reconcile the bank and subledgers before trusting month-end numbers.",
    bullets: [
      "Trial balance — all accounts with debit/credit totals; debits should equal credits.",
      "Balance sheet — assets, liabilities, and equity at a date.",
      "Profit & loss — revenue minus expenses for a period (GL-based, not just sales reports).",
      "Cash flow — operating/investing/financing view (simple or GAAP method where available).",
      "Use consistent period dates and ensure the month is not closed prematurely.",
    ],
    screens: ["trial-balance", "balance-sheet", "profit-loss", "cash-flow"],
  },
  {
    id: "external",
    part: 9,
    title: "QuickBooks export",
    summary: "Optional external ledger mode — connect QBO and export journals.",
    intro:
      "When finance settings use external accounting, Centrix queues journal payloads for QuickBooks instead of posting locally.",
    bullets: [
      "Connect QuickBooks from Admin → Finance or Accounting → Account mappings.",
      "Map local account codes to QuickBooks accounts.",
      "Export queue — pending, failed, and completed exports; retry failures after fixing mappings.",
      "Export-only — Centrix does not import changes back from QuickBooks.",
      "Use native ledger if you want all reports and bank reconciliation inside Centrix.",
    ],
    screens: ["account-mappings", "export-queue"],
    optional: true,
  },
];

export const ACCOUNTING_WORKFLOW_SCREENS = [
  {
    id: "overview",
    screen: "Finance overview",
    path: "/accounting",
    description: "Dashboard — key balances and shortcuts.",
    step: 1,
    part: "overview",
  },
  {
    id: "chart-of-accounts",
    screen: "Chart of accounts",
    path: "/accounting/chart-of-accounts",
    description: "Define GL accounts and view live balances.",
    step: 2,
    part: "setup",
  },
  {
    id: "settings",
    screen: "Accounting settings",
    path: "/platform",
    description: "Auto-post toggles and default account codes — platform administrators configure these per organization.",
    step: 3,
    part: "setup",
  },
  {
    id: "customer-invoices",
    screen: "Customer invoices",
    path: "/accounting/customer-invoices",
    description: "Credit sale invoices and payment status.",
    step: 4,
    part: "receivables",
  },
  {
    id: "accounts-receivable",
    screen: "Receivables ledger",
    path: "/accounting/accounts-receivable",
    description: "Who owes you and how much.",
    step: 5,
    part: "receivables",
  },
  {
    id: "accounts-payable",
    screen: "Payables ledger",
    path: "/accounting/accounts-payable",
    description: "What you owe suppliers after receipts and payments.",
    step: 6,
    part: "payables",
  },
  {
    id: "journal-entries",
    screen: "Journal entries",
    path: "/accounting/journal-entries",
    description: "Manual and auto-generated journals — draft, post, reverse.",
    step: 7,
    part: "ledger",
  },
  {
    id: "bank-register",
    screen: "Bank register",
    path: "/accounting/bank-register",
    description: "Running balance checkbook for bank/cash accounts.",
    step: 8,
    part: "banking",
  },
  {
    id: "bank-reconciliation",
    screen: "Bank reconciliation",
    path: "/accounting/bank-reconciliation",
    description: "Match statement to GL and finish the period.",
    step: 9,
    part: "banking",
  },
  {
    id: "trial-balance",
    screen: "Trial balance",
    path: "/accounting/trial-balance",
    description: "Verify debits equal credits before closing.",
    step: 10,
    part: "statements",
  },
  {
    id: "profit-loss",
    screen: "Profit & loss",
    path: "/accounting/profit-loss",
    description: "Income statement for the selected period.",
    step: 11,
    part: "statements",
  },
  {
    id: "balance-sheet",
    screen: "Balance sheet",
    path: "/accounting/balance-sheet",
    description: "Assets, liabilities, and equity snapshot.",
    step: 12,
    part: "statements",
  },
];

export const ACCOUNTING_WORKFLOW_STEPS = [
  {
    title: "Set up chart and rules",
    body: "Confirm chart of accounts, fiscal periods, and auto-post settings before go-live.",
    part: "setup",
  },
  {
    title: "Run daily operations",
    body: "Sell, receive stock, pay expenses, and collect payments — journals flow automatically when enabled.",
    part: "operations",
  },
  {
    title: "Review AR and AP",
    body: "Check receivables and payables ledgers against customer/supplier activity.",
    part: "receivables",
  },
  {
    title: "Reconcile the bank",
    body: "Import the bank statement, match lines, adjust if needed, and finish when difference is zero.",
    part: "banking",
  },
  {
    title: "Close the period",
    body: "Run trial balance and financial statements, then close the fiscal period.",
    part: "statements",
  },
];

export const ACCOUNTING_GLOSSARY = [
  {
    term: "General ledger (GL)",
    definition: "The complete record of all financial accounts and their posted journal lines.",
  },
  {
    term: "Chart of accounts",
    definition: "The list of GL accounts (codes, names, types) used by your organization.",
  },
  {
    term: "Journal entry",
    definition: "A balanced set of debit and credit lines posted on a date, with a description and optional source reference.",
  },
  {
    term: "Debit / Credit",
    definition: "Debit increases assets and expenses; credit increases liabilities, equity, and revenue. Every entry balances.",
  },
  {
    term: "Accounts receivable (AR)",
    definition: "Money customers owe you — increased by credit sales, reduced by customer payments.",
  },
  {
    term: "Accounts payable (AP)",
    definition: "Money you owe suppliers — increased by stock receipts, reduced by supplier payments.",
  },
  {
    term: "Auto-post",
    definition: "System-created journal when an operational event completes (sale, receipt, payment, etc.).",
  },
  {
    term: "Fiscal period",
    definition: "A calendar month (or custom range) that can be open or closed to control posting.",
  },
  {
    term: "Bank reconciliation",
    definition: "Process of matching bank statement lines to GL bank transactions until the difference is zero.",
  },
  {
    term: "Trial balance",
    definition: "Report listing every account's debits and credits — totals should match.",
  },
  {
    term: "Subledger reconciliation",
    definition: "Compares GL control accounts (AR/AP) to operational subledger totals.",
  },
];

/** @param {string} partId */
export function accountingScreensForPart(partId) {
  return ACCOUNTING_WORKFLOW_SCREENS.filter((s) => s.part === partId);
}
