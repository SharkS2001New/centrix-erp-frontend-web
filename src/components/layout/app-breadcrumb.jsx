"use client";

import Link from "next/link";
import { TabFormBackButton } from "@/components/layout/tab-form-exit-button";

/** Nearest parent crumb with an href (list/info pages close back to that). */
function resolveBreadcrumbBack(items) {
  const withHref = (items ?? []).filter((item) => item?.href);
  return withHref.length ? withHref[withHref.length - 1] : null;
}

/**
 * Breadcrumb trail for app pages (same styling as admin screens).
 * Shows a top-left back arrow that navigates to the parent list and closes
 * the current workspace tab — same behavior as Cancel on add/edit forms.
 */
export function AppBreadcrumb({ items, backHref, backLabel, showBack = true }) {
  const parent = resolveBreadcrumbBack(items);
  const href = backHref ?? parent?.href ?? null;
  const label =
    backLabel ??
    (parent?.label ? `Back to ${parent.label}` : "Back");

  return (
    <div className="mb-4 flex items-center gap-3">
      {showBack && href ? (
        <TabFormBackButton
          href={href}
          label={label}
          className="theme-secondary-btn inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm"
        />
      ) : null}
      <nav className="theme-subtext min-w-0 text-sm" aria-label="Breadcrumb">
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
    </div>
  );
}

const ORDER_QUEUE_LABELS = {
  all: "All Orders",
  mobile: "Mobile Orders",
  pending_approval: "Pending Approval Orders",
  "pending-approval": "Pending Approval Orders",
  editable: "Editable Orders",
  cancelled: "Cancelled Orders",
  expired: "Expired Orders",
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
