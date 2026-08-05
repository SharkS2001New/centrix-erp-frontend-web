import { apiRequest } from "@/lib/api";

const SESSION_STORAGE_KEY = "pos_erp_active_session";

export function formatTillKes(value) {
  if (value == null || value === "") return "KES 0";
  return `KES ${Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function formatTillKesExact(value) {
  if (value == null || value === "") return "KES 0.00";
  return `KES ${Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Cash movement options for float details (expenses cover petty cash outflows). */
export const CASH_MOVEMENT_OPTIONS = [
  {
    value: "drop",
    label: "Safe drop",
    hint: "Move till cash into the safe so the drawer does not hold too much.",
  },
  {
    value: "pay_in",
    label: "Cash in",
    hint: "Put extra cash into the till (for example change top-up from the safe).",
  },
];

export function cashMovementLabel(type) {
  const key = String(type ?? "").toLowerCase();
  if (key === "drop") return "Safe drop";
  if (key === "pay_in") return "Cash in";
  if (key === "pay_out") return "Pay out";
  return key.replace(/_/g, " ") || "—";
}

export function cashMovementHint(type) {
  return CASH_MOVEMENT_OPTIONS.find((opt) => opt.value === type)?.hint ?? "";
}

/** Expected closing balance: opening float + total sales − expenses (± movements). */
export function resolveExpectedNetSales({
  openingFloat,
  totalSales,
  debtorCollections = 0,
  expenses = 0,
  cashMovementsIn = 0,
  cashMovementsOut = 0,
  expectedNetSales,
} = {}) {
  if (expectedNetSales != null && expectedNetSales !== "") {
    return Number(expectedNetSales);
  }
  // Legacy x/zreport_summary: ORDTTL + DBTTL + FLOATTTL − EXPTTL
  return (
    Number(openingFloat ?? 0)
    + Number(totalSales ?? 0)
    + Number(debtorCollections ?? 0)
    - Number(expenses ?? 0)
    - Number(cashMovementsOut ?? 0)
    + Number(cashMovementsIn ?? 0)
  );
}

/** @deprecated Use resolveExpectedNetSales — float is added, not subtracted. */
export function resolveNetSalesMinusFloat({
  netSales,
  openingFloat,
  netSalesMinusFloat,
  expenses = 0,
} = {}) {
  if (netSalesMinusFloat != null && netSalesMinusFloat !== "") {
    return Number(netSalesMinusFloat);
  }
  return resolveExpectedNetSales({
    openingFloat,
    totalSales: netSales,
    expenses,
  });
}

export const MAX_BRANCH_TILLS = 10;

export function tillDisplayName(till) {
  if (!till) return "—";
  return till.till_name?.trim() || till.till_number || `Till #${till.id}`;
}

export function tillCode(till) {
  return till?.till_number ?? "—";
}

/** Till number/label for X/Z reports — prefers till_number, never blank when session has a till. */
export function resolveTillReportNo({ tillName = null, till = null, session = null, report = null } = {}) {
  const candidates = [
    till?.till_number,
    report?.till?.till_number,
    session?.till_number,
    session?.till?.till_number,
    tillName,
    till?.till_name,
    report?.till?.till_name,
    session?.till_name,
    session?.till?.till_name,
    till ? tillDisplayName(till) : null,
    session?.till_id != null ? `Till #${session.till_id}` : null,
    till?.id != null ? `Till #${till.id}` : null,
  ];

  for (const value of candidates) {
    const text = String(value ?? "").trim();
    if (text && text !== "—") return text;
  }

  return "—";
}

/** Parse Till01 → 1, else null. */
export function parseTillNumber(value) {
  const match = String(value ?? "").trim().match(/^Till(\d+)$/i);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Next free Till01–Till10 label for the branch.
 * Locked tills (assigned cashier_id) still occupy their slot number.
 * Returns null when Till01–Till10 all exist.
 */
export function suggestNextTillDefaults(existingTills = []) {
  const used = new Set();
  for (const till of existingTills) {
    for (const value of [till?.till_name, till?.till_number]) {
      const n = parseTillNumber(value);
      if (n != null && n >= 1 && n <= MAX_BRANCH_TILLS) used.add(n);
    }
  }
  for (let n = 1; n <= MAX_BRANCH_TILLS; n += 1) {
    if (!used.has(n)) {
      const label = `Till${String(n).padStart(2, "0")}`;
      return { till_number: label, till_name: label };
    }
  }
  return null;
}

export function normalizeTillCode(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** True when till_number or till_name already exists at the same branch. */
export function isDuplicateTillCode(existingTills, branchId, tillCode, excludeTillId = null) {
  const code = normalizeTillCode(tillCode);
  if (!code || branchId == null || branchId === "") return false;

  return (existingTills ?? []).some((till) => {
    if (excludeTillId != null && Number(till.id) === Number(excludeTillId)) return false;
    if (Number(till.branch_id) !== Number(branchId)) return false;
    return (
      normalizeTillCode(till.till_number) === code ||
      normalizeTillCode(till.till_name) === code
    );
  });
}

/** True when the till is unlocked, or locked to this cashier. Locked-to-other = not available. */
export function isTillAvailableForCashier(till, userId) {
  if (!till) return false;
  if (till.lock_mode === "computer") return true;
  if (till.cashier_id == null || till.cashier_id === "") return true;
  return Number(till.cashier_id) === Number(userId);
}

/** Till locked to this computer/device at a branch, if any. */
export function findComputerLockedTill(tills, deviceIdentifier, branchId = null) {
  const device = normalizeDeviceIdentifier(deviceIdentifier).toLowerCase();
  if (!device) return null;
  return (
    (tills ?? []).find((till) => {
      if (till.lock_mode !== "computer") return false;
      if (branchId != null && Number(till.branch_id) !== Number(branchId)) return false;
      return normalizeDeviceIdentifier(till.ip_address).toLowerCase() === device;
    }) ?? null
  );
}

function normalizeDeviceIdentifier(value) {
  return String(value ?? "").trim();
}

export function tillLockLabel(till, userById = null) {
  if (!till) return null;
  if (till.lock_mode === "computer" && till.ip_address) {
    return `Computer: ${till.ip_address}`;
  }
  if ((till.lock_mode === "user" || till.cashier_id) && till.cashier_id) {
    const user = userById?.get?.(till.cashier_id);
    const name = user?.full_name ?? user?.username ?? `User #${till.cashier_id}`;
    return `User: ${name}`;
  }
  return null;
}

/** Map till_id → list of open sessions (supports multi-session on computer-locked tills). */
export function groupOpenSessionsByTill(sessions) {
  const map = new Map();
  for (const session of sessions ?? []) {
    if (String(session.status).toLowerCase() !== "open" || session.till_id == null) continue;
    const list = map.get(session.till_id) ?? [];
    list.push(session);
    map.set(session.till_id, list);
  }
  return map;
}

/** Cashier's locked till at a branch, if any. */
export function findAssignedTillForCashier(tills, userId, branchId = null) {
  return (tills ?? []).find((till) => {
    if (Number(till.cashier_id) !== Number(userId)) return false;
    if (till.lock_mode === "computer") return false;
    if (branchId != null && Number(till.branch_id) !== Number(branchId)) return false;
    return true;
  }) ?? null;
}

function tillSortKey(till) {
  return parseTillNumber(till?.till_name) ?? parseTillNumber(till?.till_number) ?? 999;
}

/**
 * Pick till for declare-float / POS login:
 * 1) Computer-locked till for this device (if any)
 * 2) Cashier's user-locked till (if any)
 * 3) Lowest free (unlocked) Till01–Till10 without an open session by someone else
 * 4) Else suggest creating the next free Till01–Till10 slot (null if all 10 exist)
 * Never auto-picks a till locked to another user.
 */
export function pickBranchTillForCashier({ branchId, tills = [], openSessions = [], userId, deviceIdentifier = null }) {
  if (!branchId) {
    return { till: tills[0] ?? null, suggested: null };
  }

  const openByTill = indexOpenSessionsByTill(openSessions);
  const branchAllTills = tills
    .filter((t) => Number(t.branch_id) === Number(branchId))
    .slice()
    .sort((a, b) => tillSortKey(a) - tillSortKey(b));
  const branchTills = branchAllTills.filter((t) => t.is_active !== false);

  const computerTill = findComputerLockedTill(branchAllTills, deviceIdentifier, branchId);
  if (computerTill) {
    const ownOpen = openSessions.find(
      (s) =>
        Number(s.till_id) === Number(computerTill.id)
        && Number(s.cashier_id) === Number(userId)
        && ["open", "suspended"].includes(String(s.status).toLowerCase()),
    );
    if (ownOpen || !openByTill.has(computerTill.id) || computerTill.lock_mode === "computer") {
      return { till: computerTill, suggested: null };
    }
  }

  const assignedTill = findAssignedTillForCashier(branchAllTills, userId, branchId);
  if (assignedTill && assignedTill.lock_mode !== "computer") {
    const open = openByTill.get(assignedTill.id);
    if (!open || Number(open.cashier_id) === Number(userId)) {
      return { till: assignedTill, suggested: null };
    }
    return { till: null, suggested: null };
  }

  // Auto-pick only unlocked tills (cashier_id null, not computer-locked).
  for (const till of branchTills) {
    if (till.lock_mode === "computer") continue;
    if (till.cashier_id != null && till.cashier_id !== "") continue;
    const open = openByTill.get(till.id);
    if (!open || Number(open.cashier_id) === Number(userId)) {
      return { till, suggested: null };
    }
  }

  return {
    till: null,
    suggested: suggestNextTillDefaults(branchTills),
  };
}

/** Create a till for the branch — only call after float is declared / when auto-assign needs a new slot. */
export async function createBranchTill({ branchId, existingTills = [], suggested = null, cashierId = null }) {
  if (cashierId != null) {
    const assigned = findAssignedTillForCashier(existingTills, cashierId, branchId);
    if (assigned) {
      throw new Error(`You are already assigned to ${tillDisplayName(assigned)}.`);
    }
  }

  const branchTills = (existingTills ?? []).filter(
    (t) => Number(t.branch_id) === Number(branchId),
  );
  let next = suggested ?? suggestNextTillDefaults(branchTills);
  if (!next) {
    throw new Error(
      "All tills Till01–Till10 are in use at this branch. Unlock a till or ask an admin to reassign.",
    );
  }

  for (let attempt = 0; attempt < MAX_BRANCH_TILLS; attempt += 1) {
    if (!isDuplicateTillCode(existingTills, branchId, next.till_number)) {
      try {
        const created = await apiRequest("/tills", {
          method: "POST",
          body: {
            branch_id: branchId,
            till_number: next.till_number,
            till_name: next.till_name,
            is_active: true,
            ...(cashierId != null ? { cashier_id: cashierId } : {}),
          },
        });
        if (cashierId != null && created?.id && Number(created.cashier_id) !== Number(cashierId)) {
          return await apiRequest(`/tills/${created.id}`, {
            method: "PUT",
            body: { cashier_id: cashierId },
          });
        }
        return created;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.toLowerCase().includes("already exists") || attempt >= MAX_BRANCH_TILLS - 1) {
          throw error;
        }
      }
    }

    next = suggestNextTillDefaults([
      ...branchTills,
      { till_number: next.till_number, till_name: next.till_name },
    ]);
    if (!next) {
      throw new Error(
        "All tills Till01–Till10 are in use at this branch. Unlock a till or ask an admin to reassign.",
      );
    }
  }

  throw new Error("Could not allocate a unique till code for this branch.");
}

/** Morning / opening float — first entry declared when the cashier opened the session. */
export function openingFloatAmount(session) {
  if (!session) return 0;
  const entries = normalizeFloatEntries(session.float_breakdown);
  if (entries.length > 0) return Number(entries[0].new_float ?? 0);
  return Number(session.working_amount ?? 0);
}

/** Normalize X/Z/close-session API payloads into { session, report, variance }. */
export function resolveTillReportBundle(source) {
  if (!source) {
    return { session: null, report: null, variance: null };
  }

  const nested =
    source.report && typeof source.report === "object" && !Array.isArray(source.report)
      ? source.report
      : null;
  const session = source.session ?? nested?.session ?? null;
  const report = {
    ...(nested ?? {}),
    sales: nested?.sales ?? source.sales ?? {},
    till: nested?.till ?? source.till ?? {},
    payments: nested?.payments ?? source.payments ?? [],
    expected_cash: nested?.expected_cash ?? source.expected_cash,
    float_entries: nested?.float_entries ?? source.float_entries,
    cash_movements: nested?.cash_movements ?? source.cash_movements,
    session_expenses: nested?.session_expenses ?? source.session_expenses,
  };

  return {
    session,
    report,
    variance: source.variance ?? null,
  };
}

const TILL_PAYMENT_COLUMN_ROWS = [
  { method_code: "CASH", method_name: "Cash", column: "cash" },
  { method_code: "MPESA", method_name: "M-Pesa", column: "mpesa" },
  { method_code: "EQUITY", method_name: "Equity", column: "equity" },
  { method_code: "KCB", method_name: "KCB", column: "kcb" },
];

/** Merge sales-column tenders with sale_payments rows (matches EOD + backend X/Z). */
export function resolveTillPaymentSummary(report) {
  const payments = Array.isArray(report?.payments) ? report.payments : [];
  const normalizedPayments = payments
    .map((row) => ({
      method_code: String(row.method_code ?? "").toUpperCase(),
      method_name: row.method_name ?? row.method_code ?? "Payment",
      total: Number(row.total ?? 0),
    }))
    .filter((row) => row.method_code && row.total > 0);

  if (normalizedPayments.length > 0) {
    return normalizedPayments.sort((a, b) => b.total - a.total);
  }

  const sales = report?.sales ?? {};
  const byCode = new Map();

  for (const spec of TILL_PAYMENT_COLUMN_ROWS) {
    const total = Number(sales[spec.column] ?? 0);
    if (total > 0) {
      byCode.set(spec.method_code, {
        method_code: spec.method_code,
        method_name: spec.method_name,
        total,
      });
    }
  }

  if (
    !byCode.has("EQUITY")
    && !byCode.has("KCB")
    && Number(sales.bank) > 0
  ) {
    byCode.set("BANK", {
      method_code: "BANK",
      method_name: "Bank",
      total: Number(sales.bank),
    });
  }

  return [...byCode.values()].sort((a, b) => b.total - a.total);
}

/** Fixed payment lines for X/Z till reports (always show all four tenders). */
export const TILL_REPORT_PAYMENT_LINES = [
  { method_code: "CASH", label: "Cash payment" },
  { method_code: "MPESA", label: "M-Pesa payments" },
  { method_code: "EQUITY", label: "Equity payment" },
  { method_code: "KCB", label: "K.C.B payment" },
];

export function resolveTillReportPaymentLines(report) {
  const totals = new Map(
    resolveTillPaymentSummary(report).map((row) => [row.method_code, row.total]),
  );
  return TILL_REPORT_PAYMENT_LINES.map((spec) => ({
    ...spec,
    total: Number(totals.get(spec.method_code) ?? 0),
  }));
}

/** Sales summary for till X/Z — Gross sales and Expected Amount (closing balance). */
export function resolveTillSalesSummaryRows(report, _session, { showFloatBreakdown: _showFloatBreakdown = true } = {}) {
  const sales = report?.sales ?? {};
  const till = report?.till ?? {};
  const sessionExpenses = Number(report?.session_expenses ?? till?.session_expenses ?? 0);
  const grossSales = Number(sales.gross_sales ?? sales.net_sales ?? sales.net ?? 0);
  const netSales = Number(sales.net_sales ?? sales.gross_sales ?? sales.net ?? 0);
  const openingFloat = Number(till?.opening_float ?? _session?.working_amount ?? 0);
  const movements = Array.isArray(report?.cash_movements) ? report.cash_movements : [];
  let cashIn = 0;
  let cashOut = 0;
  for (const row of movements) {
    const amount = Number(row?.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const type = String(row?.type ?? "").toLowerCase();
    if (type === "pay_in") cashIn += amount;
    else if (type === "drop" || type === "pay_out") cashOut += amount;
  }
  const expectedAmount = resolveExpectedNetSales({
    openingFloat,
    totalSales: netSales,
    debtorCollections: Number(sales.debtor_collections ?? sales.invoice_sales ?? 0),
    expenses: sessionExpenses,
    cashMovementsIn: cashIn,
    cashMovementsOut: cashOut,
    expectedNetSales: report?.expected_net_sales ?? report?.expected_cash ?? sales.expected_net_sales,
  });

  return [
    {
      label: "Gross sales",
      amount: grossSales,
    },
    {
      label: "Expected Amount",
      amount: expectedAmount,
    },
  ];
}

/** Live cash position for an active session; 0 when closed or no session. */
export function currentFloatAmount(session, reportPayload) {
  if (!session || String(session.status).toLowerCase() !== "open") return 0;
  const { report } = resolveTillReportBundle(reportPayload);
  if (report?.expected_cash != null) return Number(report.expected_cash);
  return Number(session.working_amount ?? 0);
}

export function formatSessionTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("en-KE", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatSessionDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function sessionDurationLabel(openedAt, closedAt = null) {
  if (!openedAt) return "—";
  const start = new Date(openedAt);
  const end = closedAt ? new Date(closedAt) : new Date();
  const mins = Math.max(0, Math.round((end - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function varianceLabel(variance) {
  const v = Number(variance ?? 0);
  if (Math.abs(v) < 0.01) return { text: "Balanced", tone: "balanced" };
  if (v < 0) return { text: "Shortage", tone: "shortage" };
  return { text: "Surplus", tone: "surplus" };
}

/** Map till_id → open session row */
export function indexOpenSessionsByTill(sessions) {
  const map = new Map();
  for (const s of sessions ?? []) {
    if (String(s.status).toLowerCase() === "open" && s.till_id != null) {
      map.set(s.till_id, s);
    }
  }
  return map;
}

export function tillStatusLabel(till, openSessionByTill) {
  const open = openSessionByTill?.get(till.id);
  if (open) return "Active";
  if (till.is_active === false) return "Inactive";
  return "Closed";
}

export function tillStatusTone(till, openSessionByTill) {
  const label = tillStatusLabel(till, openSessionByTill);
  if (label === "Active") return "active";
  if (label === "Inactive") return "inactive";
  return "closed";
}

export function getStoredActiveSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredActiveSession(session) {
  if (typeof window === "undefined") return;
  if (!session) {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredActiveSession() {
  setStoredActiveSession(null);
}

export const DEFAULT_CLOSE_REASON = "End of shift";

export const CLOSE_REASONS = [
  "End of shift",
  "Cash discrepancy",
  "Till handover",
  "System reconciliation",
  "Other",
];

/** Payment types for float entries — matches legacy comboTypeOfFloat. */
export const FLOAT_PAYMENT_TYPES = [
  "CASH",
  "MPESA",
  "EQUITY",
  "KCB",
  "ECO_BANK",
  "BANK",
  "CHEQUE",
  "OTHER",
];

/** Human-readable label for float payment type codes. */
export function floatPaymentTypeLabel(type) {
  const key = String(type ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  const labels = {
    CASH: "Cash",
    MPESA: "M-Pesa",
    "M-PESA": "M-Pesa",
    EQUITY: "Equity",
    KCB: "KCB",
    ECO_BANK: "ECO Bank",
    BANK: "Bank",
    CHEQUE: "Cheque",
    OTHER: "Other",
  };
  return labels[key] ?? (key ? key.replace(/_/g, " ") : "Other");
}

/**
 * Normalize float_breakdown from API (legacy array or map format).
 * Legacy shape: [{ new_float, date_added, payment_type }, ...]
 */
export function normalizeFloatEntries(breakdown) {
  if (!breakdown) return [];
  if (Array.isArray(breakdown)) {
    return breakdown
      .filter((entry) => entry && typeof entry === "object")
      .map((entry) => ({
        new_float: Number(entry.new_float ?? 0),
        payment_type: String(entry.payment_type ?? "CASH").toUpperCase(),
        date_added: entry.date_added ?? null,
      }));
  }
  if (typeof breakdown === "object") {
    return Object.entries(breakdown)
      .filter(([, amount]) => Number(amount) > 0)
      .map(([type, amount]) => ({
        new_float: Number(amount),
        payment_type: String(type).toUpperCase(),
        date_added: null,
      }));
  }
  return [];
}

export function sumFloatEntries(entries) {
  return (entries ?? []).reduce((sum, entry) => sum + Number(entry.new_float ?? 0), 0);
}

export function formatFloatEntryDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
