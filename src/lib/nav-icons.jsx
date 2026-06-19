/** Outline nav icons (Velzon-style). */

function IconBase({ className, children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function NavIconDashboard({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <circle cx="12" cy="12" r="4" />
    </IconBase>
  );
}

export function NavIconSales({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="9" cy="20" r="1" />
      <circle cx="17" cy="20" r="1" />
      <path d="M2 4h2l2.5 12h11l2-8H6" />
    </IconBase>
  );
}

export function NavIconInventory({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M21 8l-9-4-9 4v8l9 4 9-4V8z" />
      <path d="M3 8l9 4 9-4M12 12v8" />
    </IconBase>
  );
}

export function NavIconPurchases({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M6 2h12v20H6z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </IconBase>
  );
}

export function NavIconLogistics({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M3 7h11v8H3z" />
      <path d="M14 10h4l3 3v2h-7V10z" />
      <circle cx="7" cy="17" r="2" />
      <circle cx="17" cy="17" r="2" />
    </IconBase>
  );
}

export function NavIconReports({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <path d="M4 19V5M4 19h16" />
      <path d="M8 15V9M12 15V7M16 15v-4" />
    </IconBase>
  );
}

export function NavIconAccounting({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10M7 12h6" />
    </IconBase>
  );
}

export function NavIconHr({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    </IconBase>
  );
}

export function NavIconUsers({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M2 20c0-3.3 2.7-6 7-6" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M14 20c0-2.5 1.8-4.5 4-4.5" />
    </IconBase>
  );
}

export function NavIconSettings({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </IconBase>
  );
}

export function NavIconPlatform({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M2 12h20M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
    </IconBase>
  );
}

export function NavIconLink({ className = "h-[18px] w-[18px]" }) {
  return (
    <IconBase className={className}>
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M8 12h8" />
    </IconBase>
  );
}

const SECTION_ICONS = {
  platform: NavIconPlatform,
  dashboard: NavIconDashboard,
  sales: NavIconSales,
  pos: NavIconSales,
  customers: NavIconHr,
  catalogue: NavIconInventory,
  inventory: NavIconInventory,
  purchases: NavIconPurchases,
  logistics: NavIconLogistics,
  reports: NavIconReports,
  accounting: NavIconAccounting,
  hr: NavIconHr,
  users: NavIconUsers,
  settings: NavIconSettings,
};

export function NavSectionIcon({ sectionId, className }) {
  const Icon = SECTION_ICONS[sectionId] ?? NavIconLink;
  return <Icon className={className} />;
}
