"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError } from "@/lib/notify";
import {
  CatalogPageShell,
  inputClassName,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";

function formatMoney(value) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function HospitalityOrdersScreen() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("open");
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/hospitality/checks", {
        searchParams: {
          status: status || undefined,
          per_page: 100,
        },
      });
      setRows(res?.checks ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load F&B orders");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useTabAwareDataLoad(load);

  async function openDetail(id) {
    try {
      const res = await apiRequest(`/hospitality/checks/${id}`);
      setDetail(res?.check ?? null);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load order");
    }
  }

  return (
    <CatalogPageShell
      title="F&B orders"
      subtitle="Hotel POS checks — open, unpaid, paid, and voided tickets."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          className={inputClassName()}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="open">Open / unpaid</option>
          <option value="unpaid">Awaiting payment</option>
          <option value="paid">Paid</option>
          <option value="void">Voided</option>
          <option value="">All</option>
        </select>
        <Link
          href="/hotel-bar-pos"
          className="rounded-lg bg-[#185FA5] px-3 py-2 text-xs font-semibold text-white hover:bg-[#144f8a]"
        >
          Open Hotel POS
        </Link>
      </div>

      {loading ? (
        <p className="theme-subtext text-sm">Loading orders…</p>
      ) : (
        <div className={TABLE_SHELL_CLASS}>
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className="px-3 py-2 font-semibold">Check</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Table</th>
                <th className="px-3 py-2 font-semibold">Outlet</th>
                <th className="px-3 py-2 font-semibold text-right">Total</th>
                <th className="px-3 py-2 font-semibold text-right">Paid</th>
                <th className="px-3 py-2 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className={TABLE_BODY_ROW_CLASS}>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No orders for this filter.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`${TABLE_BODY_ROW_CLASS} cursor-pointer hover:bg-slate-50`}
                    onClick={() => void openDetail(row.id)}
                  >
                    <td className="px-3 py-2 font-mono font-semibold">{row.check_number}</td>
                    <td className="px-3 py-2 capitalize">{row.status}</td>
                    <td className="px-3 py-2">
                      {row.floor_table?.label || row.floor_table?.code || "—"}
                    </td>
                    <td className="px-3 py-2">{row.outlet?.name || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.total)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(row.amount_paid)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {formatWhen(row.updated_at || row.opened_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--theme-border)] px-4 py-3">
              <div>
                <h2 className="theme-heading text-base font-semibold">
                  Check {detail.check_number}
                </h2>
                <p className="theme-subtext text-xs capitalize">{detail.status}</p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold"
                onClick={() => setDetail(null)}
              >
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
              <ul className="space-y-2">
                {(detail.lines ?? []).map((line) => (
                  <li
                    key={line.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{line.description}</p>
                      <p className="text-xs text-slate-500">
                        {line.qty} × {formatMoney(line.unit_price)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatMoney(line.line_total)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t border-[var(--theme-border)] px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span>Total</span>
                <span className="font-semibold tabular-nums">{formatMoney(detail.total)}</span>
              </div>
              <div className="mt-1 flex justify-between text-slate-600">
                <span>Paid</span>
                <span className="tabular-nums">{formatMoney(detail.amount_paid)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Balance</span>
                <span className="font-semibold tabular-nums">{formatMoney(detail.balance_due)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </CatalogPageShell>
  );
}
