"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, ApiError } from "@/lib/api";
import { formatBillingMoney } from "@/lib/platform-billing";
import { dismissLicenseWarning, isLimitedLicencePath, licenceNeedsPayment, licenseAccessMode, takeLicenceReturnPath } from "@/lib/organization-license";
import { resolveHomePath } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { isTerminalWorkspace, workspaceHomePath } from "@/lib/workspaces";
import { recallWorkspaceTabLandingPath } from "@/lib/tab-workspace";

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
  const [billing, setBilling] = useState("monthly");
  const [step, setStep] = useState("plans");
  const [phone, setPhone] = useState(user?.phone || organizationLicense?.paybill?.account_phone || "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const selected = plans.find((plan) => plan.id === planId) ?? plans[0] ?? null;
  const minMonths = Number(selected?.discount_min_months ?? discount.min_months ?? 3);
  const percent = Number(selected?.discount_percent ?? discount.percent ?? 0);
  const billedMonths = billing === "yearly" ? 12 : 1;
  const quote = useMemo(
    () => (selected ? quoteMonths(Number(selected.monthly_price) || 0, billedMonths, minMonths, percent) : null),
    [selected, billedMonths, minMonths, percent],
  );
  const yearlyPrice = Number(selected?.yearly_price) || 0;
  const due = billing === "yearly" && yearlyPrice > 0 ? yearlyPrice : quote?.amount ?? 0;
  const paybill = organizationLicense?.paybill;
  const account = paybill?.account_number || organization?.company_code || "";
  const mode = licenseAccessMode(organizationLicense);

  const closeForLater = useCallback(() => {
    dismissLicenseWarning();
    const workspaceId = getStoredWorkspace();
    if (isTerminalWorkspace(workspaceId)) {
      router.replace(workspaceHomePath(workspaceId, capabilities) || "/pos");
      return;
    }
    const back = takeLicenceReturnPath();
    if (back && (isLimitedLicencePath(back) || !licenceNeedsPayment(organizationLicense))) {
      router.replace(back);
      return;
    }
    if (licenceNeedsPayment(organizationLicense)) {
      router.replace("/products");
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    const resume = recallWorkspaceTabLandingPath(organization?.id, getStoredWorkspace());
    if (resume && !resume.startsWith("/profile") && !resume.startsWith("/subscribe")) {
      router.replace(resume);
      return;
    }
    router.replace("/dashboard");
  }, [capabilities, organization?.id, organizationLicense, router]);

  useEffect(() => {
    function onKey(event) {
      if (event.key !== "Escape") return;
      if (step === "checkout") {
        setStep("plans");
        return;
      }
      closeForLater();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeForLater, step]);

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
        body: { plan_id: selected.id, months: quote.months, phone, billing },
      });
      setNotice(res.message || "Check your phone for the M-Pesa prompt.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not start M-Pesa.");
    } finally {
      setBusy("");
    }
  }

  async function notifyAdmin() {
    if (!selected) return;
    setBusy("manual");
    setNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/notify", {
        method: "POST",
        body: { plan_id: selected.id, months: quote.months, billing },
      });
      setNotice(res.message || "Centrix has been notified on WhatsApp.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not notify Centrix.");
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
        body: { mpesa_code: code.trim(), plan_id: selected?.id, months: quote?.months, billing },
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

  function openCheckout(plan) {
    setPlanId(plan.id);
    setNotice("");
    setStep("checkout");
  }

  const recommendedIndex = plans.length >= 3 ? 2 : Math.max(0, plans.length - 1);
  const currency = selected?.currency || "KES";

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black text-white">
      <button
        type="button"
        onClick={closeForLater}
        className="fixed right-4 top-4 z-[90] rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
      >
        Close
      </button>
      <div className="mx-auto min-h-full max-w-6xl px-4 pb-16 pt-16 sm:px-8">
        {step === "checkout" && selected && quote ? (
          <CheckoutStep
            selected={selected}
            billing={billing}
            due={due}
            currency={currency}
            quote={quote}
            paybill={paybill}
            account={account}
            phone={phone}
            setPhone={setPhone}
            code={code}
            setCode={setCode}
            busy={busy}
            notice={notice}
            onBack={() => setStep("plans")}
            onPay={() => void payNow()}
            onNotify={() => void notifyAdmin()}
            onCheck={() => void checkNow()}
          />
        ) : (
          <PlansStep
            plans={plans}
            billing={billing}
            setBilling={setBilling}
            mode={mode}
            currentName={mode === "full" ? organizationLicense?.plan_name : ""}
            recommendedIndex={recommendedIndex}
            minMonths={minMonths}
            percent={percent}
            onPay={openCheckout}
          />
        )}
      </div>
    </div>
  );
}

function listedPrice(plan, billing, minMonths, percent) {
  const currency = plan.currency || "KES";
  if (billing === "yearly") {
    const yearly = Number(plan.yearly_price) || 0;
    if (yearly > 0) return { amount: yearly, suffix: "/ year", currency };
    const quoted = quoteMonths(Number(plan.monthly_price) || 0, 12, minMonths, percent);
    return { amount: quoted.amount, suffix: "/ year", currency };
  }
  return { amount: Number(plan.monthly_price) || 0, suffix: "/ month", currency };
}

function PlansStep({ plans, billing, setBilling, mode, currentName, recommendedIndex, minMonths, percent, onPay }) {
  return (
    <div>
      <h1 className="text-center text-3xl font-semibold tracking-tight">Upgrade your plan</h1>
      <div className="mx-auto mt-6 flex w-fit rounded-full bg-white/10 p-1 text-sm">
        {["monthly", "yearly"].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setBilling(option)}
            className={`rounded-full px-5 py-1.5 capitalize ${billing === option ? "bg-white/15 text-white" : "text-white/70"}`}
          >
            {option}
          </button>
        ))}
      </div>
      <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-white/60">
        {mode === "expired"
          ? "This organisation’s paid period has ended. Choose a plan to open those features again."
          : "Choose the plan this organisation should use. Features left off a plan stay hidden."}
      </p>
      {plans.length === 0 ? (
        <p className="mx-auto mt-8 max-w-lg rounded-2xl border border-white/15 p-4 text-center text-sm text-amber-200">
          No plans are published yet. A platform administrator creates them under Self-serve plans.
        </p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan, index) => {
            const price = listedPrice(plan, billing, minMonths, percent);
            const current = currentName && plan.name === currentName;
            const recommended = index === recommendedIndex && !current;
            return (
              <article
                key={plan.id}
                className={`flex flex-col rounded-2xl border p-5 ${
                  recommended ? "border-blue-400/40 bg-[#12315f]" : "border-white/15 bg-[#2a2a2a]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-white/80">{plan.name}</p>
                  {recommended ? (
                    <span className="rounded-full bg-blue-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-100">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-xl font-semibold">{plan.description || plan.name}</h2>
                <p className="mt-6 text-4xl font-semibold tracking-tight">
                  {formatBillingMoney(price.amount, price.currency)}
                  <span className="text-base font-normal text-white/60"> {price.suffix}</span>
                </p>
                <button
                  type="button"
                  disabled={current}
                  onClick={() => onPay(plan)}
                  className={`mt-5 w-full rounded-full px-4 py-2.5 text-sm font-semibold ${
                    current
                      ? "cursor-default border border-white/20 text-white/50"
                      : recommended
                        ? "bg-[#3b82f6] text-white hover:bg-blue-500"
                        : "bg-white text-black hover:bg-white/90"
                  }`}
                >
                  {current ? "Your current plan" : "Pay now"}
                </button>
                <ul className="mt-6 space-y-3 text-sm text-white/80">
                  {(plan.features ?? []).map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="mt-0.5 text-white/50">✓</span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CheckoutStep({
  selected,
  billing,
  due,
  currency,
  quote,
  paybill,
  account,
  phone,
  setPhone,
  code,
  setCode,
  busy,
  notice,
  onBack,
  onPay,
  onNotify,
  onCheck,
}) {
  const features = (selected.features ?? []).slice(0, 5);
  const inputClass = "w-full rounded-xl border border-white/10 bg-[#2a2a2a] px-3 py-3 text-sm text-white outline-none focus:border-white/30";
  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm text-white/80 hover:text-white">
        ‹ Configure your plan
      </button>
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <h2 className="text-sm font-medium">Pay with</h2>
          <div className="mt-3 inline-flex rounded-xl border border-white/15 bg-[#2a2a2a] px-4 py-3 text-sm font-semibold">
            M-Pesa
          </div>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-xs text-white/50">M-Pesa phone</span>
            <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07…" />
          </label>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[#2a2a2a] px-3 py-3">
              <dt className="text-xs text-white/50">Paybill</dt>
              <dd className="mt-1 font-mono text-sm">{paybill?.short_code || "Ask your Centrix administrator"}</dd>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#2a2a2a] px-3 py-3">
              <dt className="text-xs text-white/50">Account</dt>
              <dd className="mt-1 font-mono text-sm">{account || "Your organisation code"}</dd>
            </div>
          </dl>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-xs text-white/50">M-Pesa code, after you pay</span>
            <input
              className={`${inputClass} font-mono uppercase`}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="QLK1ABC234"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <button type="button" className="text-white/70 underline" disabled={busy !== ""} onClick={onCheck}>
              {busy === "check" ? "Checking…" : "I have paid — check again"}
            </button>
            <button type="button" className="text-white/70 underline" disabled={busy !== ""} onClick={onNotify}>
              {busy === "manual" ? "Notifying…" : "Notify admin on WhatsApp"}
            </button>
          </div>
          {notice ? <p className="mt-4 text-sm text-amber-200">{notice}</p> : null}
        </section>
        <aside className="rounded-3xl border border-white/10 bg-[#2a2a2a] p-6">
          <h2 className="text-2xl font-semibold">{selected.name}</h2>
          <p className="mt-4 text-sm font-medium text-white/70">Top features</p>
          <ul className="mt-3 space-y-2 text-sm text-white/80">
            {features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <span className="text-white/40">✦</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-white/70">{billing === "yearly" ? "Yearly subscription" : "Monthly subscription"}</dt>
              <dd>{formatBillingMoney(due, currency)}</dd>
            </div>
            {billing === "monthly" && quote?.discount > 0 ? (
              <div className="flex justify-between gap-4 text-white/70">
                <dt>Discount</dt>
                <dd>−{formatBillingMoney(quote.discount, currency)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 border-t border-white/10 pt-3 font-semibold">
              <dt>Due today</dt>
              <dd>{formatBillingMoney(due, currency)}</dd>
            </div>
          </dl>
          <button
            type="button"
            disabled={busy !== ""}
            onClick={onPay}
            className="mt-6 w-full rounded-full bg-white py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
          >
            {busy === "stk" ? "Sending prompt…" : "Subscribe"}
          </button>
          <p className="mt-4 text-xs leading-5 text-white/45">
            Pay {formatBillingMoney(due, currency)} to Paybill {paybill?.short_code || "—"} account {account || "your organisation code"}.
            The prompt goes to the M-Pesa phone above. This does not renew by itself.
          </p>
        </aside>
      </div>
    </div>
  );
}
