"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("open");
  const [loading, setLoading] = useState(true);

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

  return (
    <CatalogPageShell
      title="F&B orders"
      subtitle="Hotel POS checks — open, unpaid, paid, and voided tickets. Open a row for full order details."
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
                <th className="px-3 py-2 font-semibold">Guest</th>
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
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No orders for this filter.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`${TABLE_BODY_ROW_CLASS} cursor-pointer hover:bg-[var(--theme-hover)]`}
                    onClick={() => router.push(`/hospitality/orders/${row.id}`)}
                  >
                    <td className="px-3 py-2 font-mono font-semibold">{row.check_number}</td>
                    <td className="px-3 py-2 capitalize">{row.status}</td>
                    <td className="px-3 py-2">{row.guest_name || "—"}</td>
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
    </CatalogPageShell>
  );
}
