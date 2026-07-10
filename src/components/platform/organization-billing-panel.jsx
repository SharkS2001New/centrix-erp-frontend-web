"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { PlatformContractViewer } from "@/components/platform/platform-contract-viewer";
import {
  CONTRACT_STATUS_STYLES,
  SUBSCRIPTION_STATUS_STYLES,
  contractKindLabel,
  contractStatusLabel,
  formatBillingDate,
  formatBillingMoney,
  isSubscriptionOverdue,
  licenseBasisLabel,
  planModuleLabels,
  resolveAgreementPrices,
  subscriptionStatusLabel,
  workspaceLabels,
} from "@/lib/platform-billing";
import {
  isLicenseExpired,
  isLicenseExpiringSoon,
  resolveOrganizationLicense,
} from "@/lib/organization-license";

function BillingSection({ title, description, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Subscription package + contracts.
 * mode=platform — super-admin org status (manage links).
 * mode=tenant — org admin Company profile (read-only agreement prices).
 */
export function OrganizationBillingPanel({
  organizationId,
  organization,
  mode = "platform",
}) {
  const isTenant = mode === "tenant";
  const [subscription, setSubscription] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewerContract, setViewerContract] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let subRes = null;
      let contractsRes = { data: [] };

      if (isTenant) {
        subRes = await apiRequest("/erp/organization/subscription", { loading: false }).catch(
          () =>
            apiRequest("/organization/subscription", { loading: false }).catch(() => null),
        );
        contractsRes = await apiRequest("/erp/organization/contracts", { loading: false }).catch(
          () =>
            apiRequest("/organization/contracts", { loading: false }).catch(() => ({ data: [] })),
        );
      } else if (organizationId) {
        subRes = await apiRequest(`/admin/organizations/${organizationId}/subscription`, {
          loading: false,
        }).catch(() => null);
        contractsRes = await apiRequest(`/admin/organizations/${organizationId}/contracts`, {
          loading: false,
        }).catch(() =>
          apiRequest("/admin/platform-contracts", {
            searchParams: { organization_id: organizationId },
            loading: false,
          }).catch(() => ({ data: [] })),
        );
      }

      setSubscription(subRes?.data ?? subRes?.subscription ?? (subRes?.id ? subRes : null));
      setContracts(contractsRes?.data ?? []);
    } catch (e) {
      if (!isTenant) {
        notifyError(e instanceof ApiError ? e.message : "Failed to load billing details.");
      }
      setSubscription(null);
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, isTenant]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openContract(row) {
    if (isTenant) {
      setViewerContract(row);
      return;
    }
    try {
      const detail = await apiRequest(`/admin/platform-contracts/${row.id}`, { loading: false });
      setViewerContract(detail.data ?? detail);
    } catch {
      setViewerContract(row);
    }
  }

  const overdue = isSubscriptionOverdue(subscription);
  const status = overdue ? "past_due" : subscription?.status;
  const prices = subscription ? resolveAgreementPrices(subscription) : null;
  const apps = workspaceLabels(
    subscription?.workspace_keys ?? subscription?.plan?.workspace_keys ?? [],
  );
  const license = subscription ? resolveOrganizationLicense(subscription) : null;
  const licenseExpired = license ? isLicenseExpired(license) : false;
  const licenseSoon = license ? isLicenseExpiringSoon(license) : false;

  return (
    <>
      <BillingSection
        title={isTenant ? "Your Centrix subscription" : "Subscription package"}
        description={
          isTenant
            ? "First-time and renewal prices agreed with ALPAC for your organization."
            : "The plan this tenant is billed under — first payment, renewal, and overdue status."
        }
      >
        {loading ? (
          <p className="text-sm text-slate-500">Loading subscription…</p>
        ) : !subscription ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40">
            {isTenant ? (
              "No subscription details are available yet. Contact your Centrix account manager."
            ) : (
              <>
                No subscription assigned.{" "}
                <Link href="/platform/subscriptions" className="font-medium text-[#185FA5] hover:underline">
                  Assign a plan
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {subscription.plan?.name ?? "Custom package"}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">First-time payment</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatBillingMoney(prices.first_payment_price, prices.currency)}
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Renewal ({prices.interval})
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatBillingMoney(prices.renewal_price, prices.currency)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {licenseBasisLabel(prices.license_basis)}
                  {subscription.seat_count != null ? ` · ${subscription.seat_count} seats` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Period {formatBillingDate(subscription.current_period_start)} →{" "}
                  {formatBillingDate(subscription.current_period_end)}
                </p>
                {license?.days_remaining != null ? (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      licenseExpired
                        ? "text-red-700"
                        : licenseSoon
                          ? "text-amber-700"
                          : "text-slate-500"
                    }`}
                  >
                    {licenseExpired
                      ? "Licence expired — users are locked out until extended"
                      : license.days_remaining === 0
                        ? "Licence expires today"
                        : `${license.days_remaining} day${license.days_remaining === 1 ? "" : "s"} until expiry`}
                  </p>
                ) : null}
                {apps.length ? (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    Applications: {apps.join(", ")}
                  </p>
                ) : subscription.plan?.module_keys?.length ? (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    Modules: {planModuleLabels(subscription.plan.module_keys).join(", ")}
                  </p>
                ) : null}
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${SUBSCRIPTION_STATUS_STYLES[status] ?? SUBSCRIPTION_STATUS_STYLES.active}`}
              >
                {overdue ? "Overdue" : subscriptionStatusLabel(subscription.status)}
              </span>
            </div>
            {!isTenant ? (
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <Link href="/platform/subscriptions" className="font-medium text-[#185FA5] hover:underline">
                  Manage subscriptions
                </Link>
                <Link
                  href={`/platform/invoices/new?organization=${organizationId}`}
                  className="font-medium text-[#185FA5] hover:underline"
                >
                  Create invoice
                </Link>
              </div>
            ) : null}
          </div>
        )}
      </BillingSection>

      <BillingSection
        title="Contracts & quotes"
        description={
          isTenant
            ? "Agreements for your organization. Open to read or print."
            : "Signed agreements and quotes. Open to read, expand, print, email, or download."
        }
      >
        {loading ? (
          <p className="text-sm text-slate-500">Loading contracts…</p>
        ) : contracts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/40">
            {isTenant ? (
              "No contracts on file yet."
            ) : (
              <>
                No contracts on file.{" "}
                <Link href="/platform/contracts/new" className="font-medium text-[#185FA5] hover:underline">
                  Create a quote
                </Link>
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
            {contracts.map((row) => {
              const rowPrices = resolveAgreementPrices(row);
              return (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {row.title || contractKindLabel(row.kind)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {contractKindLabel(row.kind)}
                      {row.reference ? ` · ${row.reference}` : ""} · First{" "}
                      {formatBillingMoney(rowPrices.first_payment_price, rowPrices.currency)} · Renewal{" "}
                      {formatBillingMoney(rowPrices.renewal_price, rowPrices.currency)} ·{" "}
                      {formatBillingDate(row.start_date || row.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${CONTRACT_STATUS_STYLES[row.status] ?? CONTRACT_STATUS_STYLES.draft}`}
                    >
                      {contractStatusLabel(row.status)}
                    </span>
                    <button
                      type="button"
                      className="text-sm font-medium text-[#185FA5] hover:underline"
                      onClick={() => void openContract(row)}
                    >
                      View
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {organization?.org_name && !isTenant ? (
          <p className="text-xs text-slate-500">Organization: {organization.org_name}</p>
        ) : null}
      </BillingSection>

      <PlatformContractViewer
        open={Boolean(viewerContract)}
        contract={viewerContract}
        expanded
        allowEmail={!isTenant}
        onClose={() => setViewerContract(null)}
      />
    </>
  );
}
