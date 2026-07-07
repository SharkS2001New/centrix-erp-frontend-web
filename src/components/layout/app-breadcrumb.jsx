import Link from "next/link";

/** Breadcrumb trail for app pages (same styling as admin screens). */
export function AppBreadcrumb({ items }) {
  return (
    <nav className="theme-subtext mb-4 text-sm" aria-label="Breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`}>
            {index > 0 ? <span className="mx-2 opacity-40">›</span> : null}
            {item.href && !isLast ? (
              <Link href={item.href} className="theme-link">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "theme-heading font-medium" : undefined}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

const ORDER_QUEUE_LABELS = {
  all: "All orders",
  mobile: "Mobile orders",
  pending_approval: "Pending approval",
  editable: "Returned for revision",
  cancelled: "Cancelled orders",
  expired: "Expired orders",
};

/** Parent crumb for sales order detail when opened from a list or workflow screen. */
export function orderDetailBreadcrumbParent(backHref = "/sales/orders") {
  const href = backHref || "/sales/orders";

  if (href.startsWith("/fulfillment")) {
    return { label: "Distribution", href: "/fulfillment" };
  }

  const queueMatch = href.match(/\/sales\/orders\/queues\/([^/]+)/);
  if (queueMatch) {
    const slug = queueMatch[1];
    return {
      label: ORDER_QUEUE_LABELS[slug] ?? "Sales orders",
      href,
    };
  }

  return { label: "Sales orders", href };
}
