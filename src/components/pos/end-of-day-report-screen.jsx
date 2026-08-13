"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { filterByOrganization } from "@/lib/admin";
import { fetchBranchesCached } from "@/lib/reference-data-cache";
import { isTillFloatWorkflowEnabled, areSalesDiscountsEnabled } from "@/lib/sales-settings";
import { printHtmlDocument } from "@/lib/print-dispatch";
import { formatTillKes, formatTillKesExact, formatTillKesSigned, resolveExpectedNetSales, resolveSessionVariance, sessionHasClosedCashMaths, varianceAmountTone, TILL_REPORT_PAYMENT_LINES } from "@/lib/pos-till";
import { buildExpensesHref, expenseSummaryRowLabel } from "@/lib/expenses-link";
import {
  FilterSelect,
  FilterToolbar,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  StatCard,
  EMPTY_STATE_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  formatAppDate,
  formatAppDateTime,
  formatInTimezone,
  todayCalendarDate,
} from "@/lib/datetime";

function todayIsoDate() {
  return todayCalendarDate();
}

function formatReportDate(value) {
  return formatAppDate(value);
}

function formatReportTime(value) {
  if (!value) return "—";
  return (
    formatInTimezone(value, {
      hour: "numeric",
      minute: "2-digit",
    }) ?? "—"
  );
}

function formatDuration(start, end) {
  if (!start || !end) return "—";
  const mins = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function floatPaymentLabel(type) {
  const key = String(type ?? "").toUpperCase().replace(/\s+/g, "_");
  if (key === "MPESA" || key === "M-PESA") return "M-Pesa";
  if (key === "CASH") return "Cash";
  if (key === "EQUITY") return "Equity";
  if (key === "KCB") return "KCB";
  if (key === "ECO_BANK") return "ECO Bank";
  if (key === "BANK") return "Bank";
  if (key === "CHEQUE") return "Cheque";
  return key.replace(/_/g, " ") || "Other";
}

const PAYMENT_DONUT_COLORS = {
  cash: "#185FA5",
  mpesa: "#059669",
  equity: "#7c3aed",
  kcb: "#d97706",
  card: "#64748b",
  bank: "#7c3aed",
};

function resolvePaymentDonutSegments(payments) {
  const cash = Number(payments?.cash ?? 0);
  const mpesa = Number(payments?.mpesa ?? 0);
  const equity = Number(payments?.equity ?? 0);
  const kcb = Number(payments?.kcb ?? 0);
  const card = Number(payments?.card ?? 0);
  const bank = Number(payments?.bank ?? 0);
  const hasNamedBanks = payments?.equity != null || payments?.kcb != null;

  const segments = [
    { key: "cash", label: "Cash", value: cash, color: PAYMENT_DONUT_COLORS.cash },
    { key: "mpesa", label: "M-Pesa", value: mpesa, color: PAYMENT_DONUT_COLORS.mpesa },
  ];

  if (hasNamedBanks) {
    segments.push(
      { key: "equity", label: "Equity", value: equity, color: PAYMENT_DONUT_COLORS.equity },
      { key: "kcb", label: "KCB", value: kcb, color: PAYMENT_DONUT_COLORS.kcb },
    );
  } else if (bank > 0) {
    segments.push({ key: "bank", label: "Bank", value: bank, color: PAYMENT_DONUT_COLORS.bank });
  }

  if (card > 0) {
    segments.push({ key: "card", label: "Card", value: card, color: PAYMENT_DONUT_COLORS.card });
  }

  return segments;
}

function paymentDonutTotal(payments) {
  return resolvePaymentDonutSegments(payments).reduce((sum, s) => sum + s.value, 0);
}

/** Build conic-gradient stop list without mutating locals (eslint react-hooks/immutability). */
function conicGradientStops(segments, total) {
  const ranges = segments
    .filter((s) => s.value > 0)
    .reduce((acc, s) => {
      const pct = (s.value / total) * 100;
      const start = acc.length ? acc[acc.length - 1].end : 0;
      return [...acc, { color: s.color, start, end: start + pct }];
    }, /** @type {{ color: string, start: number, end: number }[]} */ ([]));
  return ranges.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ");
}

function PaymentDonut({ payments }) {
  const segments = resolvePaymentDonutSegments(payments);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm theme-subtext">
        No payments recorded
      </div>
    );
  }

  const stops = conicGradientStops(segments, total);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div
        className="h-36 w-36 shrink-0 rounded-full"
        style={{ background: `conic-gradient(${stops})` }}
        aria-hidden
      />
      <table className="w-full text-sm">
        <tbody>
          {segments.map((s) => {
            const pct = total > 0 ? ((s.value / total) * 100).toFixed(1) : "0.0";
            return (
              <tr key={s.key} className="border-b border-[var(--theme-border)] last:border-b-0">
                <td className="py-2 pr-3">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </td>
                <td className="py-2 text-right font-medium text-[var(--theme-text)]">{formatTillKes(s.value)}</td>
                <td className="theme-subtext py-2 pl-3 text-right">{pct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ title, children, className = "", action = null }) {
  return (
    <div className={`theme-panel rounded-xl border p-5 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="theme-heading text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value, tone = "default", bold = false }) {
  const toneClass =
    tone === "danger"
      ? "text-red-600 dark:text-red-400"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "primary"
          ? "text-[var(--theme-primary)]"
          : "text-[var(--theme-text)]";
  return (
    <div className={`flex items-center justify-between gap-3 py-2 text-sm ${bold ? "font-semibold" : ""}`}>
      <span className="theme-subtext">{label}</span>
      <span className={toneClass}>{value}</span>
    </div>
  );
}

function HighlightMetric({ label, value, variant = "primary" }) {
  const shellClass =
    variant === "danger"
      ? "theme-alert-error"
      : variant === "success"
        ? "theme-alert-success"
        : variant === "warning"
          ? "border border-[var(--theme-border)] bg-[var(--theme-surface-muted)]"
          : "border border-[var(--theme-border)] bg-[var(--theme-primary-subtle)]";
  const valueClass =
    variant === "primary"
      ? "text-[var(--theme-primary)]"
      : variant === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "";

  return (
    <div className={`rounded-lg px-4 py-3 text-center ${shellClass}`}>
      <p className="theme-subtext text-xs">{label}</p>
      <p className={`text-lg font-semibold ${valueClass || "text-[var(--theme-text)]"}`}>{value}</p>
    </div>
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function printSummaryRow(label, value, { tone = "default", bold = false } = {}) {
  const color =
    tone === "danger"
      ? "#dc2626"
      : tone === "success"
        ? "#059669"
        : tone === "primary"
          ? "#185FA5"
          : "#0f172a";
  return `<div class="row${bold ? " bold" : ""}"><span class="label">${escapeHtml(label)}</span><span style="color:${color}">${escapeHtml(value)}</span></div>`;
}

function printPaymentDonutHtml(payments) {
  const segments = resolvePaymentDonutSegments(payments);
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return `<p class="muted" style="text-align:center;padding:24px 0">No payments recorded</p>`;
  }
  const stops = conicGradientStops(segments, total);
  const legend = segments
    .map((s) => {
      const pct = ((s.value / total) * 100).toFixed(1);
      return `<tr>
        <td><span class="swatch" style="background:${s.color}"></span>${escapeHtml(s.label)}</td>
        <td class="num">${escapeHtml(formatTillKes(s.value))}</td>
        <td class="pct">${pct}%</td>
      </tr>`;
    })
    .join("");
  return `<div class="donut-wrap">
    <div class="donut" style="background:conic-gradient(${stops})"></div>
    <table class="legend"><tbody>${legend}</tbody></table>
  </div>`;
}

function printKpiCard(label, value, hint) {
  return `<div class="kpi">
    <p class="kpi-label">${escapeHtml(label)}</p>
    <p class="kpi-value">${escapeHtml(value)}</p>
    ${hint ? `<p class="kpi-hint">${escapeHtml(hint)}</p>` : ""}
  </div>`;
}

/**
 * Print / PDF layout that mirrors the on-screen End of Day report, sized for A4.
 */
async function printEodReport(report, meta) {
  const s = report?.summary ?? {};
  const payments = report?.payments ?? {};
  const showFloat = Boolean(meta.showFloat);
  const showDiscounts = Boolean(meta.showDiscounts);
  const grossEx =
    meta.grossSalesExVat != null
      ? Number(meta.grossSalesExVat)
      : Number(s.gross_sales_ex_vat ?? Math.max(0, Number(s.gross_sales ?? 0) - Number(s.total_vat ?? 0)));
  const netEx =
    meta.netSalesExVat != null
      ? Number(meta.netSalesExVat)
      : Number(s.net_sales_ex_vat ?? Math.max(0, Number(s.net_sales ?? 0) - Number(s.total_vat ?? 0)));
  const totalExpenses = Number(meta.totalExpenses ?? s.session_expenses ?? 0);
  const expectedNet =
    meta.expectedNetSales != null
      ? Number(meta.expectedNetSales)
      : resolveExpectedNetSales({
          openingFloat: s.opening_float,
          totalSales: s.net_sales,
          debtorCollections: s.paid_debtors,
          expenses: totalExpenses,
          cashMovementsIn: s.cash_movements_in,
          cashMovementsOut: s.cash_movements_out,
          expectedNetSales: s.expected_net_sales ?? s.net_cash_expected,
        });
  const paymentTotal = paymentDonutTotal(payments);

  const title = meta.isMonthly ? "Monthly Sales Report" : "End of Day Sales Report";
  const periodLine = escapeHtml(
    [
      meta.branchName ?? "All branches",
      meta.periodLabel,
      meta.cashierName ?? "All cashiers",
      meta.sessionLabel,
    ]
      .filter(Boolean)
      .join(" · "),
  );

  const kpiCards = [
    printKpiCard("Gross sales (ex VAT)", formatTillKes(grossEx), "Before VAT"),
    printKpiCard("VAT collected", formatTillKes(s.total_vat), "Tax on sales"),
    printKpiCard("Gross sales (incl VAT)", formatTillKes(s.gross_sales), "Including VAT"),
    printKpiCard("Total transactions", String(s.transactions ?? 0), "All transactions"),
    ...(showDiscounts
      ? [printKpiCard("Total discounts", formatTillKes(s.total_discounts), "Discounts given")]
      : []),
    printKpiCard("Total refunds", formatTillKes(s.total_refunds), "Info only — already in order total"),
    printKpiCard("Net sales (incl VAT)", formatTillKes(s.net_sales), "Order total (incl VAT)"),
    printKpiCard("Net sales (ex VAT)", formatTillKes(netEx), "Net after VAT"),
    ...(showFloat
      ? [
          printKpiCard(
            "Expected net sales",
            formatTillKes(expectedNet),
            "Paid sales + paid debtors + float − expenses",
          ),
        ]
      : []),
    printKpiCard("Total expenses", formatTillKes(totalExpenses), "Till session expenses"),
  ].join("");

  let salesRows = [
    printSummaryRow("Gross sales (ex VAT)", formatTillKes(grossEx)),
    printSummaryRow("VAT collected", formatTillKes(s.total_vat), { tone: "primary" }),
    printSummaryRow("Gross sales (incl VAT)", formatTillKes(s.gross_sales), { bold: true }),
  ];
  if (showDiscounts) {
    salesRows.push(
      printSummaryRow("Total discounts", `-${formatTillKes(s.total_discounts)}`, { tone: "danger" }),
    );
  }
  salesRows.push(
    printSummaryRow("Product returns (info)", formatTillKes(s.total_refunds)),
    `<div class="divider"></div>`,
    printSummaryRow("Net sales (incl VAT)", formatTillKes(s.net_sales), {
      tone: "success",
      bold: true,
    }),
    printSummaryRow("Net sales (ex VAT)", formatTillKes(netEx)),
  );
  if (showFloat) {
    salesRows.push(printSummaryRow("Opening float", formatTillKes(s.opening_float)));
  }
  if (Number(s.cash_movements_out) > 0) {
    salesRows.push(
      printSummaryRow("Safe drops", `-${formatTillKes(s.cash_movements_out)}`, { tone: "danger" }),
    );
  }
  if (Number(s.cash_movements_in) > 0) {
    salesRows.push(
      printSummaryRow("Cash in", formatTillKes(s.cash_movements_in), { tone: "success" }),
    );
  }
  if (showFloat) {
    salesRows.push(
      printSummaryRow("Invoice sales (paid debtors)", formatTillKes(s.paid_debtors ?? 0)),
    );
  }
  salesRows.push(
    printSummaryRow("Expenses", `-${formatTillKes(totalExpenses)}`, { tone: "danger" }),
  );
  if (showFloat) {
    salesRows.push(
      `<div class="expected">${printSummaryRow("Expected net sales", formatTillKesExact(expectedNet), {
        tone: "primary",
        bold: true,
      })}</div>`,
    );
    if (meta.showCashVariance && meta.actualCash != null) {
      salesRows.push(
        printSummaryRow("Actual cash", formatTillKesExact(meta.actualCash), { bold: true }),
      );
      if (meta.variance != null) {
        const tone = varianceAmountTone(meta.variance);
        salesRows.push(
          printSummaryRow("Variance", formatTillKesSigned(meta.variance), {
            bold: true,
            tone: tone === "default" ? undefined : tone,
          }),
        );
      }
    }
  }

  const metricsRows = [
    printSummaryRow("Average sale value", formatTillKesExact(s.average_sale_value)),
    printSummaryRow("Items sold", String(s.items_sold ?? 0)),
    printSummaryRow("Voided transactions", String(s.voided_transactions ?? 0)),
    printSummaryRow("Total customers", String(s.customers ?? 0)),
    printSummaryRow("Start time", formatReportTime(s.start_time)),
    printSummaryRow("End time", formatReportTime(s.end_time)),
    printSummaryRow("Session duration", formatDuration(s.start_time, s.end_time)),
  ].join("");

  const cashierRows = meta.cashierSalesRows ?? [];
  const cashierHtml =
    cashierRows.length === 0
      ? `<p class="muted">No cashier sales for this date.</p>`
      : cashierRows
          .map((row) => {
            let block = `<div class="cashier-block"><p class="cashier-name">${escapeHtml(row.cashier ?? "—")}</p>
              ${printSummaryRow("Total sales", formatTillKes(row.gross_sales), { bold: true })}
              ${printSummaryRow("VAT", formatTillKes(row.total_vat))}
              ${printSummaryRow("Transactions", String(row.transactions ?? 0))}
              ${printSummaryRow("Cash", formatTillKes(row.cash_collected))}
              ${printSummaryRow("M-Pesa", formatTillKes(row.mpesa_collected))}
              ${printSummaryRow("Equity", formatTillKes(row.equity_collected ?? 0))}
              ${printSummaryRow("KCB", formatTillKes(row.kcb_collected ?? 0))}`;
            if (showFloat) {
              block += printSummaryRow("Float", formatTillKes(row.opening_float));
            }
            block += `</div>`;
            return block;
          })
          .join("");

  const sessions = report?.sessions ?? report?.tills ?? [];
  const showCashVariance = Boolean(meta.showCashVariance);
  let sessionsHtml = "";
  if (showFloat) {
    if (sessions.length === 0) {
      sessionsHtml = `<section class="panel panel-span-2"><h2>Till sessions</h2><p class="muted">No till sessions for this date.</p></section>`;
    } else {
      const body = sessions
        .map((row) => {
          const sid = row.float_session_id != null ? `#${row.float_session_id}` : "—";
          const status = row.session_status ? ` ${escapeHtml(row.session_status)}` : "";
          const timeRange = `${escapeHtml(formatReportTime(row.opened_at))}${
            row.closed_at ? ` – ${escapeHtml(formatReportTime(row.closed_at))}` : " – open"
          }`;
          const variance = resolveSessionVariance(row);
          const closed = sessionHasClosedCashMaths(row);
          const varianceCell =
            showCashVariance && closed
              ? `<td class="num">${escapeHtml(formatTillKesExact(row.closing_amount))}</td>
                 <td class="num">${escapeHtml(variance != null ? formatTillKesSigned(variance) : "—")}</td>`
              : showCashVariance
                ? `<td class="num">—</td><td class="num">—</td>`
                : "";
          return `<tr>
            <td>${escapeHtml(sid)}<span class="muted status">${status}</span><div class="muted">${timeRange}</div></td>
            <td>${escapeHtml(row.till_number ?? "")}${row.till_name ? ` · ${escapeHtml(row.till_name)}` : ""}</td>
            <td>${escapeHtml(row.cashier ?? "—")}</td>
            <td class="num">${escapeHtml(formatTillKes(row.opening_float))}</td>
            <td class="num">${escapeHtml(formatTillKes(row.gross_sales))}</td>
            <td class="num">${escapeHtml(formatTillKes(row.session_expenses))}</td>
            <td class="num">${escapeHtml(formatTillKes(row.expected_net_sales))}</td>
            ${varianceCell}
          </tr>`;
        })
        .join("");
      sessionsHtml = `<section class="panel panel-span-2">
        <h2>Till sessions</h2>
        <table class="data">
          <thead><tr>
            <th>Session</th><th>Till</th><th>Cashier</th>
            <th class="num">Float</th><th class="num">Sales</th><th class="num">Expenses</th><th class="num">Expected</th>
            ${showCashVariance ? `<th class="num">Actual</th><th class="num">Variance</th>` : ""}
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
      </section>`;
    }
  }

  const floatRows = report?.float_breakdown ?? [];
  const floatTotal = report?.float_breakdown_total ?? s.opening_float ?? 0;
  let floatHtml = "";
  if (showFloat) {
    floatHtml =
      floatRows.length === 0
        ? `<section class="panel"><h2>Float breakdown</h2><p class="muted">No float entries for this date.</p></section>`
        : `<section class="panel"><h2>Float breakdown</h2>
            <table class="data"><tbody>
              ${floatRows
                .map(
                  (row) => `<tr>
                    <td>${escapeHtml(floatPaymentLabel(row.payment_type))}</td>
                    <td class="num">${escapeHtml(formatTillKes(row.amount))}</td>
                  </tr>`,
                )
                .join("")}
            </tbody></table>
            <div class="divider"></div>
            ${printSummaryRow("Total float", formatTillKes(floatTotal), { bold: true })}
          </section>`;
  }

  const expenseRows = report?.expenses ?? [];
  const expensesHtml =
    expenseRows.length === 0
      ? `<section class="panel"><h2>Expenses summary</h2>${printSummaryRow("Total expenses", formatTillKes(0), { bold: true })}</section>`
      : `<section class="panel"><h2>Expenses summary</h2>
          <table class="data"><tbody>
            ${expenseRows
              .map(
                (row) => `<tr>
                  <td>${escapeHtml(expenseSummaryRowLabel(row))}</td>
                  <td class="num">${escapeHtml(formatTillKes(row.amount))}</td>
                </tr>`,
              )
              .join("")}
          </tbody></table>
          <div class="divider"></div>
          ${printSummaryRow("Total expenses", formatTillKes(report.total_expenses), {
            tone: "danger",
            bold: true,
          })}
        </section>`;

  const debtorsHtml = `<section class="panel"><h2>Debtor summary</h2>
    ${printSummaryRow("New sales (credit)", formatTillKes(report?.debtors?.new_credit_sales ?? 0))}
    ${printSummaryRow("Payments received", formatTillKes(report?.debtors?.payments_received ?? 0), {
      tone: "success",
    })}
    <div class="divider"></div>
    ${printSummaryRow("Credit outstanding", formatTillKes(report?.debtors?.closing ?? 0), {
      tone: "danger",
      bold: true,
    })}
  </section>`;

  const daily = report?.daily_breakdown ?? [];
  let dailyHtml = "";
  if (meta.isMonthly && daily.length > 0) {
    dailyHtml = `<section class="panel panel-full">
      <h2>Daily breakdown</h2>
      <table class="data">
        <thead><tr>
          <th>Date</th><th class="num">Transactions</th><th class="num">Gross sales</th>
          <th class="num">VAT</th><th class="num">Cash</th>
        </tr></thead>
        <tbody>
          ${daily
            .map(
              (row) => `<tr>
                <td>${escapeHtml(formatReportDate(row.sale_date))}</td>
                <td class="num">${escapeHtml(String(row.transactions ?? 0))}</td>
                <td class="num">${escapeHtml(formatTillKes(row.gross_sales))}</td>
                <td class="num">${escapeHtml(formatTillKes(row.total_vat))}</td>
                <td class="num">${escapeHtml(formatTillKes(row.cash_collected))}</td>
              </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </section>`;
  }

  const closingHtml = showFloat
    ? `<section class="closing">
        <p class="closing-label">Expected closing</p>
        <p class="closing-value">${escapeHtml(formatTillKes(expectedNet))}</p>
        <p class="muted">Expected closing = paid sales + paid debtors + float − expenses</p>
      </section>`
    : "";

  const orgLine = meta.organizationName
    ? `<p class="org">${escapeHtml(meta.organizationName)}</p>`
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 10mm 11mm 12mm;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #0f172a;
    font-size: 9.5px;
    line-height: 1.35;
    background: #fff;
  }
  .org { margin: 0 0 2px; font-size: 11px; font-weight: 700; color: #0f172a; }
  h1 { margin: 0 0 2px; font-size: 16px; font-weight: 700; }
  .subtitle { margin: 0 0 8px; color: #64748b; font-size: 9px; }
  .muted { color: #64748b; }
  .kpis {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 5px;
    margin-bottom: 8px;
  }
  .kpi {
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 5px 7px;
    background: #fff;
  }
  .kpi-label {
    margin: 0;
    font-size: 7.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #64748b;
  }
  .kpi-value { margin: 2px 0 0; font-size: 12px; font-weight: 700; }
  .kpi-hint { margin: 1px 0 0; font-size: 7.5px; color: #94a3b8; }
  .cols-3 {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    margin-bottom: 6px;
  }
  .cols-bottom {
    display: grid;
    grid-template-columns: ${showFloat ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))"};
    gap: 6px;
    margin-bottom: 6px;
  }
  .panel {
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    padding: 7px 8px;
    background: #fff;
    break-inside: avoid;
  }
  .panel-wide { grid-column: 1 / -1; }
  .panel-span-2 { grid-column: span 2; }
  .panel-full { margin-top: 6px; break-inside: avoid; }
  .panel h2 {
    margin: 0 0 5px;
    font-size: 10px;
    font-weight: 700;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 0;
  }
  .row.bold { font-weight: 700; }
  .row .label { color: #64748b; }
  .divider { border-top: 1px solid #e2e8f0; margin: 4px 0; }
  .expected {
    margin-top: 4px;
    border: 1px solid #bfdbfe;
    background: #eff6ff;
    border-radius: 5px;
    padding: 4px 6px;
  }
  .donut-wrap { display: flex; align-items: flex-start; gap: 10px; }
  .donut {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .legend { width: 100%; border-collapse: collapse; }
  .legend td { padding: 2px 0; border-bottom: 1px solid #f1f5f9; }
  .legend td.num { text-align: right; font-weight: 600; }
  .legend td.pct { text-align: right; color: #64748b; padding-left: 6px; width: 42px; }
  .swatch {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: middle;
  }
  .pay-total { margin-top: 4px; text-align: right; color: #64748b; font-size: 8px; }
  .cashier-block {
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 5px;
    margin-bottom: 5px;
  }
  .cashier-block:last-child { border-bottom: 0; margin-bottom: 0; padding-bottom: 0; }
  .cashier-name { margin: 0 0 2px; font-weight: 700; font-size: 9.5px; color: #185FA5; }
  table.data { width: 100%; border-collapse: collapse; }
  table.data th, table.data td {
    padding: 3px 4px;
    border-bottom: 1px solid #e2e8f0;
    text-align: left;
    vertical-align: top;
  }
  table.data th { color: #64748b; font-size: 8px; font-weight: 600; }
  table.data .num { text-align: right; white-space: nowrap; }
  table.data .status { font-weight: 400; font-size: 8px; }
  .closing {
    margin-top: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    padding: 8px;
    text-align: center;
    break-inside: avoid;
  }
  .closing-label { margin: 0; color: #64748b; font-size: 8px; }
  .closing-value { margin: 2px 0; font-size: 14px; font-weight: 700; color: #185FA5; }
  .footer { margin-top: 8px; color: #94a3b8; font-size: 8px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>
${orgLine}
<h1>${escapeHtml(title)}</h1>
<p class="subtitle">${periodLine}</p>
<div class="kpis">${kpiCards}</div>
<div class="cols-3">
  <section class="panel"><h2>Sales summary</h2>${salesRows.join("")}</section>
  <section class="panel"><h2>Payment summary</h2>
    ${printPaymentDonutHtml(payments)}
    ${(meta.paymentLines ?? [])
      .map((row) => printSummaryRow(row.label, formatTillKes(row.total)))
      .join("")}
    <p class="pay-total">Total collected ${escapeHtml(formatTillKes(paymentTotal))}</p>
  </section>
  <section class="panel"><h2>Key metrics</h2>${metricsRows}</section>
</div>
<div class="cols-3">
  <section class="panel${showFloat ? "" : " panel-span-2"}"><h2>Cashier sales</h2>${cashierHtml}</section>
  ${sessionsHtml}
</div>
<div class="cols-bottom">
  ${floatHtml}
  ${expensesHtml}
  ${debtorsHtml}
</div>
${dailyHtml}
${closingHtml}
<p class="footer">Report generated on ${escapeHtml(meta.printedAt ?? formatAppDateTime(new Date()))} by ${escapeHtml(meta.userName ?? "—")}</p>
</body></html>`;

  return printHtmlDocument(html, {
    jobType: "end_of_day",
    documentId: report?.date ?? meta?.date ?? null,
    windowFeatures: "width=860,height=1100",
  });
}

export function EndOfDayReportScreen() {
  const { user, capabilities, organization } = useAuth();
  const organizationId = user?.organization_id ?? capabilities?.organization_id;
  const requireTillFloat = isTillFloatWorkflowEnabled(capabilities?.module_settings);
  const discountsEnabled = areSalesDiscountsEnabled(capabilities?.module_settings);

  const [branches, setBranches] = useState([]);
  const [cashierOptions, setCashierOptions] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [cashierId, setCashierId] = useState("");
  const [floatSessionId, setFloatSessionId] = useState("");
  const [saleDate, setSaleDate] = useState(todayIsoDate());
  const [reportMode, setReportMode] = useState("daily");
  const [saleMonth, setSaleMonth] = useState(() => todayIsoDate().slice(0, 7));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!organizationId) return;
    fetchBranchesCached(organizationId)
      .then((branchesData) => {
        const list = filterByOrganization(branchesData ?? [], organizationId);
        setBranches(list);
        if (!branchId && user?.branch_id) {
          setBranchId(String(user.branch_id));
        } else if (!branchId && list[0]) {
          setBranchId(String(list[0].id));
        }
      })
      .catch(() => setBranches([]));
  }, [organizationId, user?.branch_id, branchId]);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    const params = { per_page: 50 };
    if (branchId) params.branch_id = branchId;
    apiRequest("/reports/filter-cashiers", { searchParams: params })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setCashierOptions(
          rows
            .map((u) => ({
              value: String(u.id),
              label: u.full_name?.trim() || u.username || `User #${u.id}`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        );
      })
      .catch(() => {
        if (!cancelled) setCashierOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, branchId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (reportMode === "monthly") {
        params.sale_month = saleMonth;
      } else {
        params.sale_date = saleDate;
      }
      if (branchId) params.branch_id = branchId;
      if (cashierId) params.cashier_id = cashierId;
      if (floatSessionId) params.float_session_id = floatSessionId;
      const data = await apiRequest("/reports/eod-report", { searchParams: params });
      setReport(data);
    } catch (e) {
      setReport(null);
      setError(e instanceof ApiError ? e.message : "Failed to load end-of-day report");
    } finally {
      setLoading(false);
    }
  }, [saleDate, saleMonth, reportMode, branchId, cashierId, floatSessionId]);

  useEffect(() => {
    if (reportMode === "monthly" ? saleMonth : saleDate) load();
  }, [load, saleDate, saleMonth, reportMode]);

  const summary = report?.summary ?? {};
  const payments = useMemo(() => report?.payments ?? {}, [report?.payments]);
  const expectedNetSales = useMemo(
    () =>
      resolveExpectedNetSales({
        openingFloat: summary.opening_float,
        totalSales: summary.net_sales,
        debtorCollections: summary.paid_debtors,
        expenses: report?.total_expenses ?? summary.session_expenses,
        cashMovementsIn: summary.cash_movements_in,
        cashMovementsOut: summary.cash_movements_out,
        expectedNetSales: summary.expected_net_sales ?? summary.net_cash_expected,
      }),
    [
      summary.net_sales,
      summary.opening_float,
      summary.paid_debtors,
      summary.expected_net_sales,
      summary.net_cash_expected,
      summary.session_expenses,
      summary.cash_movements_in,
      summary.cash_movements_out,
      report?.total_expenses,
    ],
  );
  const branchName =
    report?.branch_name ?? branches.find((b) => String(b.id) === branchId)?.branch_name ?? "All branches";
  const cashierName =
    report?.cashier_name ??
    (cashierId ? cashierOptions.find((c) => c.value === cashierId)?.label : null);

  const sessionOptions = useMemo(() => {
    const rows = report?.sessions ?? report?.tills ?? [];
    return rows
      .filter((row) => row?.float_session_id != null)
      .map((row) => {
        const tillNo = row.till_number || row.till_name || "Till";
        const cashier = row.cashier || "—";
        const opened = formatReportTime(row.opened_at);
        const statusRaw = String(row.session_status || "").trim();
        const status = statusRaw
          ? statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1).toLowerCase()
          : "—";
        return {
          value: String(row.float_session_id),
          label: `${tillNo} · ${cashier} · ${opened} · ${status}`,
          row,
        };
      });
  }, [report?.sessions, report?.tills]);

  const selectedSessionLabel = useMemo(() => {
    if (!floatSessionId) return null;
    return sessionOptions.find((opt) => opt.value === floatSessionId)?.label ?? `Session #${floatSessionId}`;
  }, [floatSessionId, sessionOptions]);

  const netSalesExVat = useMemo(() => {
    if (summary.net_sales_ex_vat != null) return Number(summary.net_sales_ex_vat);
    return Math.max(0, Number(summary.net_sales ?? 0) - Number(summary.total_vat ?? 0));
  }, [summary.net_sales, summary.net_sales_ex_vat, summary.total_vat]);

  const grossSalesExVat = useMemo(() => {
    if (summary.gross_sales_ex_vat != null) return Number(summary.gross_sales_ex_vat);
    return Math.max(0, Number(summary.gross_sales ?? 0) - Number(summary.total_vat ?? 0));
  }, [summary.gross_sales, summary.gross_sales_ex_vat, summary.total_vat]);

  const paymentTotal = useMemo(() => paymentDonutTotal(payments), [payments]);

  const showCashVariance = useMemo(() => {
    if (!requireTillFloat) return false;
    if (reportMode === "monthly") return false;
    const sessions = report?.sessions ?? report?.tills ?? [];
    // Show Actual / Variance for any closed till — including today.
    return sessions.some((row) => sessionHasClosedCashMaths(row));
  }, [requireTillFloat, reportMode, report?.sessions, report?.tills]);

  const cashReconciliation = useMemo(() => {
    if (!showCashVariance) return null;
    const sessions = report?.sessions ?? report?.tills ?? [];
    const selected = floatSessionId
      ? sessions.find((row) => String(row.float_session_id) === String(floatSessionId))
      : null;
    if (selected) {
      if (!sessionHasClosedCashMaths(selected)) return null;
      return {
        actualCash: Number(selected.closing_amount),
        variance: resolveSessionVariance(selected),
      };
    }
    const closed = sessions.filter((row) => sessionHasClosedCashMaths(row));
    if (closed.length === 0) return null;
    const actualCash = closed.reduce((sum, row) => sum + Number(row.closing_amount ?? 0), 0);
    const variance = closed.reduce((sum, row) => {
      const v = resolveSessionVariance(row);
      return sum + (v != null ? v : 0);
    }, 0);
    return { actualCash, variance };
  }, [showCashVariance, report?.sessions, report?.tills, floatSessionId]);

  const paymentLines = useMemo(() => {
    const sessions = report?.sessions ?? report?.tills ?? [];
    const selected = floatSessionId
      ? sessions.find((row) => String(row.float_session_id) === String(floatSessionId))
      : null;
    if (Array.isArray(selected?.payments) && selected.payments.length > 0) {
      return selected.payments.map((row) => ({
        label: row.method_name ?? row.method_code ?? "Payment",
        total: Number(row.total ?? row.total_amount ?? 0),
      }));
    }
    if (!floatSessionId && sessions.some((row) => Array.isArray(row.payments) && row.payments.length > 0)) {
      const totals = new Map(TILL_REPORT_PAYMENT_LINES.map((spec) => [spec.method_code, 0]));
      const labels = new Map(TILL_REPORT_PAYMENT_LINES.map((spec) => [spec.method_code, spec.label]));
      for (const session of sessions) {
        for (const row of session.payments ?? []) {
          const code = String(row.method_code ?? "").toUpperCase();
          if (!totals.has(code)) continue;
          totals.set(code, totals.get(code) + Number(row.total ?? row.total_amount ?? 0));
          if (row.method_name) labels.set(code, row.method_name);
        }
      }
      return TILL_REPORT_PAYMENT_LINES.map((spec) => ({
        label: labels.get(spec.method_code) ?? spec.label,
        total: totals.get(spec.method_code) ?? 0,
      }));
    }
    return [
      { label: "Cash payment", total: Number(payments.cash ?? 0) },
      { label: "M-Pesa payments", total: Number(payments.mpesa ?? 0) },
      { label: "Equity payment", total: Number(payments.equity ?? 0) },
      { label: "K.C.B payment", total: Number(payments.kcb ?? 0) },
    ];
  }, [report?.sessions, report?.tills, floatSessionId, payments]);

  const cashierSalesRows = useMemo(() => {
    const rows = report?.cashiers ?? [];
    if (rows.length > 0) return rows;
    if (!cashierId || !report?.summary) return [];

    const s = report.summary;
    if (Number(s.transactions ?? 0) <= 0 && Number(s.gross_sales ?? 0) <= 0) return [];

    const p = report.payments ?? {};
    return [
      {
        cashier_id: Number(cashierId),
        cashier: cashierName ?? "—",
        gross_sales: s.gross_sales,
        total_vat: s.total_vat,
        transactions: s.transactions,
        cash_collected: p.cash,
        mpesa_collected: p.mpesa,
        equity_collected: p.equity,
        kcb_collected: p.kcb,
        bank_collected: p.bank,
        opening_float: s.opening_float,
      },
    ];
  }, [report, cashierId, cashierName]);

  const floatBreakdownRows = report?.float_breakdown ?? [];
  const floatBreakdownTotal =
    report?.float_breakdown_total ?? summary.opening_float ?? 0;

  const isMonthly = reportMode === "monthly" || report?.report_mode === "monthly";
  const periodStart = report?.period_start ?? (isMonthly ? `${saleMonth}-01` : saleDate);
  const periodEnd = report?.period_end ?? saleDate;
  const expensesHref = buildExpensesHref({ fromDate: periodStart, toDate: periodEnd });

  const handleEodPrint = useCallback(() => {
    if (!report) return;
    const periodLabel = isMonthly
      ? `${formatReportDate(periodStart)} – ${formatReportDate(periodEnd)}`
      : formatReportDate(saleDate);
    void printEodReport(report, {
      organizationName: organization?.org_name ?? organization?.name ?? "",
      branchName,
      cashierName: cashierName ?? "All cashiers",
      sessionLabel: selectedSessionLabel,
      periodLabel,
      isMonthly,
      showFloat: requireTillFloat,
      showDiscounts: discountsEnabled,
      showCashVariance,
      actualCash: cashReconciliation?.actualCash,
      variance: cashReconciliation?.variance,
      paymentLines,
      totalExpenses: report.total_expenses,
      expectedNetSales,
      grossSalesExVat,
      netSalesExVat,
      cashierSalesRows,
      userName: user?.full_name ?? user?.username,
      printedAt: formatAppDateTime(new Date()),
    });
  }, [
    branchName,
    cashReconciliation,
    cashierName,
    cashierSalesRows,
    discountsEnabled,
    expectedNetSales,
    grossSalesExVat,
    isMonthly,
    netSalesExVat,
    organization?.name,
    organization?.org_name,
    paymentLines,
    periodEnd,
    periodStart,
    report,
    requireTillFloat,
    saleDate,
    selectedSessionLabel,
    showCashVariance,
    user?.full_name,
    user?.username,
  ]);

  return (
    <div className="theme-workspace min-h-full">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="theme-subtext text-xs">
            <Link href="/reports" className="theme-link hover:underline">Reports</Link>
            {" / "}
            <span className="text-[var(--theme-text-muted)]">End of Day Sales</span>
          </p>
          <h1 className="theme-heading mt-1 text-2xl font-semibold">
            {isMonthly ? "Monthly Sales Report" : "End of Day Sales Report"}
          </h1>
          <p className="theme-subtext mt-1 text-sm">
            {branchName} ·{" "}
            {isMonthly
              ? `${formatReportDate(periodStart)} – ${formatReportDate(periodEnd)}`
              : formatReportDate(saleDate)}
            {cashierName ? ` · ${cashierName}` : " · All cashiers"}
            {selectedSessionLabel ? ` · ${selectedSessionLabel}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleEodPrint}
            disabled={loading || !report}
            className={SECONDARY_BTN_CLASS}
          >
            Print / PDF
          </button>
          <PrimaryButton type="button" showIcon={false} onClick={load} disabled={loading}>
            Refresh
          </PrimaryButton>
        </div>
      </div>

      <FilterToolbar className="mb-6 flex-wrap overflow-visible">
        <div>
          <label className="theme-subtext mb-1 block text-xs font-medium">Branch</label>
          <FilterSelect
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setCashierId("");
              setFloatSessionId("");
            }}
            options={[
              { value: "", label: "All branches" },
              ...branches.map((b) => ({ value: String(b.id), label: b.branch_name })),
            ]}
          />
        </div>
        <div>
          <label className="theme-subtext mb-1 block text-xs font-medium">Cashier / user</label>
          <FilterSelect
            value={cashierId}
            onChange={(e) => {
              setCashierId(e.target.value);
              setFloatSessionId("");
            }}
            options={[{ value: "", label: "All cashiers" }, ...cashierOptions]}
          />
        </div>
        {requireTillFloat ? (
          <div>
            <label className="theme-subtext mb-1 block text-xs font-medium">Till session</label>
            <FilterSelect
              value={floatSessionId}
              onChange={(e) => setFloatSessionId(e.target.value)}
              options={[
                { value: "", label: "All sessions" },
                ...sessionOptions.map((opt) => ({ value: opt.value, label: opt.label })),
              ]}
            />
          </div>
        ) : null}
        <div>
          <label className="theme-subtext mb-1 block text-xs font-medium">Period</label>
          <FilterSelect
            value={reportMode}
            onChange={(e) => setReportMode(e.target.value)}
            options={[
              { value: "daily", label: "Daily" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
        </div>
        {reportMode === "monthly" ? (
          <div>
            <label className="theme-subtext mb-1 block text-xs font-medium">Month</label>
            <input
              type="month"
              className={`${inputClassName()} w-40`}
              value={saleMonth}
              onChange={(e) => setSaleMonth(e.target.value)}
            />
          </div>
        ) : (
          <div>
            <label className="theme-subtext mb-1 block text-xs font-medium">Sale date</label>
            <input
              type="date"
              className={`${inputClassName()} w-40`}
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </div>
        )}
        <button type="button" onClick={load} className={SECONDARY_BTN_CLASS}>
          Filter
        </button>
      </FilterToolbar>

      {error ? (
        <p className="theme-alert-error mb-4 rounded-lg px-4 py-3 text-sm">{error}</p>
      ) : null}

      {loading ? (
        <p className="theme-subtext text-sm">Loading end-of-day report…</p>
      ) : !report ? (
        <p className={`${EMPTY_STATE_CLASS} border-dashed`}>
          No report data for the selected date.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Gross sales (ex VAT)" value={formatTillKes(grossSalesExVat)} hint="Before VAT" />
            <StatCard label="VAT collected" value={formatTillKes(summary.total_vat)} hint="Tax on sales" />
            <StatCard label="Gross sales (incl VAT)" value={formatTillKes(summary.gross_sales)} hint="Order total including VAT" />
            <StatCard label="Total transactions" value={summary.transactions ?? 0} hint="All transactions" />
            {discountsEnabled ? (
              <StatCard label="Total discounts" value={formatTillKes(summary.total_discounts)} hint="Discounts given" />
            ) : null}
            <StatCard label="Total refunds" value={formatTillKes(summary.total_refunds)} hint="Info only — already in order total" />
            <StatCard
              label="Net sales (incl VAT)"
              value={formatTillKes(summary.net_sales)}
              hint="Order total (incl VAT)"
            />
            <StatCard label="Net sales (ex VAT)" value={formatTillKes(netSalesExVat)} hint="Net after VAT" />
            {requireTillFloat ? (
              <StatCard
                label="Expected net sales"
                value={formatTillKes(expectedNetSales)}
                hint="Paid sales + paid debtors + float − expenses"
              />
            ) : null}
            <StatCard label="Total expenses" value={formatTillKes(report?.total_expenses ?? 0)} hint="Till session expenses" />
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Panel title="Sales summary">
              <SummaryRow label="Gross sales (ex VAT)" value={formatTillKes(grossSalesExVat)} />
              <SummaryRow label="VAT collected" value={formatTillKes(summary.total_vat)} tone="primary" />
              <SummaryRow label="Gross sales (incl VAT)" value={formatTillKes(summary.gross_sales)} bold />
              {discountsEnabled ? (
                <SummaryRow label="Total discounts" value={`-${formatTillKes(summary.total_discounts)}`} tone="danger" />
              ) : null}
              <SummaryRow label="Product returns (info)" value={formatTillKes(summary.total_refunds)} />
              <div className="my-2 border-t border-[var(--theme-border)]" />
              <SummaryRow label="Net sales (incl VAT)" value={formatTillKes(summary.net_sales)} tone="success" bold />
              <SummaryRow label="Net sales (ex VAT)" value={formatTillKes(netSalesExVat)} />
              {requireTillFloat ? (
                <SummaryRow label="Opening float" value={formatTillKes(summary.opening_float)} />
              ) : null}
              {Number(summary.cash_movements_out) > 0 ? (
                <SummaryRow label="Safe drops" value={`-${formatTillKes(summary.cash_movements_out)}`} tone="danger" />
              ) : null}
              {Number(summary.cash_movements_in) > 0 ? (
                <SummaryRow label="Cash in" value={formatTillKes(summary.cash_movements_in)} tone="success" />
              ) : null}
              {requireTillFloat ? (
                <SummaryRow
                  label="Invoice sales (paid debtors)"
                  value={formatTillKes(summary.paid_debtors ?? 0)}
                />
              ) : null}
              <SummaryRow
                label="Expenses"
                value={`-${formatTillKes(report?.total_expenses ?? summary.session_expenses ?? 0)}`}
                tone="danger"
              />
              {requireTillFloat ? (
                <div className="mt-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-primary-subtle)] px-3 py-2">
                  <SummaryRow
                    label="Expected net sales"
                    value={formatTillKesExact(expectedNetSales)}
                    tone="primary"
                    bold
                  />
                  {showCashVariance && cashReconciliation ? (
                    <>
                      <SummaryRow
                        label="Actual cash"
                        value={formatTillKesExact(cashReconciliation.actualCash)}
                        bold
                      />
                      {cashReconciliation.variance != null ? (
                        <SummaryRow
                          label="Variance"
                          value={formatTillKesSigned(cashReconciliation.variance)}
                          tone={varianceAmountTone(cashReconciliation.variance)}
                          bold
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
            </Panel>

            <Panel title="Payment summary">
              <PaymentDonut payments={payments} />
              <div className="mt-3 border-t border-[var(--theme-border)] pt-1">
                {paymentLines.map((row) => (
                  <SummaryRow key={row.label} label={row.label} value={formatTillKes(row.total)} />
                ))}
              </div>
              <p className="theme-subtext mt-3 text-right text-xs">
                Total collected {formatTillKes(paymentTotal)}
              </p>
            </Panel>

            <Panel title="Key metrics">
              <SummaryRow label="Average sale value" value={formatTillKesExact(summary.average_sale_value)} />
              <SummaryRow label="Items sold" value={summary.items_sold ?? 0} />
              <SummaryRow label="Voided transactions" value={summary.voided_transactions ?? 0} />
              <SummaryRow label="Total customers" value={summary.customers ?? 0} />
              <SummaryRow label="Start time" value={formatReportTime(summary.start_time)} />
              <SummaryRow label="End time" value={formatReportTime(summary.end_time)} />
              <SummaryRow label="Session duration" value={formatDuration(summary.start_time, summary.end_time)} />
            </Panel>

            <Panel title="Cashier sales">
              {cashierSalesRows.length === 0 ? (
                <p className="theme-subtext text-sm">No cashier sales for this date.</p>
              ) : (
                <div className="space-y-4">
                  {cashierSalesRows.map((row) => {
                      const isSelected = cashierId && String(row.cashier_id) === cashierId;
                      return (
                      <div
                          key={row.cashier_id}
                        className="border-b border-[var(--theme-border)] pb-4 last:border-b-0 last:pb-0"
                        >
                            <button
                              type="button"
                              onClick={() => setCashierId(String(row.cashier_id))}
                          className={`theme-link mb-1 text-sm font-semibold hover:underline ${isSelected ? "underline" : ""}`}
                            >
                              {row.cashier ?? "—"}
                            </button>
                        <SummaryRow label="Total sales" value={formatTillKes(row.gross_sales)} bold />
                        <SummaryRow label="VAT" value={formatTillKes(row.total_vat)} />
                        <SummaryRow label="Transactions" value={row.transactions ?? 0} />
                        <SummaryRow label="Cash" value={formatTillKes(row.cash_collected)} />
                        <SummaryRow label="M-Pesa" value={formatTillKes(row.mpesa_collected)} />
                        <SummaryRow
                          label="Equity"
                          value={formatTillKes(row.equity_collected ?? 0)}
                        />
                        <SummaryRow
                          label="KCB"
                          value={formatTillKes(row.kcb_collected ?? 0)}
                        />
                          {requireTillFloat ? (
                          <SummaryRow label="Float" value={formatTillKes(row.opening_float)} />
                          ) : null}
                      </div>
                      );
                    })}
                </div>
              )}
              {cashierId ? (
                <button
                  type="button"
                  onClick={() => setCashierId("")}
                  className="theme-link mt-3 text-xs font-medium hover:underline"
                >
                  Clear cashier filter — show all cashiers
                </button>
              ) : null}
            </Panel>

            {requireTillFloat ? (
            <Panel title="Till sessions" className="lg:col-span-2">
              <p className="theme-subtext mb-3 text-xs">
                Actual cash and variance appear once the cashier closes till maths — including for today.
              </p>
              {(report.sessions ?? report.tills ?? []).length === 0 ? (
                <p className="theme-subtext text-sm">No till sessions for this date.</p>
              ) : (
                <>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="theme-subtext border-b border-[var(--theme-border)] text-left text-xs font-medium">
                        <th className="pb-2 pr-3">Session</th>
                      <th className="pb-2 pr-3">Till</th>
                      <th className="pb-2 pr-3">Cashier</th>
                        <th className="pb-2 pr-3 text-right">Float</th>
                        <th className="pb-2 pr-3 text-right">Sales</th>
                        <th className="pb-2 pr-3 text-right">Expenses</th>
                        <th className={`pb-2 text-right ${showCashVariance ? "pr-3" : ""}`}>Expected</th>
                        {showCashVariance ? (
                          <>
                            <th className="pb-2 pr-3 text-right">Actual</th>
                            <th className="pb-2 text-right">Variance</th>
                          </>
                        ) : null}
                    </tr>
                  </thead>
                  <tbody>
                      {(report.sessions ?? report.tills ?? []).map((row, i) => {
                        const sid = row.float_session_id != null ? String(row.float_session_id) : "";
                        const isSelected = floatSessionId && sid === floatSessionId;
                        const variance = resolveSessionVariance(row);
                        return (
                          <tr
                            key={`${sid || row.till_number}-${i}`}
                            className={`border-b border-[var(--theme-border)] last:border-b-0 ${isSelected ? "bg-[var(--theme-primary-subtle)]" : ""}`}
                          >
                            <td className="py-2.5 pr-3">
                              {sid ? (
                                <button
                                  type="button"
                                  onClick={() => setFloatSessionId(sid)}
                                  className={`theme-link font-medium hover:underline ${isSelected ? "underline" : ""}`}
                                >
                                  #{sid}
                                  {row.session_status ? (
                                    <span className="theme-subtext ml-1 text-xs font-normal">
                                      {row.session_status}
                                    </span>
                                  ) : null}
                                </button>
                              ) : (
                                "—"
                              )}
                              <div className="theme-subtext text-xs">
                                {formatReportTime(row.opened_at)}
                                {row.closed_at ? ` – ${formatReportTime(row.closed_at)}` : " – open"}
                              </div>
                            </td>
                        <td className="py-2.5 pr-3 font-medium text-[var(--theme-text)]">
                          {row.till_number}
                          {row.till_name ? ` · ${row.till_name}` : ""}
                        </td>
                        <td className="theme-text-muted py-2.5 pr-3">{row.cashier ?? "—"}</td>
                            <td className="theme-text-muted py-2.5 pr-3 text-right">{formatTillKes(row.opening_float)}</td>
                        <td className="py-2.5 pr-3 text-right text-[var(--theme-text)]">{formatTillKes(row.gross_sales)}</td>
                            <td className="theme-text-muted py-2.5 pr-3 text-right">{formatTillKes(row.session_expenses)}</td>
                            <td className={`py-2.5 text-right font-medium text-[var(--theme-text)] ${showCashVariance ? "pr-3" : ""}`}>
                              {formatTillKes(row.expected_net_sales)}
                            </td>
                            {showCashVariance ? (
                              <>
                                <td className="theme-text-muted py-2.5 pr-3 text-right">
                                  {sessionHasClosedCashMaths(row) && row.closing_amount != null
                                    ? formatTillKesExact(row.closing_amount)
                                    : "—"}
                                </td>
                                <td
                                  className={`py-2.5 text-right font-medium ${
                                    variance == null
                                      ? "theme-text-muted"
                                      : varianceAmountTone(variance) === "success"
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : varianceAmountTone(variance) === "danger"
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-[var(--theme-text)]"
                                  }`}
                                >
                                  {variance != null ? formatTillKesSigned(variance) : "—"}
                                </td>
                              </>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {floatSessionId ? (
                    <button
                      type="button"
                      onClick={() => setFloatSessionId("")}
                      className="theme-link mt-3 text-xs font-medium hover:underline"
                    >
                      Clear session filter — show all sessions
                    </button>
                  ) : (
                    <p className="theme-subtext mt-3 text-xs">
                      Click a session to filter the summary maths to that till session only.
                    </p>
                  )}
                </>
              )}
            </Panel>
            ) : null}
          </div>

          <div className={`mt-6 grid gap-4 ${requireTillFloat ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
            {requireTillFloat ? (
              <Panel title="Float breakdown">
                {floatBreakdownRows.length === 0 ? (
                  <p className="theme-subtext text-sm">No float entries for this date.</p>
                ) : (
                  <>
                    <table className="w-full border-collapse text-sm">
                      <tbody>
                        {floatBreakdownRows.map((row) => (
                          <tr
                            key={row.payment_type}
                            className="border-b border-[var(--theme-border)] last:border-b-0"
                          >
                            <td className="theme-text-muted py-2">{floatPaymentLabel(row.payment_type)}</td>
                            <td className="py-2 text-right font-medium text-[var(--theme-text)]">
                              {formatTillKes(row.amount)}
                            </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                    <div className="mt-3 border-t border-[var(--theme-border)] pt-2">
                      <SummaryRow label="Total float" value={formatTillKes(floatBreakdownTotal)} bold />
                    </div>
                  </>
              )}
            </Panel>
            ) : null}

            <Panel
              title="Expenses summary"
              action={
                <Link href={expensesHref} className="theme-link text-xs font-medium hover:underline">
                  View expenses
                </Link>
              }
            >
              {(report.expenses ?? []).length === 0 ? (
                <SummaryRow label="Total expenses" value={formatTillKes(0)} bold />
              ) : (
                <>
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {(report.expenses ?? []).map((row) => (
                        <tr key={row.id ?? row.group_name} className="border-b border-[var(--theme-border)] last:border-b-0">
                          <td className="theme-text-muted py-2">{expenseSummaryRowLabel(row)}</td>
                          <td className="py-2 text-right font-medium text-[var(--theme-text)]">{formatTillKes(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 border-t border-[var(--theme-border)] pt-2">
                    <SummaryRow label="Total expenses" value={formatTillKes(report.total_expenses)} tone="danger" bold />
                  </div>
                </>
              )}
            </Panel>

            <Panel title="Debtor summary">
              <SummaryRow label="New sales (credit)" value={formatTillKes(report.debtors?.new_credit_sales ?? 0)} />
              <SummaryRow label="Payments received" value={formatTillKes(report.debtors?.payments_received ?? 0)} tone="success" />
              <div className="mt-2 border-t border-[var(--theme-border)] pt-2">
                <SummaryRow label="Credit outstanding" value={formatTillKes(report.debtors?.closing ?? 0)} tone="danger" bold />
              </div>
            </Panel>
          </div>

          {isMonthly && (report?.daily_breakdown ?? []).length > 0 ? (
            <Panel title="Daily breakdown" className="mt-6">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="theme-subtext border-b border-[var(--theme-border)] text-left text-xs font-medium">
                    <th className="pb-2 pr-3">Date</th>
                    <th className="pb-2 pr-3 text-right">Transactions</th>
                    <th className="pb-2 pr-3 text-right">Gross sales</th>
                    <th className="pb-2 pr-3 text-right">VAT</th>
                    <th className="pb-2 text-right">Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.daily_breakdown ?? []).map((row) => (
                    <tr key={row.sale_date} className="border-b border-[var(--theme-border)] last:border-b-0">
                      <td className="py-2.5 pr-3 text-[var(--theme-text)]">{formatReportDate(row.sale_date)}</td>
                      <td className="theme-text-muted py-2.5 pr-3 text-right">{row.transactions ?? 0}</td>
                      <td className="py-2.5 pr-3 text-right font-medium text-[var(--theme-text)]">{formatTillKes(row.gross_sales)}</td>
                      <td className="theme-text-muted py-2.5 pr-3 text-right">{formatTillKes(row.total_vat)}</td>
                      <td className="theme-text-muted py-2.5 text-right">{formatTillKes(row.cash_collected)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ) : null}

          {requireTillFloat ? (
          <div className="mt-6 theme-panel rounded-xl border p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-center gap-3 text-center text-sm">
              <HighlightMetric
                label="Expected closing"
                value={formatTillKes(expectedNetSales)}
                variant="primary"
              />
            </div>
            <p className="theme-subtext mt-3 text-center text-xs">
              Expected closing = paid sales + paid debtors + float − expenses
            </p>
          </div>
          ) : null}

          <p className="theme-subtext mt-6 text-xs">
            Report generated on {formatAppDateTime(new Date())} by {user?.full_name ?? user?.username ?? "—"}
          </p>
        </>
      )}
    </div>
  );
}
