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
      {
        href: "/platform/push",
        label: "Mobile push",
        icon: "bell",
        description: "Firebase Cloud Messaging for Centrix Manager and Centrix Mobile field sales apps.",
      },
      {
        href: "/platform/whatsapp",
        label: "WhatsApp",
        icon: "chat",
        description: "Shared webhook URL and verify token for all tenant WhatsApp Business numbers.",
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
