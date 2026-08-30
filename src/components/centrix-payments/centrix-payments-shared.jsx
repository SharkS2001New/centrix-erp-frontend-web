"use client";

import Link from "next/link";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
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
import { useAuth } from "@/contexts/auth-context";
import { isCentrixPaymentsEnabled } from "@/lib/platform-org-features";
import { P } from "@/lib/permission-codes";
import { formatKesCompact, formatShortDate } from "@/components/catalog/catalog-shared";

export {
  DashboardErrorBanner,
  DashboardKpiGrid,
  DashboardLoading,
  DashboardPanel,
  DashboardRefreshButton,
  DashboardSection,
  DashboardSummaryTable,
};

export const PAYMENTS_BRAND = {
  gradient: "from-teal-700 via-teal-600 to-cyan-700",
  soft: "bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-100",
  ring: "ring-teal-500/30",
  accent: "text-teal-700 dark:text-teal-300",
};

export function PaymentsAccessGate({ children, permission, permissionAny, title = "Centrix Payments" }) {
  const { capabilities, hasPermission, organization } = useAuth();
  const enabled = isCentrixPaymentsEnabled(capabilities);

  const allowed =
    enabled &&
    (permissionAny?.length
      ? permissionAny.some((code) => hasPermission?.(code))
      : !permission || hasPermission?.(permission));

  if (!enabled) {
    return (
      <CatalogPageShell title={title} subtitle="Payment collections and reconciliation">
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-6 py-8 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
            Centrix Payments is not enabled for {organization?.org_name ?? "this organization"}.
          </p>
          <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-200/80">
            Your platform operator can turn it on under Platform → Organization → Applications.
          </p>
        </div>
      </CatalogPageShell>
    );
  }

  if (!allowed) {
    return (
      <CatalogPageShell title={title} subtitle="Payment collections and reconciliation">
        <div className="theme-panel rounded-2xl border px-6 py-8 text-sm text-slate-600">
          You do not have permission to view this section. Ask an administrator to grant Centrix Payments
          access on your role.
        </div>
      </CatalogPageShell>
    );
  }

  return children;
}

export function PaymentsHero({ organizationName, subtitle, action, eyebrow = "Centrix Payments" }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${PAYMENTS_BRAND.gradient} px-6 py-7 text-white shadow-lg sm:px-8`}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-cyan-300/20 blur-2xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-8 top-1/2 hidden h-24 w-24 -translate-y-1/2 rounded-2xl border border-white/20 bg-white/5 sm:block"
        aria-hidden
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-100/90">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {organizationName ?? "Payments hub"}
          </h1>
          {subtitle ? <p className="mt-2 max-w-2xl text-sm text-teal-50/90">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

function StatusDot({ ok, warn = false }) {
  const tone = ok ? "bg-emerald-400" : warn ? "bg-amber-400" : "bg-rose-400";
  return <span className={`inline-block h-2 w-2 rounded-full ${tone}`} aria-hidden />;
}

export function PaymentsProviderCard({ title, description, ready, warn, href, actionLabel = "Configure", icon }) {
  return (
    <div className="theme-panel flex h-full flex-col rounded-xl border p-5 shadow-sm transition hover:border-teal-500/30 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          {icon ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-lg dark:bg-teal-950/50">
              {icon}
            </span>
          ) : null}
          <div>
            <p className="theme-heading text-sm font-semibold">{title}</p>
            <p className="theme-subtext mt-1 text-xs leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <StatusDot ok={ready} warn={warn && !ready} />
          {ready ? "Ready" : warn ? "Setup" : "Off"}
        </div>
      </div>
      {href ? (
        <Link
          href={href}
          className="mt-4 inline-flex text-sm font-medium text-teal-700 hover:text-teal-900 dark:text-teal-300 dark:hover:text-teal-200"
        >
          {actionLabel} →
        </Link>
      ) : null}
    </div>
  );
}

export function PaymentsProviderGrid({ availability, hasPermission }) {
  const canMpesa =
    hasPermission?.(P.centrix_payments.settings.view) ||
    hasPermission?.(P.centrix_payments.mpesa.manage);
  const canEquity =
    hasPermission?.(P.centrix_payments.bank.view) || hasPermission?.(P.centrix_payments.bank.manage);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <PaymentsProviderCard
        title="M-Pesa STK Push"
        description="Collect at checkout and send STK prompts to customer phones."
        ready={Boolean(availability?.mpesa_stk_available)}
        warn={Boolean(availability?.mpesa_configured)}
        href={canMpesa ? "/centrix-payments/settings/mpesa" : undefined}
        actionLabel="M-Pesa settings"
        icon="📲"
      />
      <PaymentsProviderCard
        title="M-Pesa paybills"
        description="Paybill and till shortcodes linked to branches and routes."
        ready={Boolean(availability?.mpesa_configured)}
        warn
        href={canMpesa ? "/centrix-payments/settings/paybills" : undefined}
        actionLabel="Manage paybills"
        icon="🏪"
      />
      <PaymentsProviderCard
        title="Equity Bank"
        description="Collection accounts for paybill reconciliation."
        ready={Boolean(availability?.equity_configured)}
        warn
        href={canEquity ? "/centrix-payments/settings/equity" : undefined}
        actionLabel="Bank accounts"
        icon="🏦"
      />
      <PaymentsProviderCard
        title="Bank accounts"
        description="Statement import and bank-side reconciliation."
        ready={(availability?.bank_accounts_count ?? 0) > 0}
        warn
        href={
          hasPermission?.(P.centrix_payments.accounts.view)
            ? "/centrix-payments/accounts"
            : undefined
        }
        actionLabel="Payment accounts"
        icon="💳"
      />
    </div>
  );
}

export function paymentStatusTone(status) {
  const key = String(status ?? "").toLowerCase();
  if (["completed", "success", "paid", "matched", "reconciled"].includes(key)) {
    return "bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (["pending", "processing", "unmatched"].includes(key)) {
    return "bg-amber-50 text-amber-900 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-200";
  }
  if (["failed", "cancelled", "error", "rejected"].includes(key)) {
    return "bg-rose-50 text-rose-800 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-200";
  }
  return "bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-200";
}

export function PaymentStatusBadge({ status }) {
  const label = status ? String(status).replace(/_/g, " ") : "—";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${paymentStatusTone(status)}`}
    >
      {label}
    </span>
  );
}

export function PaymentsEmptyState({ title, description, actionHref, actionLabel }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900/30">
      <p className="theme-heading text-base font-semibold">{title}</p>
      {description ? <p className="theme-subtext mt-2 max-w-md text-sm">{description}</p> : null}
      {actionHref ? (
        <Link
          href={actionHref}
          className="mt-5 inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
        >
          {actionLabel ?? "Get started"}
        </Link>
      ) : null}
    </div>
  );
}

export const PAYMENTS_QUICK_GROUPS = [
  {
    id: "collect",
    title: "Collect & track",
    subtitle: "Live money in and payment history",
    links: [
      {
        href: "/centrix-payments/transactions",
        title: "Transactions",
        desc: "STK requests, C2B, and recorded payments",
        permission: P.centrix_payments.transactions.view,
      },
      {
        href: "/centrix-payments/accounts",
        title: "Payment accounts",
        desc: "Connected M-Pesa, Equity, and bank accounts",
        permission: P.centrix_payments.accounts.view,
      },
    ],
  },
  {
    id: "configure",
    title: "Configure channels",
    subtitle: "Keys, paybills, and collection accounts",
    links: [
      {
        href: "/centrix-payments/settings",
        title: "Settings hub",
        desc: "M-Pesa Daraja, paybills, and Equity collection accounts",
        permissionAny: [
          P.centrix_payments.settings.view,
          P.centrix_payments.settings.edit,
          P.centrix_payments.mpesa.view,
          P.centrix_payments.mpesa.manage,
          P.centrix_payments.bank.view,
          P.centrix_payments.bank.manage,
        ],
      },
      {
        href: "/centrix-payments/settings/mpesa",
        title: "M-Pesa settings",
        desc: "Daraja consumer key, secret, and STK defaults",
        permissionAny: [P.centrix_payments.settings.view, P.centrix_payments.settings.edit],
      },
      {
        href: "/centrix-payments/settings/paybills",
        title: "Paybill accounts",
        desc: "Shortcodes, tills, and branch routing",
        permissionAny: [P.centrix_payments.mpesa.view, P.centrix_payments.mpesa.manage],
      },
      {
        href: "/centrix-payments/settings/equity",
        title: "Equity Bank",
        desc: "Paybill collection accounts for reconciliation",
        permissionAny: [P.centrix_payments.bank.view, P.centrix_payments.bank.manage],
      },
    ],
  },
  {
    id: "reconcile",
    title: "Reconcile",
    subtitle: "Match provider statements to ERP",
    links: [
      {
        href: "/centrix-payments/reconciliation",
        title: "Reconciliation hub",
        desc: "M-Pesa, Equity, and bank matching workflows",
        permission: P.centrix_payments.reconcile.view,
      },
      {
        href: "/accounting/mpesa-reconciliation",
        title: "M-Pesa matching",
        desc: "Open the detailed M-Pesa reconciliation workspace",
        permission: P.centrix_payments.reconcile.view,
      },
    ],
  },
];

export function filterPaymentsLinks(groups, hasPermission) {
  return groups
    .map((group) => ({
      ...group,
      links: (group.links ?? []).filter((link) => {
        if (link.permissionAny?.length) {
          return link.permissionAny.some((code) => hasPermission?.(code));
        }
        if (link.permission) return hasPermission?.(link.permission);
        return true;
      }),
    }))
    .filter((group) => group.links.length > 0);
}

export function PaymentsQuickLinkGroups({ groups }) {
  if (!groups?.length) return null;
  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <DashboardSection key={group.id} title={group.title} subtitle={group.subtitle}>
          <DashboardQuickLinks links={group.links} />
        </DashboardSection>
      ))}
    </div>
  );
}

export function formatTransactionRow(row) {
  return {
    id: row.id,
    source: row.source ?? "—",
    provider: (row.provider ?? "—").toUpperCase(),
    reference: row.centrix_reference || row.provider_transaction_id || "—",
    amount: formatKesCompact(row.amount ?? 0),
    status: row.status,
    date: formatShortDate(row.transaction_date ?? row.created_at),
    receipt: row.mpesa_receipt || "—",
  };
}

export function PaymentsSettingsBanner({ title, description }) {
  return (
    <div className={`mb-6 rounded-xl border px-5 py-4 ${PAYMENTS_BRAND.soft}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Centrix Payments</p>
      <p className="mt-0.5 text-base font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm opacity-90">{description}</p> : null}
    </div>
  );
}

export function PaymentsSettingsBreadcrumb({ title }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <Link href="/centrix-payments/settings" className="font-medium text-teal-700 hover:text-teal-900 dark:text-teal-300">
        Channel setup
      </Link>
      <span className="text-slate-400">/</span>
      <span className="theme-subtext">{title}</span>
    </nav>
  );
}

export function PaymentsKpiGrid({ items }) {
  if (!items?.length) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.id ?? item.label}
          className="theme-panel relative overflow-hidden rounded-xl border p-5 shadow-sm"
        >
          <div className="pointer-events-none absolute -right-4 -top-4 h-16 w-16 rounded-full bg-teal-500/10" aria-hidden />
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700/80 dark:text-teal-300/80">
            {item.label}
          </p>
          <p className="theme-heading mt-2 text-2xl font-semibold tabular-nums">{item.value}</p>
          {item.hint ? <p className="theme-subtext mt-1.5 text-xs leading-relaxed">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

function setupStepsFromAvailability(availability) {
  return [
    {
      id: "mpesa-keys",
      label: "Connect Safaricom Daraja",
      description: "Add consumer key, secret, and STK push defaults.",
      done: Boolean(availability?.mpesa_configured),
      href: "/centrix-payments/settings/mpesa",
    },
    {
      id: "paybills",
      label: "Register paybills & tills",
      description: "Map shortcodes to branches, routes, or outlets.",
      done: Boolean(availability?.mpesa_configured),
      href: "/centrix-payments/settings/paybills",
    },
    {
      id: "equity",
      label: "Add Equity collection accounts",
      description: "Enable paybill reconciliation with Equity Bank.",
      done: Boolean(availability?.equity_configured),
      href: "/centrix-payments/settings/equity",
    },
    {
      id: "accounts",
      label: "Sync payment accounts",
      description: "Pull connected accounts into the unified ledger view.",
      done: (availability?.bank_accounts_count ?? 0) > 0,
      href: "/centrix-payments/accounts",
    },
  ];
}

export function PaymentsAttentionStrip({ availability, totals, hasPermission }) {
  const exceptions = (totals?.failed_payments ?? 0) + (totals?.unmatched_payments ?? 0);
  const pending = totals?.pending_payments ?? 0;
  const steps = setupStepsFromAvailability(availability ?? {});
  const incompleteSetup = steps.filter((step) => !step.done);

  const canConfigure =
    hasPermission?.(P.centrix_payments.settings.view) ||
    hasPermission?.(P.centrix_payments.settings.edit) ||
    hasPermission?.(P.centrix_payments.mpesa.manage);
  const canViewTransactions = hasPermission?.(P.centrix_payments.transactions.view);

  if ((!incompleteSetup.length || !canConfigure) && exceptions === 0 && pending === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {incompleteSetup.length > 0 && canConfigure ? (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
            {incompleteSetup.length} channel setup step{incompleteSetup.length === 1 ? "" : "s"} remaining
          </p>
          <Link
            href={incompleteSetup[0]?.href ?? "/centrix-payments/settings/mpesa"}
            className="mt-1 inline-block text-sm font-medium text-teal-800 hover:underline dark:text-teal-200"
          >
            Continue in Channel setup →
          </Link>
        </div>
      ) : null}
      {canViewTransactions && (exceptions > 0 || pending > 0) ? (
        <div className="theme-panel rounded-xl border px-4 py-3">
          <p className="theme-heading text-sm font-medium">Activity needing review</p>
          <p className="theme-subtext mt-1 text-sm">
            {pending > 0 ? `${pending} pending` : null}
            {pending > 0 && exceptions > 0 ? " · " : null}
            {exceptions > 0 ? `${exceptions} failed or unmatched` : null}
          </p>
          <Link
            href="/centrix-payments/transactions"
            className="mt-2 inline-block text-sm font-medium text-teal-700 hover:underline dark:text-teal-300"
          >
            Open transaction ledger →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export function PaymentsSetupGuide({ availability, hasPermission }) {
  const steps = setupStepsFromAvailability(availability ?? {});
  const incomplete = steps.filter((step) => !step.done);
  if (incomplete.length === 0) return null;

  const canConfigure =
    hasPermission?.(P.centrix_payments.settings.view) ||
    hasPermission?.(P.centrix_payments.settings.edit) ||
    hasPermission?.(P.centrix_payments.mpesa.manage);

  return (
    <div className={`rounded-2xl border px-6 py-5 ${PAYMENTS_BRAND.soft}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Getting started</p>
          <p className="mt-1 text-base font-semibold">Finish setting up your payment channels</p>
          <p className="mt-1 text-sm opacity-90">
            {incomplete.length} step{incomplete.length === 1 ? "" : "s"} remaining before you can collect and reconcile
            with confidence.
          </p>
        </div>
        {canConfigure ? (
          <Link
            href="/centrix-payments/settings"
            className="inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            Open channel setup
          </Link>
        ) : null}
      </div>
      <ol className="mt-5 space-y-3">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
              step.done
                ? "border-emerald-200/60 bg-white/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                : "border-teal-200/60 bg-white/80 dark:border-teal-900/40 dark:bg-teal-950/20"
            }`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                step.done ? "bg-emerald-600 text-white" : "bg-teal-700 text-white"
              }`}
            >
              {step.done ? "✓" : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{step.label}</p>
              <p className="mt-0.5 text-xs opacity-80">{step.description}</p>
            </div>
            {!step.done && canConfigure ? (
              <Link href={step.href} className="shrink-0 text-sm font-medium text-teal-800 hover:underline dark:text-teal-200">
                Set up →
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export const PAYMENTS_SETTINGS_ITEMS = [
  {
    href: "/admin/mpesa-settings",
    title: "M-Pesa settings",
    description: "Safaricom Daraja credentials, STK push defaults, and organization-wide M-Pesa behaviour.",
    badge: "Daraja",
    tone: "from-emerald-600 to-teal-700",
    icon: "📲",
    permissionAny: [P.centrix_payments.settings.view, P.centrix_payments.settings.edit],
  },
  {
    href: "/admin/mpesa-paybills",
    title: "Paybill accounts",
    description: "Shortcodes, tills, and branch or route routing for Lipa na M-Pesa collections.",
    badge: "M-Pesa",
    tone: "from-teal-700 to-cyan-700",
    icon: "🏪",
    permissionAny: [
      P.centrix_payments.mpesa.view,
      P.centrix_payments.mpesa.manage,
      P.centrix_payments.accounts.view,
    ],
  },
  {
    href: "/admin/equity-accounts",
    title: "Equity Bank",
    description: "Collection accounts and paybill reconciliation with Equity Bank.",
    badge: "Bank",
    tone: "from-sky-700 to-indigo-700",
    icon: "🏦",
    permissionAny: [P.centrix_payments.bank.view, P.centrix_payments.bank.manage],
  },
];

export function PaymentsSettingsGrid({ items }) {
  if (!items?.length) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="theme-panel group overflow-hidden rounded-2xl border shadow-sm transition hover:border-teal-500/40 hover:shadow-md"
        >
          <div className={`bg-gradient-to-r ${item.tone} px-5 py-4 text-white`}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-2xl" aria-hidden>
                {item.icon}
              </span>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {item.badge}
              </span>
            </div>
            <h3 className="mt-3 text-lg font-semibold group-hover:underline">{item.title}</h3>
          </div>
          <p className="px-5 py-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{item.description}</p>
          <p className="px-5 pb-4 text-sm font-medium text-teal-700 dark:text-teal-300">Configure →</p>
        </Link>
      ))}
    </div>
  );
}
