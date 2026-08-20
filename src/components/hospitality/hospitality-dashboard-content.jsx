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
} from "@/components/dashboard/dashboard-shared";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { apiRequest } from "@/lib/api";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import { useOrgFormat } from "@/lib/org-format";
import { P } from "@/lib/permission-codes";

const ROOM_STATUS_ROWS = [
  { key: "occupied", label: "Occupied", color: "#0f766e" },
  { key: "dirty", label: "Dirty", color: "#d97706" },
  { key: "clean", label: "Clean", color: "#0284c7" },
  { key: "vacant", label: "Vacant", color: "#64748b" },
  { key: "ooo", label: "Out of order", color: "#e11d48" },
];

const LINK_GROUPS = [
  {
    id: "rooms",
    title: "Rooms & guests",
    subtitle: "Front of house for tonight’s board",
    links: [
      {
        href: "/hospitality/front-desk",
        title: "Front desk",
        desc: "Check-in, check-out, and the room board",
        service: "front_desk",
        permission: P.hospitality.frontdesk.view,
      },
      {
        href: "/hospitality/rooms",
        title: "Rooms & rate plans",
        desc: "Room inventory, types, and nightly rates",
        service: "rooms",
        permission: P.hospitality.rooms.view,
      },
      {
        href: "/hospitality/reservations",
        title: "Reservations",
        desc: "Arrivals, stays, and upcoming bookings",
        service: "reservations",
        permission: P.hospitality.reservations.view,
      },
      {
        href: "/hospitality/folios",
        title: "Guest folios",
        desc: "Open balances, charges, and payments",
        service: "folios",
        permission: P.hospitality.folios.view,
      },
      {
        href: "/hospitality/housekeeping",
        title: "Housekeeping",
        desc: "Dirty, clean, and out-of-order rooms",
        service: "housekeeping",
        permission: P.hospitality.housekeeping.view,
      },
    ],
  },
  {
    id: "fnb",
    title: "Food & beverage",
    subtitle: "Checks, menu, and outlet sales",
    links: [
      {
        href: "/hospitality/orders",
        title: "All orders",
        desc: "Hotel and bar checks in one list",
        permissionAny: [
          P.hospitality.orders.view,
          P.hospitality.dashboard.view,
          P.hotel_bar_pos.checks.view,
        ],
      },
      {
        href: "/hospitality/orders/hotel",
        title: "Hotel orders",
        desc: "Restaurant and room-service checks",
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
        href: "/products",
        title: "Menu catalogue",
        desc: "Items sold on Hotel and Bar POS",
        permission: P.catalogue.products.view,
      },
      {
        href: "/admin/hotel-settings",
        title: "Hotel F&B settings",
        desc: "Recipes, VAT, and deduct-on-settle",
        permission: P.hospitality.settings.view,
      },
    ],
  },
  {
    id: "stock",
    title: "Purchasing & stock",
    subtitle: "Kitchen and bar supply chain",
    links: [
      {
        href: "/lpo",
        title: "Purchase orders",
        desc: "Open and received LPOs",
        permission: P.purchasing.lpo.view,
      },
      {
        href: "/lpo/new",
        title: "New LPO",
        desc: "Raise a purchase order",
        permission: P.purchasing.lpo.create,
      },
      {
        href: "/inventory/receipts/receive",
        title: "Receive stock",
        desc: "Post goods into shop or store",
        permission: P.inventory.receipts.create,
      },
      {
        href: "/inventory/receipts",
        title: "Goods received",
        desc: "GRN history and receipts",
        permission: P.inventory.receipts.view,
      },
      {
        href: "/inventory/stock",
        title: "Stock on hand",
        desc: "Available kitchen and bar quantities",
        permission: P.inventory.stock.view,
      },
    ],
  },
  {
    id: "ops",
    title: "Operations",
    subtitle: "House setup and close of day",
    links: [
      {
        href: "/hospitality/outlets",
        title: "Outlets & tables",
        desc: "Bars, restaurants, and floor plans",
        permission: P.hospitality.outlets.view,
      },
      {
        href: "/hospitality/night-audit",
        title: "Night audit",
        desc: "Close the business date and post room revenue",
        service: "night_audit",
        permission: P.hospitality.night_audit.view,
      },
    ],
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

function MetricRow({ label, value, hint, emphasize = false }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${emphasize ? "border-t border-[var(--theme-border)] pt-3" : ""}`}>
      <div>
        <dt className="theme-subtext text-sm">{label}</dt>
        {hint ? <p className="theme-subtext mt-0.5 text-xs">{hint}</p> : null}
      </div>
      <dd className={`shrink-0 text-right tabular-nums ${emphasize ? "theme-heading font-semibold" : "theme-heading font-medium"}`}>
        {value}
      </dd>
    </div>
  );
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

  const groups = useMemo(
    () =>
      LINK_GROUPS.map((group) => ({
        ...group,
        links: group.links.filter((item) => linkVisible(item, capabilities, hasPermission)),
      })).filter((group) => group.links.length > 0),
    [capabilities, hasPermission],
  );

  const rooms = summary?.rooms ?? {};
  const fnb = summary?.fnb_today ?? {};
  const canOpenFrontDesk =
    isHospitalityServiceEnabled(capabilities, "front_desk") && hasPermission(P.hospitality.frontdesk.view);
  const canOpenOrders = hasPermission(P.hospitality.orders.view) || hasPermission(P.hotel_bar_pos.checks.view);
  const canSeeSettings = hasPermission(P.hospitality.settings.view);
  const foliosEnabled = isHospitalityServiceEnabled(capabilities, "folios");
  const housekeepingEnabled =
    isHospitalityServiceEnabled(capabilities, "housekeeping") && hasPermission(P.hospitality.housekeeping.view);

  const kpiItems = [
    {
      id: "occupancy",
      label: "Occupancy",
      value: `${Number(rooms.occupancy_pct ?? 0)}%`,
      hint: `${Number(rooms.occupied ?? 0).toLocaleString()} / ${Number(rooms.total ?? 0).toLocaleString()} rooms`,
    },
    {
      id: "arrivals",
      label: "Arrivals today",
      value: Number(summary?.arrivals_today ?? 0).toLocaleString(),
      hint: "Booked for today",
    },
    {
      id: "departures",
      label: "Departures today",
      value: Number(summary?.departures_today ?? 0).toLocaleString(),
      hint: "Due to check out",
    },
    foliosEnabled
      ? {
          id: "folios",
          label: "Open folios",
          value: Number(summary?.open_folios ?? 0).toLocaleString(),
          hint: `Balance ${fmt.currency(summary?.open_folio_balance ?? 0)}`,
        }
      : {
          id: "open_fnb",
          label: "Open checks",
          value: Number(fnb.open_checks ?? 0).toLocaleString(),
          hint: `Outstanding ${fmt.currency(fnb.open_amount ?? 0)}`,
        },
  ];

  const subtitle = summary?.as_of
    ? `Rooms, arrivals, and F&B for today · Updated ${fmt.dateTime(summary.as_of)}`
    : "Rooms, arrivals, guest folios, and F&B for today";

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

          <div className="grid gap-4 lg:grid-cols-2">
            <DashboardPanel
              title="Room status"
              subtitle="Active rooms on the board"
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

            <DashboardPanel
              title="F&B today"
              subtitle="Paid checks closed today"
              headerAction={
                canOpenOrders ? (
                  <Link href="/hospitality/orders" className="theme-link text-xs font-medium">
                    All orders →
                  </Link>
                ) : null
              }
            >
              <dl className="space-y-3">
                <MetricRow label="Paid checks" value={Number(fnb.checks ?? 0).toLocaleString()} />
                <MetricRow
                  label="Open checks"
                  value={Number(fnb.open_checks ?? 0).toLocaleString()}
                  hint={`Outstanding ${fmt.currency(fnb.open_amount ?? 0)}`}
                />
                <MetricRow
                  label="Revenue"
                  value={fmt.currency(fnb.revenue ?? 0)}
                  hint="Paid and settled today"
                  emphasize
                />
              </dl>
              {canSeeSettings ? (
                <p className="theme-subtext mt-5 border-t border-[var(--theme-border)] pt-4 text-xs leading-relaxed">
                  Recipes deduct from stock when Hotel POS settle is enabled.{" "}
                  <Link href="/admin/hotel-settings" className="theme-link font-medium">
                    Hotel F&amp;B settings →
                  </Link>
                </p>
              ) : null}
            </DashboardPanel>
          </div>

          {groups.map((group) => (
            <DashboardSection key={group.id} title={group.title} subtitle={group.subtitle}>
              <DashboardQuickLinks links={group.links} />
            </DashboardSection>
          ))}
        </div>
      )}
    </CatalogPageShell>
  );
}
