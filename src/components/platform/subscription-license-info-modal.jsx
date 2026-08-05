"use client";

import { OrganizationBillingPanel } from "@/components/platform/organization-billing-panel";

/**
 * Read-only licence summary for a subscription row (platform admin).
 */
export function SubscriptionLicenseInfoModal({ open, subscription, onClose }) {
  if (!open || !subscription?.organization_id) return null;

  const orgName = subscription.organization?.org_name ?? "Organization";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-license-info-title"
        className="theme-modal flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <h2 id="subscription-license-info-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              License information
            </h2>
            <p className="mt-1 text-sm text-slate-500">{orgName}</p>
          </div>
          <button
            type="button"
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <OrganizationBillingPanel
            organizationId={subscription.organization_id}
            organization={subscription.organization}
            mode="platform"
            showInvoice
            readOnly
          />
        </div>
      </div>
    </div>
  );
}
