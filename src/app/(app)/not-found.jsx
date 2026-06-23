import Link from "next/link";

const shortcuts = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sales", label: "Sales" },
  { href: "/sales/pos", label: "Point of sale" },
  { href: "/sales/till-management", label: "Tills" },
  { href: "/sales/end-of-day", label: "End of day report" },
  { href: "/products", label: "Products" },
  { href: "/customers", label: "Customers" },
  { href: "/inventory/stock", label: "Inventory" },
  { href: "/lpo", label: "Purchase orders" },
  { href: "/reports", label: "Reports" },
  { href: "/admin", label: "Administration" },
];

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-lg theme-panel rounded-xl border p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        This route is not available. Try one of these pages instead:
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {shortcuts.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="text-sm text-[#185FA5] hover:underline">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
