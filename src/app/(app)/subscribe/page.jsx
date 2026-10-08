"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { formatBillingMoney, workspaceLabels } from "@/lib/platform-billing";
import { licenseAccessMode } from "@/lib/organization-license";
import { resolveHomePath } from "@/lib/access-control";

const FREE_FEATURES = [
  "Products catalogue",
  "Customers",
  "Suppliers",
  "Sales reports",
];

export default function SubscribePage() {
  const router = useRouter();
  const { organization, organizationLicense, capabilities, user, isSuperAdmin, refreshCapabilities } = useAuth();
  const [selectedId, setSelectedId] = useState("monthly");
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");

  const mode = licenseAccessMode(organizationLicense);
  const offers = Array.isArray(organizationLicense?.offers) && organizationLicense.offers.length > 0
    ? organizationLicense.offers
    : fallbackOffers();
  const selected = offers.find((offer) => offer.id === selectedId) ?? offers[0] ?? null;
  const paybill = organizationLicense?.paybill;
  const account = paybill?.account_number || organization?.company_code || "";
  const modules = workspaceLabels(organizationLicense?.modules ?? []);

  async function checkPayment() {
    setChecking(true);
    setNotice("");
    try {
      const next = await refreshCapabilities({ force: true });
      const license = next?.license ?? next?.subscription ?? organizationLicense;
      const nextMode = licenseAccessMode(license);
      if (nextMode === "full" || nextMode === "token") {
        const home = resolveHomePath({
          user,
          organization,
          capabilities: next ?? capabilities,
          isSuperAdmin,
        });
        router.replace(home || "/dashboard");
        return;
      }
      setNotice(
        nextMode === "trial"
          ? "You are still on the free trial. When M-Pesa confirms the payment, Centrix marks this organisation as paid."
          : "M-Pesa has not confirmed this payment yet. Pay the exact amount for the plan you chose, then check again.",
      );
    } catch {
      setNotice("Could not check the licence. Stay on this page and try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <CatalogPageShell
      title="Choose how to pay for Centrix"
      subtitle={
        mode === "trial"
          ? "Your free trial is still open. These are the modules you keep when you pay the Centrix Paybill."
          : mode === "expired"
            ? "Your trial or paid period has ended. You can still sign in. Pay the Centrix Paybill to open these modules again."
            : "Choose the modules and how you want to pay. Until M-Pesa confirms the payment, products, customers, suppliers, and sales reports stay open."
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Modules this payment covers</h2>
            {modules.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                {modules.map((module) => (
                  <li key={module}>{module}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">
                The plan on this organisation does not list modules yet. A platform administrator adds them on the plan, such as Backoffice, Accounting, or Human Resources.
              </p>
            )}
            <p className="mt-2 text-sm text-slate-600">
              {mode === "trial"
                ? "You can keep using Centrix during the trial. Paying monthly, yearly, or with tokens keeps these modules after the trial date."
                : "Until the payment is confirmed, you can still use products, customers, suppliers, and sales reports."}
            </p>
            {mode !== "trial" ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                {FREE_FEATURES.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <div className="grid gap-3 md:grid-cols-3">
            {offers.map((offer) => {
              const active = (selected?.id ?? selectedId) === offer.id;
              return (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => setSelectedId(offer.id)}
                  className={`rounded-xl border p-4 text-left ${
                    active ? "border-[#185FA5] bg-[#185FA5]/5 ring-1 ring-[#185FA5]" : "border-slate-200 bg-white"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{offer.title}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {offer.price != null ? formatBillingMoney(offer.price, offer.currency || "KES") : "Amount on your plan"}
                  </p>
                  <p className="text-xs text-slate-500">{offer.period}</p>
                  <p className="mt-2 text-sm text-slate-600">{offer.summary}</p>
                </button>
              );
            })}
          </div>

          {selected ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">{selected.title} includes</h2>
              <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                {(selected.features ?? []).map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Pay with M-Pesa Paybill</h2>
          <p className="mt-2 text-sm text-slate-600">
            This Paybill is for your Centrix licence. It is separate from the Paybill your shop uses for customer sales.
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Paybill number</dt>
              <dd className="font-mono text-base font-semibold">{paybill?.short_code || "Ask your Centrix administrator"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Account number</dt>
              <dd className="font-mono text-base font-semibold">{account || "Your organisation code"}</dd>
            </div>
            {paybill?.account_phone ? (
              <div>
                <dt className="text-xs text-slate-500">Or use the admin phone</dt>
                <dd className="font-mono font-semibold">{paybill.account_phone}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs text-slate-500">Amount</dt>
              <dd className="font-semibold">
                {selected?.price != null
                  ? formatBillingMoney(selected.price, selected.currency || "KES")
                  : "The price shown on the plan you choose"}
              </dd>
            </div>
          </dl>
          <ol className="mt-4 list-decimal space-y-1 pl-4 text-sm text-slate-600">
            <li>Choose monthly, yearly, or token.</li>
            <li>On your phone, pay the exact amount to the Paybill above.</li>
            <li>Use the account number shown here.</li>
            <li>
              {mode === "trial"
                ? "Come back and check. A confirmed payment keeps these modules open after the trial ends."
                : "Come back and check. A confirmed payment opens these modules again."}
            </li>
          </ol>
          <PrimaryButton type="button" showIcon={false} className="mt-4 w-full" disabled={checking} onClick={() => void checkPayment()}>
            {checking ? "Checking…" : "I have paid — check again"}
          </PrimaryButton>
          {notice ? <p className="mt-3 text-sm text-amber-800">{notice}</p> : null}
        </aside>
      </div>
    </CatalogPageShell>
  );
}

function fallbackOffers() {
  return [
    {
      id: "monthly",
      title: "Monthly subscription",
      price: null,
      currency: "KES",
      period: "30 days",
      summary: "Pay once and use the whole of Centrix for 30 days.",
      features: ["30 days of full Centrix", "Renew by paying the same amount again"],
    },
    {
      id: "yearly",
      title: "Yearly subscription",
      price: null,
      currency: "KES",
      period: "1 year",
      summary: "One payment keeps Centrix open for a calendar year.",
      features: ["1 year of full Centrix", "Same modules as the monthly plan"],
    },
    {
      id: "token",
      title: "Token subscription",
      price: 500,
      currency: "KES",
      period: "1 KES = 1 token",
      summary: "Paying 500 KES gives the organisation 500 tokens. Any other amount works the same way.",
      features: [
        "Each create, update, or delete uses 1 token",
        "Reading pages and reports uses 0 tokens",
        "Every user spends from the same balance",
      ],
    },
  ];
}
