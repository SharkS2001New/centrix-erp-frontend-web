/** Grouped platform administration links (sidebar + overview page). */

/** @typedef {{ href: string, label: string, description?: string, exact?: boolean, icon?: string, buttonClass?: string, permission?: string }} PlatformLink */

/** @typedef {{ id: string, label: string, links: PlatformLink[] }} PlatformLinkGroup */

/** Area codes match backend PlatformAdminPermissions. */
export const PLATFORM_PERMISSION_AREAS = [
  "tenants",
  "integrations",
  "operations",
  "billing",
  "settings",
  "admins",
];

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
        permission: "tenants",
      },
      {
        href: "/platform/organizations",
        label: "Tenant organizations",
        icon: "building",
        description: "All registered organizations and quick access to tenant configuration.",
        permission: "tenants",
      },
      {
        href: "/platform/organizations/new",
        label: "Register organization",
        icon: "plus",
        description: "Provision a new company code, modules, sales behaviour, and initial administrator.",
        permission: "tenants",
      },
      {
        href: "/platform/setup-types",
        label: "Setup types",
        icon: "package",
        description: "Applications such as External POS, and menu groups, saved for each setup type.",
        permission: "tenants",
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
        description: "Platform-wide Q&A training notes and test console for the ERP assistant.",
        permission: "integrations",
      },
      {
        href: "/platform/ai-usage",
        label: "AI usage",
        icon: "chart",
        description: "Requests, tokens, estimated cost, and usage by organization and user.",
        permission: "integrations",
      },
      {
        href: "/platform/mailbox",
        label: "Mailbox",
        icon: "chat",
        description: "Send mail to clients, sync replies, and respond from one inbox.",
        permission: "integrations",
      },
      {
        href: "/platform/whatsapp",
        label: "WhatsApp",
        icon: "chat",
        description: "Dry-run the WhatsApp ordering bot against a tenant (no real orders or messages).",
        permission: "integrations",
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
        permission: "operations",
      },
      {
        href: "/platform/speed",
        label: "ERP Speed",
        icon: "chart",
        description: "API latency, infrastructure health, performance trends, and failed jobs.",
        permission: "operations",
      },
      {
        href: "/platform/system-issues",
        label: "System errors & reports",
        icon: "alert",
        description: "Client-reported issues and platform error triage.",
        permission: "operations",
      },
      {
        href: "/platform/whats-new",
        label: "What’s new",
        icon: "star",
        description: "Publish Centrix update notes to selected orgs and modules.",
        permission: "operations",
      },
      {
        href: "/platform/database-backups",
        label: "Database backups",
        icon: "database",
        description: "Backup status and restore operations.",
        permission: "operations",
      },
      {
        href: "/platform/data-retention",
        label: "Data retention",
        icon: "database",
        description: "Prune agent commands and related operational junk — never attendance.",
        permission: "operations",
      },
    ],
  },
  {
    id: "billing-tools",
    label: "Billing & tools",
    links: [
      {
        href: "/platform/billing",
        label: "Billing & plans",
        icon: "wallet",
        description: "Subscription counts, published prices, and links to token policy and licence payments.",
        permission: "billing",
      },
      {
        href: "/platform/billing/token-policy",
        label: "Token & usage policies",
        icon: "settings",
        description: "Token pack price, expiry, low-balance alerts, grace, and create, update, and delete costs.",
        permission: "billing",
      },
      {
        href: "/platform/plans",
        label: "Plans",
        icon: "package",
        description: "Create monthly, yearly, and token prices. Paybill payments match these and auto-subscribe the organisation.",
        permission: "billing",
      },
      {
        href: "/platform/self-serve-plans",
        label: "Self-serve plans",
        icon: "package",
        description: "Plans an organisation chooses and pays for on the subscription screen.",
        permission: "billing",
      },
      {
        href: "/platform/invoices",
        label: "Invoices",
        icon: "receipt",
        description: "Platform billing invoices for tenant subscriptions.",
        permission: "billing",
      },
      {
        href: "/platform/subscriptions",
        label: "Subscriptions",
        icon: "clock",
        description: "Tenant plan assignments, renewals, overdue status, and draft invoices.",
        permission: "billing",
      },
      {
        href: "/platform/licence-payments",
        label: "Licence payments",
        icon: "receipt",
        description: "M-Pesa payments on the Centrix Paybill and whether each one extended a licence.",
        permission: "billing",
      },
      {
        href: "/platform/contracts",
        label: "Contracts & quotes",
        icon: "file",
        description: "Quote → accept → provision org → first invoice.",
        permission: "billing",
      },
      {
        href: "/platform/marketing",
        label: "Marketing portfolios",
        icon: "star",
        description: "AI-assisted Centrix portfolios for shops, hotels, spas, and more.",
        permission: "billing",
      },
      {
        href: "/platform/blogs",
        label: "Marketing blogs",
        icon: "file",
        description: "Publish posts to the CentrixERP website Resources blog.",
        permission: "billing",
      },
      {
        href: "/platform/invoice-templates",
        label: "Templates",
        icon: "package",
        description: "Invoice design layouts and saved billing package templates.",
        permission: "billing",
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
        description:
          "Subscription payment methods, email delivery, WhatsApp, AI credentials, R2 backups, and alert notifications.",
        permission: "settings",
      },
      {
        href: "/platform/admins",
        label: "Platform admins",
        icon: "users",
        description: "Create platform administrator accounts, limit their areas, and require 2FA.",
        permission: "admins",
      },
    ],
  },
];

/**
 * @param {{ platform_full_access?: boolean, platform_permissions?: string[] } | null | undefined} capabilities
 * @param {string | null | undefined} area
 */
export function hasPlatformAreaPermission(capabilities, area) {
  if (!area) return true;
  if (capabilities?.platform_full_access) return true;
  const granted = Array.isArray(capabilities?.platform_permissions)
    ? capabilities.platform_permissions
    : [];
  // Legacy sessions before permission payload existed → treat as full access.
  if (!capabilities?.platform_admin && capabilities?.is_super_admin) return true;
  return granted.includes(area);
}

/** Flat list for sidebar nav (preserves group labels). Visibility filters by permission at runtime. */
export function platformNavItems() {
  return PLATFORM_LINK_GROUPS.flatMap((section) =>
    section.links.map((link) => {
      // Platform area codes (tenants, billing, …) must not be copied onto `permission`.
      // Sidebar ERP checks (hasNavPermission) always return false for platform-shell users,
      // which would hide every platform link after area attributes were added.
      const { permission, ...rest } = link;
      return {
        ...rest,
        group: section.label,
        superAdminOnly: true,
        platformPermission: permission ?? null,
      };
    }),
  );
}

/** @param {{ platform_full_access?: boolean, platform_permissions?: string[] } | null | undefined} capabilities */
export function platformLinkGroupsForCapabilities(capabilities = null) {
  return PLATFORM_LINK_GROUPS.map((section) => ({
    ...section,
    links: section.links.filter((link) => hasPlatformAreaPermission(capabilities, link.permission)),
  })).filter((section) => section.links.length > 0);
}
