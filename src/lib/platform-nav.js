/** Grouped platform administration links (sidebar + overview page). */

/** @typedef {{ href: string, label: string, description?: string, exact?: boolean, icon?: string, buttonClass?: string }} PlatformLink */

/** @typedef {{ id: string, label: string, links: PlatformLink[] }} PlatformLinkGroup */

/** @type {PlatformLinkGroup[]} */
export const PLATFORM_LINK_GROUPS = [
  {
    id: "tenants",
    label: "Tenants",
    links: [
      {
        href: "/platform",
        label: "Overview",
        exact: true,
        icon: "platform",
        description: "Platform home and quick links to tenant and operations tools.",
      },
      {
        href: "/platform/organizations",
        label: "Tenant organizations",
        icon: "building",
        description: "All registered organizations and quick access to tenant configuration.",
      },
      {
        href: "/platform/organizations/new",
        label: "Register organization",
        icon: "plus",
        description: "Provision a new company code, modules, sales behaviour, and initial administrator.",
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    links: [
      {
        href: "/platform/ai-training",
        label: "AI training",
        icon: "star",
        description: "Platform test console and OpenAI credentials for super-admin knowledge training.",
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    links: [
      {
        href: "/platform/settings",
        label: "Platform settings",
        icon: "chat",
        description: "Mailbox, email delivery (SMTP/IMAP), and WhatsApp — one place for platform communications.",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    links: [
      {
        href: "/platform/active-users",
        label: "Active users",
        icon: "users",
        description: "Who is signed in across tenants, workspaces, and channels.",
      },
      {
        href: "/platform/system-issues",
        label: "System errors & reports",
        icon: "alert",
        description: "Client-reported issues and platform error triage.",
      },
      {
        href: "/platform/database-backups",
        label: "Database backups",
        icon: "database",
        description: "Backup status and restore operations.",
      },
    ],
  },
  {
    id: "billing-tools",
    label: "Billing & tools",
    links: [
      {
        href: "/platform/invoices",
        label: "Invoices",
        icon: "receipt",
        description: "Platform billing invoices for tenant subscriptions.",
      },
      {
        href: "/platform/plans",
        label: "Plans",
        icon: "package",
        description: "Monthly and annual subscription packages (modules, seats, price).",
      },
      {
        href: "/platform/subscriptions",
        label: "Subscriptions",
        icon: "clock",
        description: "Tenant plan assignments, renewals, overdue status, and draft invoices.",
      },
      {
        href: "/platform/contracts",
        label: "Contracts & quotes",
        icon: "file",
        description: "Quote → accept → provision org → first invoice.",
      },
      {
        href: "/platform/invoice-templates",
        label: "Templates",
        icon: "package",
        description: "Invoice design layouts and saved billing package templates.",
      },
      {
        href: "/platform/legacy-import-converter",
        label: "Legacy data converter",
        icon: "upload",
        description: "Convert legacy exports into Centrix import templates.",
      },
    ],
  },
];

/** Flat list for sidebar nav (preserves group labels). */
export function platformNavItems() {
  return PLATFORM_LINK_GROUPS.flatMap((section) =>
    section.links.map((link) => ({
      ...link,
      group: section.label,
      superAdminOnly: true,
    })),
  );
}
