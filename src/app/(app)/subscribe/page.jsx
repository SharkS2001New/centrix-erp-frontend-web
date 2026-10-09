"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { PrimaryButton } from "@/components/catalog/catalog-shared";
import { formatBillingMoney } from "@/lib/platform-billing";
import { dismissLicenseWarning, licenceNeedsPayment, licenseAccessMode } from "@/lib/organization-license";
import { resolveHomePath } from "@/lib/access-control";
import { apiRequest, ApiError } from "@/lib/api";

function quoteMonths(unit, months, minMonths, percent) {
  const count = Math.min(36, Math.max(1, Number(months) || 1));
  const gross = Math.round(unit * count * 100) / 100;
  const applied = count > minMonths && percent > 0 ? Math.min(100, percent) : 0;
  const discount = Math.round((gross * applied) / 100 * 100) / 100;
  return {
    months: count,
    gross,
    discount,
    percent: applied,
    amount: Math.round((gross - discount) * 100) / 100,
  };
}

export default function SubscribePage() {
  const router = useRouter();
  const { organization, organizationLicense, capabilities, user, isSuperAdmin, refreshCapabilities } = useAuth();
  const plans = Array.isArray(organizationLicense?.plans) ? organizationLicense.plans : [];
  const discount = organizationLicense?.duration_discount ?? { percent: 0, min_months: 3 };
  const [planId, setPlanId] = useState(plans[0]?.id ?? null);
  const [months, setMonths] = useState(1);
  const [phone, setPhone] = useState(user?.phone || organizationLicense?.paybill?.account_phone || "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const selected = plans.find((plan) => plan.id === planId) ?? plans[0] ?? null;
  const minMonths = Number(selected?.discount_min_months ?? discount.min_months ?? 3);
  const percent = Number(selected?.discount_percent ?? discount.percent ?? 0);
  const quote = useMemo(
    () => (selected ? quoteMonths(Number(selected.monthly_price) || 0, months, minMonths, percent) : null),
    [selected, months, minMonths, percent],
  );
  const paybill = organizationLicense?.paybill;
  const account = paybill?.account_number || organization?.company_code || "";
  const mode = licenseAccessMode(organizationLicense);

  function closeForLater() {
    dismissLicenseWarning();
    if (licenceNeedsPayment(organizationLicense)) {
      router.replace("/products");
      return;
    }
    const home = resolveHomePath({ user, organization, capabilities, isSuperAdmin });
    router.replace(home || "/dashboard");
  }

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") closeForLater();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function leaveIfPaid(license) {
    const nextMode = licenseAccessMode(license);
    if (nextMode === "full" || nextMode === "token") {
      const home = resolveHomePath({ user, organization, capabilities, isSuperAdmin });
      router.replace(home || "/dashboard");
      return true;
    }
    return false;
  }

  async function payNow() {
    if (!selected) {
      setNotice("A platform administrator still needs to publish a monthly plan.");
      return;
    }
    setBusy("stk");
    setNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/stk", {
        method: "POST",
        body: { plan_id: selected.id, months: quote.months, phone },
      });
      setNotice(res.message || "Check your phone for the M-Pesa prompt.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not start M-Pesa.");
    } finally {
      setBusy("");
    }
  }

  async function prepareManual() {
    if (!selected) return;
    setBusy("manual");
    setNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/checkout", {
        method: "POST",
        body: { plan_id: selected.id, months: quote.months },
      });
      setNotice(
        res.message ||
          `Pay ${formatBillingMoney(quote.amount, selected.currency || "KES")} to Paybill ${paybill?.short_code || ""} account ${account}, then enter the M-Pesa code.`,
      );
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not prepare this payment.");
    } finally {
      setBusy("");
    }
  }

  async function checkNow() {
    setBusy("check");
    setNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/verify", {
        method: "POST",
        body: { mpesa_code: code.trim(), plan_id: selected?.id, months: quote?.months },
      });
      if (await leaveIfPaid(res.license)) return;
      const next = await refreshCapabilities({ force: true });
      if (await leaveIfPaid(next?.license ?? next?.subscription)) return;
      setNotice(res.message || "M-Pesa has not confirmed this payment yet.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not check this M-Pesa code.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/70">
      <div className="min-h-full bg-white px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#185FA5]">Centrix subscription</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900">Choose how to use Centrix</h1>
            </div>
            <button
              type="button"
              onClick={closeForLater}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Not today
            </button>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            {mode === "expired"
              ? "This organisation’s paid period has ended. Pick a plan to open those features again. Anything left off the plan stays hidden, including its reports."
              : "This choice sets what this organisation can use. Features left off a plan stay hidden, including their reports. People in the organisation only get permissions for what the plan turns on."}
          </p>

          {plans.length === 0 ? (
            <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              No monthly plans are published yet. A platform administrator creates them under Plans, each with its own price and feature list.
            </p>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {plans.map((plan) => {
                const active = selected?.id === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setPlanId(plan.id)}
                    className={`rounded-xl border p-4 text-left ${
                      active ? "border-[#185FA5] bg-[#185FA5]/5 ring-1 ring-[#185FA5]" : "border-slate-200 bg-white"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">{plan.name}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">
                      {formatBillingMoney(plan.monthly_price, plan.currency || "KES")}
                      <span className="text-sm font-normal text-slate-500"> / month</span>
                    </p>
                    {plan.description ? <p className="mt-2 text-sm text-slate-600">{plan.description}</p> : null}
                    {plan.features?.length ? (
                      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
                        {plan.features.map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                      </ul>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          {selected && quote ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="rounded-xl border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-slate-900">How many months</h2>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    className="h-9 w-9 rounded-lg border border-slate-200 text-lg"
                    onClick={() => setMonths((n) => Math.max(1, n - 1))}
                  >
                    −
                  </button>
                  <span className="min-w-16 text-center text-lg font-semibold">{quote.months}</span>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-lg border border-slate-200 text-lg"
                    onClick={() => setMonths((n) => Math.min(36, n + 1))}
                  >
                    +
                  </button>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {quote.percent > 0
                    ? `${quote.percent}% off because this is more than ${minMonths} months. You pay ${formatBillingMoney(quote.amount, selected.currency || "KES")} instead of ${formatBillingMoney(quote.gross, selected.currency || "KES")}.`
                    : percent > 0
                      ? `Pay for more than ${minMonths} months to get ${percent}% off.`
                      : `This payment covers ${quote.months * 30} days.`}
                </p>
                <label className="mt-4 block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">M-Pesa phone for the prompt</span>
                  <input
                    className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="07…"
                  />
                </label>
                <PrimaryButton type="button" showIcon={false} className="mt-4" disabled={busy !== ""} onClick={() => void payNow()}>
                  {busy === "stk" ? "Sending prompt…" : "Pay now"}
                </PrimaryButton>
              </section>

              <aside className="rounded-xl border border-slate-200 p-4">
                <h2 className="text-sm font-semibold text-slate-900">Or pay the Paybill yourself</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">Paybill</dt>
                    <dd className="font-mono font-semibold">{paybill?.short_code || "Ask your Centrix administrator"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Account</dt>
                    <dd className="font-mono font-semibold">{account || "Your organisation code"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Amount</dt>
                    <dd className="font-semibold">{formatBillingMoney(quote.amount, selected.currency || "KES")}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="mt-3 text-sm font-medium text-[#185FA5]"
                  disabled={busy !== ""}
                  onClick={() => void prepareManual()}
                >
                  {busy === "manual" ? "Preparing…" : "I will pay this amount manually"}
                </button>
                <label className="mt-4 block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">M-Pesa code</span>
                  <input
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="QLK1ABC234"
                  />
                </label>
                <PrimaryButton type="button" showIcon={false} className="mt-3 w-full" disabled={busy !== ""} onClick={() => void checkNow()}>
                  {busy === "check" ? "Checking…" : "Check now"}
                </PrimaryButton>
              </aside>
            </div>
          ) : null}

          {notice ? <p className="mt-4 text-sm text-slate-700">{notice}</p> : null}
        </div>
      </div>
    </div>
  );
}
