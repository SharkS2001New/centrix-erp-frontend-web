import Link from "next/link";

export function AdminBreadcrumb({ items }) {
  return (
    <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item.label}>
            {index > 0 ? <span className="mx-2 text-slate-300">/</span> : null}
            {item.href && !isLast ? (
              <Link href={item.href} className="hover:text-[#185FA5]">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-slate-700" : undefined}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
