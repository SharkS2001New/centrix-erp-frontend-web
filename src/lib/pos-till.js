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

/** Net sales after deducting operating float (always >= 0). */
export function resolveNetSalesMinusFloat({
  netSales,
  openingFloat,
  netSalesMinusFloat,
} = {}) {
  if (netSalesMinusFloat != null && netSalesMinusFloat !== "") {
    return Math.max(0, Number(netSalesMinusFloat));
  }
  return Math.max(0, Number(netSales ?? 0) - Number(openingFloat ?? 0));
}

export const MAX_BRANCH_TILLS = 10;

export function tillDisplayName(till) {
  if (!till) return "—";
  return till.till_name?.trim() || till.till_number || `Till #${till.id}`;
}

export function tillCode(till) {
  return till?.till_number ?? "—";
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
  if (till.cashier_id == null || till.cashier_id === "") return true;
  return Number(till.cashier_id) === Number(userId);
}

/** Cashier's locked till at a branch, if any. */
export function findAssignedTillForCashier(tills, userId, branchId = null) {
  return (tills ?? []).find((till) => {
    if (Number(till.cashier_id) !== Number(userId)) return false;
    if (branchId != null && Number(till.branch_id) !== Number(branchId)) return false;
    return till.is_active !== false;
  }) ?? null;
}

function tillSortKey(till) {
  return parseTillNumber(till?.till_name) ?? parseTillNumber(till?.till_number) ?? 999;
}

/**
 * Pick till for declare-float / POS login:
 * 1) Cashier's locked till (if any)
 * 2) Lowest free (unlocked) Till01–Till10 without an open session by someone else
 * 3) Else suggest creating the next free Till01–Till10 slot (null if all 10 exist)
 * Never auto-picks a till locked to another user.
 */
export function pickBranchTillForCashier({ branchId, tills = [], openSessions = [], userId }) {
  if (!branchId) {
    return { till: tills[0] ?? null, suggested: null };
  }

  const openByTill = indexOpenSessionsByTill(openSessions);
  const branchTills = tills
    .filter((t) => Number(t.branch_id) === Number(branchId) && t.is_active !== false)
    .slice()
    .sort((a, b) => tillSortKey(a) - tillSortKey(b));

  const assignedTill = findAssignedTillForCashier(branchTills, userId, branchId);
  if (assignedTill) {
    const open = openByTill.get(assignedTill.id);
    if (!open || Number(open.cashier_id) === Number(userId)) {
      return { till: assignedTill, suggested: null };
    }
    return { till: null, suggested: null };
  }

  // Auto-pick only unlocked tills (cashier_id null).
  for (const till of branchTills) {
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
export const FLOAT_PAYMENT_TYPES = ["CASH", "MPESA", "EQUITY", "KCB", "BANK", "CHEQUE", "OTHER"];

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
