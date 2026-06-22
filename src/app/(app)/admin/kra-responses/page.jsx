"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useOrgFormat } from "@/lib/org-format";
import { useAuth } from "@/contexts/auth-context";
import { useAdminApi } from "@/contexts/admin-api-context";
import { isKraDeviceEnabled } from "@/lib/finance-settings";
import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";
import { platformOrgSettingsHref } from "@/lib/platform-admin-nav";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { P } from "@/lib/permission-codes";

export default function KraResponsesPage() {
  const { dateTime } = useOrgFormat();
  const { capabilities, hasPermission } = useAuth();
  const { adminPath, isPlatformManaged, organizationId: platformOrgId, tenantCapabilities } = useAdminApi();
  const params = useParams();
  const [rows, setRows] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  const effectiveCapabilities = isPlatformManaged ? tenantCapabilities ?? capabilities : capabilities;

  const kraEnabled = isKraDeviceEnabled(effectiveCapabilities?.module_settings, effectiveCapabilities);
  const settingsHref = isPlatformManaged ? platformOrgSettingsHref(platformOrgId ?? params?.id) : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, statusRes] = await Promise.all([
        apiRequest(adminPath("/kra-responses"), { searchParams: { per_page: 100 } }),
        apiRequest(adminPath("/kra/device-status")).catch(() => null),
      ]);
      setRows(res.data ?? []);
      setDeviceStatus(statusRes);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load KRA responses");
    } finally {
      setLoading(false);
    }
  }, [adminPath]);

  useEffect(() => {
    load();
  }, [load]);

  async function retryReceipt(row) {
    setRetryingId(row.id);
    setMessage(null);
    setError(null);
    try {
      const res = await apiRequest(adminPath(`/kra-responses/${row.id}/retry`), { method: "POST" });
      setMessage(res.message ?? "Retry succeeded.");
      await load();
      if (res.kra_response) setSelected(res.kra_response);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <CatalogPageShell
      title="KRA device log"
      subtitle="Fiscal receipt submissions from checkout and credit notes"
    >
      {!isPlatformManaged ? (
        <AdminBreadcrumb items={[{ label: "Administration", href: "/admin" }, { label: "KRA device log" }]} />
      ) : null}

      <div className="mb-4 space-y-2">
        {kraEnabled ? (
          <p
            className={`rounded-lg border px-3 py-2 text-sm ${
              deviceStatus?.reachable
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            KRA device integration is <strong>enabled</strong>
            {deviceStatus?.device_ip ? ` (${deviceStatus.device_ip})` : ""}.
            {deviceStatus?.message ? ` ${deviceStatus.message}` : ""}
            {deviceStatus?.test_mode ? " Test mode is on." : ""}
          </p>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            KRA device is <strong>disabled</strong>. Enable it under{" "}
            {settingsHref ? (
              <Link href={settingsHref} className="font-medium text-[#185FA5] hover:underline">
                Organization settings → Finance
              </Link>
            ) : (
              <OrgSettingsPlatformHint area="Organization settings → Finance" />
            )}{" "}
            (device IP, serial, PIN) before checkout can submit fiscal receipts.
          </p>
        )}
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mb-4 text-sm text-emerald-700">{message}</p> : null}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Serial</th>
              <th className="px-4 py-3">Timestamp</th>
              <th className="px-4 py-3">Error</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No KRA responses yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3">{r.order_no ?? r.sale_id ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.invoice_number ?? "—"}</td>
                  <td className="px-4 py-3 capitalize">{r.status ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.serial_number ?? "—"}</td>
                  <td className="px-4 py-3">{r.kra_timestamp ? dateTime(r.kra_timestamp) : "—"}</td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-red-600" title={r.error_message ?? ""}>
                    {r.error_message ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className="text-[#185FA5] hover:underline"
                    >
                      Details
                    </button>
                    {(hasPermission(P.admin.settings.view) || isPlatformManaged) &&
                    r.status !== "success" &&
                    r.sale_id ? (
                      <>
                        {" · "}
                        <button
                          type="button"
                          disabled={retryingId === r.id || !kraEnabled}
                          onClick={() => void retryReceipt(r)}
                          className="text-amber-800 hover:underline disabled:opacity-50"
                        >
                          {retryingId === r.id ? "Retrying…" : "Retry"}
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelected(null)}>
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-slate-900">KRA response #{selected.id}</h3>
                <p className="text-sm text-slate-500">
                  Order {selected.order_no ?? selected.sale_id} · {selected.status}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-800">
                Close
              </button>
            </div>
            {selected.signature_link ? (
              <p className="mt-3 text-sm">
                <a href={selected.signature_link} target="_blank" rel="noreferrer" className="text-[#185FA5] underline">
                  Open signature link
                </a>
              </p>
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Request payload</p>
                <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                  {JSON.stringify(selected.request_payload ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-slate-500">Response payload</p>
                <pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">
                  {JSON.stringify(selected.response_payload ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <PrimaryButton type="button" className="mt-4" onClick={load} showIcon={false}>
        Refresh
      </PrimaryButton>
    </CatalogPageShell>
  );
}
