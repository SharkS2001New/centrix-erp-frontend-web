"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { CatalogPageShell, PrimaryLink } from "@/components/catalog/catalog-shared";
import {
  DashboardErrorBanner,
  DashboardKpiGrid,
  DashboardLoading,
  DashboardPanel,
  DashboardQuickLinks,
  DashboardRefreshButton,
  DashboardSection,
  DashboardSummaryTable,
} from "@/components/dashboard/dashboard-shared";
import { DonutChart, CHART_COLORS } from "@/components/reports/report-charts";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { apiRequest } from "@/lib/api";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import { useOrgFormat } from "@/lib/org-format";
import { P } from "@/lib/permission-codes";
import { HOSPITALITY_REPORT_DEFS } from "@/lib/reports/hospitality-reports";

const ROOM_STATUS_ROWS = [
  { key: "occupied", label: "Occupied", color: "#0f766e" },
  { key: "dirty", label: "Dirty", color: "#d97706" },
  { key: "clean", label: "Clean", color: "#0284c7" },
  { key: "vacant", label: "Vacant", color: "#64748b" },
  { key: "ooo", label: "Out of order", color: "#e11d48" },
];

const QUICK_LINKS = [
  {
    href: "/hospitality/front-desk",
    title: "Front desk",
    desc: "Check-in, check-out, room board",
    service: "front_desk",
    permission: P.hospitality.frontdesk.view,
  },
  {
    href: "/hospitality/rooms",
    title: "Rooms & rates",
    desc: "Inventory, types, and rate plans",
    service: "rooms",
    permission: P.hospitality.rooms.view,
  },
  {
    href: "/hospitality/reservations",
    title: "Reservations",
    desc: "Bookings and stay timeline",
    service: "reservations",
    permission: P.hospitality.reservations.view,
  },
  {
    href: "/hospitality/folios",
    title: "Guest folios",
    desc: "Charges, payments, balances",
    service: "folios",
    permission: P.hospitality.folios.view,
  },
  {
    href: "/hospitality/housekeeping",
    title: "Housekeeping",
    desc: "Dirty, clean, out of order",
    service: "housekeeping",
    permission: P.hospitality.housekeeping.view,
  },
  {
    href: "/hospitality/orders",
    title: "All orders",
    desc: "Hotel and bar checks",
    permissionAny: [
      P.hospitality.orders.view,
      P.hospitality.dashboard.view,
      P.hotel_bar_pos.checks.view,
    ],
  },
  {
    href: "/hospitality/orders/hotel",
    title: "Hotel orders",
    desc: "Restaurant & room service",
    permissionAny: [
      P.hospitality.orders.view,
      P.hospitality.dashboard.view,
      P.hotel_bar_pos.checks.view,
    ],
  },
  {
    href: "/hospitality/orders/bar",
    title: "Bar orders",
    desc: "Bar checks and settlements",
    permissionAny: [
      P.hospitality.orders.view,
      P.hospitality.dashboard.view,
      P.hotel_bar_pos.checks.view,
    ],
  },
  {
    href: "/hospitality/payments-breakdown",
    title: "Payments breakdown",
    desc: "Tenders for today",
    permissionAny: [P.hospitality.payments_breakdown.view, P.hospitality.reports.view],
  },
  {
    href: "/hospitality/end-of-day",
    title: "End of day",
    desc: "Cashier close totals",
    permission: P.hospitality.reports.view,
  },
  {
    href: "/hospitality/outlets",
    title: "Outlets & tables",
    desc: "Bars, restaurants, floor plans",
    permission: P.hospitality.outlets.view,
  },
  {
    href: "/hospitality/night-audit",
    title: "Night audit",
    desc: "Post room revenue and close date",
    service: "night_audit",
    permission: P.hospitality.night_audit.view,
  },
  {
    href: "/inventory/stock",
    title: "Stock on hand",
    desc: "Kitchen and bar quantities",
    permission: P.inventory.stock.view,
  },
  {
    href: "/lpo",
    title: "Purchase orders",
    desc: "Supply for F&B outlets",
    permission: P.purchasing.lpo.view,
  },
  {
    href: "/products",
    title: "Menu catalogue",
    desc: "Hotel and bar sellable items",
    permission: P.catalogue.products.view,
  },
  {
    href: "/reports",
    title: "Hospitality reports",
    desc: "Occupancy, flash, F&B, P&L",
    permissionAny: [P.hospitality.reports.view, P.reports.hub.view],
  },
];

function linkVisible(item, capabilities, hasPermission) {
  if (item.service && !isHospitalityServiceEnabled(capabilities, item.service)) return false;
  if (item.permissionAny?.length) {
    return item.permissionAny.some((code) => hasPermission(code));
  }
  if (item.permission) return hasPermission(item.permission);
  return true;
}

function statusLabel(status) {
  return String(status ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function RoomStatusBoard({ rooms }) {
  const total = Number(rooms.total ?? 0);
  const occupancyPct = Number(rooms.occupancy_pct ?? 0);
  const rows = ROOM_STATUS_ROWS.map((row) => ({
    ...row,
    value: Number(rooms[row.key] ?? 0),
  }));
  const occupied = Number(rooms.occupied ?? 0);

  if (total <= 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--theme-border)] px-4 py-8 text-center">
        <p className="theme-heading text-sm font-medium">No rooms configured yet</p>
        <p className="theme-subtext mt-1 text-xs">Add room types and rooms to start tracking occupancy.</p>
        <Link href="/hospitality/rooms" className="theme-link mt-3 inline-block text-xs font-medium">
          Open rooms →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="theme-heading text-3xl font-semibold tabular-nums">{occupancyPct}%</p>
          <p className="theme-subtext text-sm">
            {occupied.toLocaleString()} of {total.toLocaleString()} rooms occupied
          </p>
        </div>
        <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[var(--theme-hover)]">
          {rows
            .filter((row) => row.value > 0)
            .map((row) => (
              <span
                key={row.key}
                className="h-full"
                style={{ width: `${(row.value / total) * 100}%`, backgroundColor: row.color }}
                title={`${row.label}: ${row.value}`}
              />
            ))}
        </div>
      </div>

      <ul className="space-y-2.5">
        {rows.map((row) => {
          const pct = total > 0 ? Math.round((row.value / total) * 100) : 0;
          return (
            <li key={row.key} className="flex items-center gap-3 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="min-w-0 flex-1 text-[var(--theme-text)]">{row.label}</span>
              <span className="theme-heading tabular-nums font-medium">{row.value.toLocaleString()}</span>
              <span className="theme-subtext w-10 text-right text-xs tabular-nums">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AttentionCard({ label, value, hint, href, tone = "default" }) {
  const toneClass =
    tone === "warn"
      ? "border-amber-200/80 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20"
      : tone === "danger"
        ? "border-rose-200/80 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20"
        : "theme-panel border";

  const inner = (
    <div className={`rounded-xl border px-4 py-3 shadow-sm ${toneClass}`}>
      <p className="theme-subtext text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="theme-heading mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="theme-subtext mt-1 text-xs">{hint}</p> : null}
    </div>
  );

  if (!href) return inner;
  return (
    <Link href={href} className="block transition hover:opacity-90">
      {inner}
    </Link>
  );
}

export function HospitalityDashboardContent() {
  const { capabilities, hasPermission } = useAuth();
  const fmt = useOrgFormat();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);

  const loadDashboard = useCallback(async ({ soft = false } = {}) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("/hospitality/dashboard", { loading: false });
      setSummary(res ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hospitality dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useTabAwareDataLoad(loadDashboard);

  const quickLinks = useMemo(
    () => QUICK_LINKS.filter((item) => linkVisible(item, capabilities, hasPermission)),
    [capabilities, hasPermission],
  );

  const reportLinks = useMemo(
    () =>
      hasPermission(P.hospitality.reports.view)
        ? HOSPITALITY_REPORT_DEFS.slice(0, 8).map((r) => ({
            href: `/reports/${r.key}`,
            title: r.label,
            desc: r.subtitle,
          }))
        : [],
    [hasPermission],
  );

  const rooms = summary?.rooms ?? {};
  const kpis = summary?.kpis ?? {};
  const fnb = summary?.fnb_today ?? {};
  const nightAudit = summary?.night_audit;

  const canOpenFrontDesk =
    isHospitalityServiceEnabled(capabilities, "front_desk") && hasPermission(P.hospitality.frontdesk.view);
  const canOpenOrders =
    hasPermission(P.hospitality.orders.view) || hasPermission(P.hotel_bar_pos.checks.view);
  const foliosEnabled = isHospitalityServiceEnabled(capabilities, "folios");
  const housekeepingEnabled =
    isHospitalityServiceEnabled(capabilities, "housekeeping") &&
    hasPermission(P.hospitality.housekeeping.view);
  const nightAuditEnabled =
    isHospitalityServiceEnabled(capabilities, "night_audit") &&
    hasPermission(P.hospitality.night_audit.view);

  const roomStatusSegments = useMemo(
    () =>
      ROOM_STATUS_ROWS.map((row, i) => ({
        label: row.label,
        value: Number(rooms[row.key] ?? 0),
        color: row.color ?? CHART_COLORS[i % CHART_COLORS.length],
      })).filter((s) => s.value > 0),
    [rooms],
  );

  const outletSegments = useMemo(
    () =>
      (summary?.fnb_by_outlet ?? []).map((row, i) => ({
        label: row.outlet_name ?? row.outlet_code ?? "Outlet",
        value: Number(row.collected ?? row.gross_sales ?? 0),
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [summary?.fnb_by_outlet],
  );

  const kpiItems = [
    {
      id: "occupancy",
      label: "Occupancy",
      value: `${Number(kpis.occupancy_pct ?? rooms.occupancy_pct ?? 0)}%`,
      hint: `${Number(rooms.occupied ?? 0).toLocaleString()} / ${Number(rooms.total ?? 0).toLocaleString()} rooms`,
    },
    {
      id: "adr",
      label: "ADR",
      value: fmt.currency(kpis.adr ?? 0),
      hint: "Average daily rate today",
    },
    {
      id: "revpar",
      label: "RevPAR",
      value: fmt.currency(kpis.revpar ?? 0),
      hint: "Revenue per available room",
    },
    {
      id: "room_rev",
      label: "Room revenue",
      value: fmt.currency(kpis.room_revenue ?? 0),
      hint: `${Number(kpis.room_nights ?? 0).toLocaleString()} room nights`,
    },
    {
      id: "fnb",
      label: "F&B collected",
      value: fmt.currency(fnb.collected ?? kpis.fnb_collected ?? 0),
      hint: `${Number(fnb.checks ?? 0).toLocaleString()} paid checks`,
    },
    {
      id: "total_rev",
      label: "Total revenue today",
      value: fmt.currency(kpis.total_revenue ?? 0),
      hint: "Rooms + F&B collected",
    },
    {
      id: "arrivals",
      label: "Arrivals today",
      value: Number(summary?.arrivals_today ?? 0).toLocaleString(),
      hint: "Expected check-ins",
    },
    {
      id: "departures",
      label: "Departures today",
      value: Number(summary?.departures_today ?? 0).toLocaleString(),
      hint: "Due to check out",
    },
  ];

  const subtitle = summary?.as_of
    ? `Live house status · Rooms, guests, and F&B · Updated ${fmt.dateTime(summary.as_of)}`
    : "Live house status — rooms, guests, folios, and food & drink";

  return (
    <CatalogPageShell
      title="Hospitality overview"
      subtitle={subtitle}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <DashboardRefreshButton
            onClick={() => void loadDashboard({ soft: true })}
            loading={loading || refreshing}
          />
          {canOpenFrontDesk ? (
            <PrimaryLink href="/hospitality/front-desk" showIcon={false}>
              Front desk
            </PrimaryLink>
          ) : canOpenOrders ? (
            <PrimaryLink href="/hospitality/orders" showIcon={false}>
              Orders
            </PrimaryLink>
          ) : null}
        </div>
      }
    >
      <DashboardErrorBanner message={error} />

      {loading ? (
        <DashboardLoading />
      ) : (
        <div className="space-y-8">
          <DashboardKpiGrid items={kpiItems} />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AttentionCard
              label="In house"
              value={Number(kpis.in_house ?? rooms.occupied ?? 0).toLocaleString()}
              hint="Checked-in guests"
              href={canOpenFrontDesk ? "/hospitality/front-desk" : undefined}
            />
            <AttentionCard
              label="Dirty rooms"
              value={Number(rooms.dirty ?? 0).toLocaleString()}
              hint="Waiting on housekeeping"
              href={housekeepingEnabled ? "/hospitality/housekeeping" : undefined}
              tone={Number(rooms.dirty ?? 0) > 0 ? "warn" : "default"}
            />
            {foliosEnabled ? (
              <AttentionCard
                label="Open folio balance"
                value={fmt.currency(summary?.open_folio_balance ?? 0)}
                hint={`${Number(summary?.open_folios ?? 0).toLocaleString()} open folios`}
                href={hasPermission(P.hospitality.folios.view) ? "/hospitality/folios" : undefined}
                tone={Number(summary?.open_folio_balance ?? 0) > 0 ? "warn" : "default"}
              />
            ) : (
              <AttentionCard
                label="Open F&B checks"
                value={Number(fnb.open_checks ?? 0).toLocaleString()}
                hint={`Outstanding ${fmt.currency(fnb.open_balance ?? fnb.open_amount ?? 0)}`}
                href={canOpenOrders ? "/hospitality/orders" : undefined}
                tone={Number(fnb.open_checks ?? 0) > 0 ? "warn" : "default"}
              />
            )}
            {nightAuditEnabled && nightAudit ? (
              <AttentionCard
                label="Night audit"
                value={nightAudit.yesterday_complete ? "Complete" : "Pending"}
                hint={
                  nightAudit.yesterday_complete
                    ? `Last posted ${nightAudit.last_business_date ?? "—"}`
                    : `Close ${nightAudit.yesterday_date}`
                }
                href="/hospitality/night-audit"
                tone={nightAudit.yesterday_complete ? "default" : "danger"}
              />
            ) : (
              <AttentionCard
                label="Open F&B checks"
                value={Number(fnb.open_checks ?? 0).toLocaleString()}
                hint={`Outstanding ${fmt.currency(fnb.open_balance ?? fnb.open_amount ?? 0)}`}
                href={canOpenOrders ? "/hospitality/orders" : undefined}
                tone={Number(fnb.open_checks ?? 0) > 0 ? "warn" : "default"}
              />
            )}
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <DashboardPanel
              title="Room status"
              subtitle="Active rooms on the board"
              className="xl:col-span-1"
              headerAction={
                housekeepingEnabled ? (
                  <Link href="/hospitality/housekeeping" className="theme-link text-xs font-medium">
                    Housekeeping →
                  </Link>
                ) : canOpenFrontDesk ? (
                  <Link href="/hospitality/front-desk" className="theme-link text-xs font-medium">
                    Front desk →
                  </Link>
                ) : null
              }
            >
              <RoomStatusBoard rooms={rooms} />
            </DashboardPanel>

            <DashboardPanel title="Room mix" subtitle="Share by housekeeping status">
              <DonutChart
                segments={roomStatusSegments}
                loading={false}
                emptyMessage="No rooms configured."
              />
            </DashboardPanel>

            <DashboardPanel
              title="F&B by outlet"
              subtitle="Collected today"
              headerAction={
                canOpenOrders ? (
                  <Link href="/hospitality/orders" className="theme-link text-xs font-medium">
                    Orders →
                  </Link>
                ) : null
              }
            >
              <DonutChart
                segments={outletSegments}
                loading={false}
                emptyMessage="No food & drink sales today."
              />
              {(summary?.fnb_by_outlet ?? []).length ? (
                <ul className="mt-4 space-y-2 border-t border-[var(--theme-border)] pt-3 text-sm">
                  {(summary?.fnb_by_outlet ?? []).slice(0, 4).map((row) => (
                    <li key={row.outlet_code} className="flex justify-between gap-3">
                      <span className="theme-subtext truncate">{row.outlet_name}</span>
                      <span className="theme-heading shrink-0 tabular-nums font-medium">
                        {fmt.currency(row.collected ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </DashboardPanel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <DashboardSection
              title="Arrivals today"
              subtitle="Guests expected to check in"
              action={
                hasPermission(P.hospitality.reservations.view) ? (
                  <Link href="/hospitality/reservations" className="text-sm text-[#185FA5] hover:underline">
                    All reservations
                  </Link>
                ) : null
              }
            >
              <DashboardSummaryTable
                columns={[
                  { key: "guest_name", label: "Guest" },
                  { key: "room_number", label: "Room" },
                  { key: "room_type", label: "Type" },
                  { key: "status", label: "Status" },
                ]}
                rows={summary?.arrivals ?? []}
                emptyMessage="No arrivals scheduled for today."
                formatValue={(key, value) =>
                  key === "status" ? statusLabel(value) : value == null || value === "" ? "—" : String(value)
                }
                viewAllHref={canOpenFrontDesk ? "/hospitality/front-desk" : "/hospitality/reservations"}
                viewAllLabel="Open front desk →"
              />
            </DashboardSection>

            <DashboardSection
              title="Departures today"
              subtitle="Guests due to check out"
              action={
                canOpenFrontDesk ? (
                  <Link href="/hospitality/front-desk" className="text-sm text-[#185FA5] hover:underline">
                    Front desk
                  </Link>
                ) : null
              }
            >
              <DashboardSummaryTable
                columns={[
                  { key: "guest_name", label: "Guest" },
                  { key: "room_number", label: "Room" },
                  { key: "room_type", label: "Type" },
                  { key: "status", label: "Status" },
                ]}
                rows={summary?.departures ?? []}
                emptyMessage="No departures due today."
                formatValue={(key, value) =>
                  key === "status" ? statusLabel(value) : value == null || value === "" ? "—" : String(value)
                }
                viewAllHref={canOpenFrontDesk ? "/hospitality/front-desk" : "/hospitality/reservations"}
                viewAllLabel="Open front desk →"
              />
            </DashboardSection>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {foliosEnabled ? (
              <DashboardSection
                title="Open folios"
                subtitle="Highest outstanding guest balances"
                action={
                  hasPermission(P.hospitality.folios.view) ? (
                    <Link href="/hospitality/folios" className="text-sm text-[#185FA5] hover:underline">
                      All folios
                    </Link>
                  ) : null
                }
              >
                <DashboardSummaryTable
                  columns={[
                    { key: "guest_name", label: "Guest" },
                    { key: "room_number", label: "Room" },
                    { key: "folio_number", label: "Folio", mono: true },
                    { key: "balance", label: "Balance", align: "right" },
                  ]}
                  rows={summary?.open_folios_list ?? []}
                  emptyMessage="No open folios."
                  formatValue={(key, value) =>
                    key === "balance" ? fmt.currency(value ?? 0) : value == null || value === "" ? "—" : String(value)
                  }
                  viewAllHref="/hospitality/folios"
                />
              </DashboardSection>
            ) : null}

            <DashboardSection
              title="Open F&B checks"
              subtitle="Unpaid, partial, held, and open orders"
              action={
                canOpenOrders ? (
                  <Link href="/hospitality/orders" className="text-sm text-[#185FA5] hover:underline">
                    All orders
                  </Link>
                ) : null
              }
            >
              <DashboardSummaryTable
                columns={[
                  { key: "check_number", label: "Check", mono: true },
                  { key: "outlet_name", label: "Outlet" },
                  { key: "status", label: "Status" },
                  { key: "balance", label: "Balance", align: "right" },
                ]}
                rows={summary?.open_checks ?? []}
                emptyMessage="No open food & drink checks."
                formatValue={(key, value) =>
                  key === "balance"
                    ? fmt.currency(value ?? 0)
                    : key === "status"
                      ? statusLabel(value)
                      : value == null || value === ""
                        ? "—"
                        : String(value)
                }
                viewAllHref="/hospitality/orders"
              />
            </DashboardSection>
          </div>

          <DashboardSection title="Hospitality tools" subtitle="Jump into day-to-day operations">
            <DashboardQuickLinks links={quickLinks} />
          </DashboardSection>

          {reportLinks.length ? (
            <DashboardSection
              title="Key reports"
              subtitle="Occupancy, flash, and food & drink analytics"
              action={
                <Link href="/reports" className="text-sm text-[#185FA5] hover:underline">
                  All reports
                </Link>
              }
            >
              <DashboardQuickLinks links={reportLinks} />
            </DashboardSection>
          ) : null}
        </div>
      )}
    </CatalogPageShell>
  );
}
