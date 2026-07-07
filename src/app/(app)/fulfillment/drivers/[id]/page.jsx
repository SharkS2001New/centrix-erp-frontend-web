"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { StatCard, formatShortDate } from "@/components/catalog/catalog-shared";
import {
  DriverStatusBadge,
  deliveryStatsFromSales,
  driverInitials,
} from "@/components/fulfillment/fulfillment-shared";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";

export default function DriverProfilePage() {
  const params = useParams();
  const driverId = Number(params.id);

  const [driver, setDriver] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [driverData, deliveriesRes, userRes] = await Promise.all([
        apiRequest(`/drivers/${driverId}`),
        apiRequest(`/drivers/${driverId}/deliveries`, { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }),
      ]);
      setDriver(driverData);
      setDeliveries(deliveriesRes.data ?? []);
      setUsers(userRes.data ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load driver");
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const linkedUser = useMemo(
    () => users.find((u) => u.id === driver?.user_id),
    [users, driver],
  );

  const deliveryStats = useMemo(() => deliveryStatsFromSales(deliveries), [deliveries]);

  return (
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Distribution", href: "/fulfillment" },
          { label: "Drivers", href: "/fulfillment/drivers" },
          { label: driver?.full_name ?? "Driver" },
        ]}
      />

      {loading ? (
        <p className="text-sm text-slate-500">Loading driver…</p>
      ) : driver ? (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E6F1FB] text-lg font-semibold text-[#0C447C]">
                {driverInitials(driver.full_name)}
              </div>
              <div>
                <h1 className="text-xl font-medium text-slate-900">{driver.full_name}</h1>
                <p className="text-sm text-slate-500">Driver profile</p>
              </div>
            </div>
            <Link
              href={`/fulfillment/drivers?edit=${driver.id}`}
              className="inline-flex items-center rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
            >
              Edit driver
            </Link>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="theme-panel rounded-xl border p-5 shadow-sm">
              <h2 className="text-[15px] font-medium text-slate-900">Contact & details</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <DetailRow label="Phone" value={driver.phone || "—"} />
                <DetailRow label="Driver code" value={driver.driver_code} mono />
                <DetailRow
                  label="Default route"
                  value={driver.default_route?.route_name ?? "—"}
                />
                <DetailRow
                  label="Default vehicle"
                  value={
                    driver.default_vehicle?.vehicle_name ??
                    driver.default_vehicle?.plate_number ??
                    "—"
                  }
                />
                <DetailRow
                  label="Linked user"
                  value={linkedUser?.full_name ?? linkedUser?.username ?? "—"}
                />
                <DetailRow
                  label="Employee record"
                  value={
                    driver.employee
                      ? `${driver.employee.full_name}${driver.employee.employee_code ? ` · ${driver.employee.employee_code}` : ""}`
                      : "—"
                  }
                />
                <DetailRow label="Branch" value={driver.branch?.branch_name ?? "—"} />
                <DetailRow label="Created" value={formatShortDate(driver.created_at)} />
                <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-3">
                  <dt className="text-slate-500">Status</dt>
                  <dd>
                    <DriverStatusBadge active={driver.is_active !== false} />
                  </dd>
                </div>
              </dl>
            </div>

            <div className="theme-panel rounded-xl border p-5 shadow-sm">
              <h2 className="text-[15px] font-medium text-slate-900">Delivery statistics</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Orders linked via fulfillment metadata ({deliveries.length} total)
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <StatCard label="Completed" value={String(deliveryStats.completed)} />
                <StatCard label="Pending" value={String(deliveryStats.pending)} />
                <StatCard label="Cancelled" value={String(deliveryStats.cancelled)} />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-medium text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
