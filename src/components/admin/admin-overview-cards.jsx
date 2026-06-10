import Link from "next/link";

const CARDS = [
  {
    href: "/admin/company",
    title: "Company profile",
    description: "Manage organization info, registration details, and logo.",
    icon: "🏢",
  },
  {
    href: "/admin/branches",
    title: "Branches",
    description: "Manage branch locations, contacts, and status.",
    icon: "🏬",
  },
  {
    href: "/admin/users",
    title: "Users",
    description: "Create users, assign branches and roles.",
    icon: "👤",
  },
  {
    href: "/admin/roles",
    title: "Roles & permissions",
    description: "Define roles and control module access levels.",
    icon: "🔐",
  },
  {
    href: "/admin/audit",
    title: "Audit trail",
    description: "View system activity and change history.",
    icon: "📜",
  },
  {
    href: "/admin/settings",
    title: "System settings",
    description: "Configure sales, inventory, and organization preferences.",
    icon: "⚙️",
  },
];

export function AdminOverviewCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {CARDS.map((card) => (
        <Link
          key={card.href}
          href={card.href}
          className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#185FA5]/30 hover:shadow-md"
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>
              {card.icon}
            </span>
            <div>
              <h2 className="text-[15px] font-medium text-slate-900 group-hover:text-[#185FA5]">
                {card.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">{card.description}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
