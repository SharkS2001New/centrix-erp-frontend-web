import { formatOrgNumber } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";
import { currentMonthDateRange } from "@/lib/dashboard-dates";

export const ACCOUNT_TYPES = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Income" },
  { value: "expense", label: "Expense" },
];

export function accountTypeLabel(type) {
  return ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type ?? "—";
}

/** Default from/to for accounting reports and registers (current calendar month). */
export function defaultAccountingDateRange() {
  return currentMonthDateRange();
}

export function formatAccountingAmount(value, settings = GENERAL_DEFAULTS) {
  if (value == null || value === "") return "—";
  return formatOrgNumber(value, settings);
}

export function journalStatusLabel(status) {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "posted") return "Posted";
  if (normalized === "void") return "Reversed";
  if (normalized === "draft") return "Draft";
  return status ?? "—";
}

export function nextJournalEntryNumber(entries) {
  const last = (entries ?? [])
    .map((e) => e.entry_number)
    .filter((n) => /^JE\d+$/i.test(String(n)))
    .map((n) => parseInt(String(n).replace(/^JE/i, ""), 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)[0];

  const next = (last ?? 0) + 1;
  return `JE${String(next).padStart(4, "0")}`;
}

export function accountOptionLabel(account) {
  if (!account) return "—";
  return `${account.account_code} — ${account.account_name}`;
}

export function lineTotals(lines) {
  const debit = (lines ?? []).reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
  const credit = (lines ?? []).reduce((sum, line) => sum + Number(line.credit ?? 0), 0);
  return {
    debit: Math.round(debit * 100) / 100,
    credit: Math.round(credit * 100) / 100,
    balanced: Math.abs(debit - credit) < 0.005,
  };
}

export function splitJournalDescription(description) {
  const text = String(description ?? "");
  const parts = text.split("\n\n");
  if (parts.length <= 1) {
    return { description: text, memo: "" };
  }
  return {
    description: parts[0] ?? "",
    memo: parts.slice(1).join("\n\n"),
  };
}

export function joinJournalDescription(description, memo) {
  const main = String(description ?? "").trim();
  const extra = String(memo ?? "").trim();
  if (!extra) return main || null;
  if (!main) return extra;
  return `${main}\n\n${extra}`;
}
