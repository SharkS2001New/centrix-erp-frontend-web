"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  const forPos = useSearchParams().get("for") === "pos";
  const { organization, organizationLicense, capabilities, user, isSuperAdmin, refreshCapabilities } = useAuth();
  const plans = Array.isArray(organizationLicense?.plans) ? organizationLicense.plans : [];
  const discount = organizationLicense?.duration_discount ?? { percent: 0, min_months: 3 };
  const [planId, setPlanId] = useState(plans[0]?.id ?? null);
  const [billing, setBilling] = useState("monthly");
  const [tokenPack, setTokenPack] = useState(null);
  const [step, setStep] = useState("plans");
  const [phone, setPhone] = useState(user?.phone || organizationLicense?.paybill?.account_phone || "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiRequest("/erp/organization/billing")
      .then((res) => {
        if (cancelled) return;
        const policy = res.data?.policy ?? {};
        setTokenPack({
          tokens: Number(policy.token_pack_tokens) || 0,
          price: Number(policy.token_pack_price_kes) || 0,
          saleTokens: Number(policy.sale_tokens) || 1,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const visiblePlans = billing === "yearly"
    ? plans.filter((plan) => plan.interval === "yearly")
    : billing === "monthly"
      ? plans.filter((plan) => plan.interval !== "yearly")
      : [];
  const selected = billing === "token" ? null : (visiblePlans.find((plan) => plan.id === planId) ?? null);
  const minMonths = Number(selected?.discount_min_months ?? discount.min_months ?? 3);
  const percent = Number(selected?.discount_percent ?? discount.percent ?? 0);
  const billedMonths = billing === "yearly" ? 12 : 1;
  const quote = useMemo(
    () => (selected && billing === "monthly" ? quoteMonths(Number(selected.monthly_price) || 0, billedMonths, minMonths, percent) : null),
    [selected, billedMonths, minMonths, percent, billing],
  );
  const due = billing === "token"
    ? Number(tokenPack?.price) || 0
    : billing === "yearly"
      ? Number(selected?.yearly_price) || 0
      : quote?.amount ?? 0;
  const paybill = organizationLicense?.paybill;
  const account = paybill?.account_number || organization?.company_code || "";
  const mode = licenseAccessMode(organizationLicense);

  const closeForLater = useCallback(() => {
    dismissLicenseWarning();
    const workspaceId = getStoredWorkspace();
    if (forPos || (workspaceId === "pos" && licenseAccessMode(organizationLicense) === "token")) {
      router.replace("/choose-workspace");
      return;
    }
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
  }, [capabilities, forPos, organization?.id, organizationLicense, router]);

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
    if (nextMode === "full" || nextMode === "trial" || (nextMode === "token" && !forPos)) {
      const home = resolveHomePath({ user, organization, capabilities, isSuperAdmin });
      router.replace(home || "/dashboard");
      return true;
    }
    return false;
  }

  async function payNow() {
    if (forPos && billing === "token") {
      setNotice("External POS needs a monthly or yearly subscription.");
      return;
    }
    if (billing !== "token" && !selected) {
      setNotice(billing === "yearly" ? "Choose a yearly plan." : "Choose a monthly plan.");
      return;
    }
    setBusy("stk");
    setNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/stk", {
        method: "POST",
        body: billing === "token"
          ? { billing: "token", phone }
          : { plan_id: selected.id, months: billing === "yearly" ? 12 : quote.months, phone, billing },
      });
      setNotice(res.message || "Check your phone for the M-Pesa prompt.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not start M-Pesa.");
    } finally {
      setBusy("");
    }
  }

  async function notifyAdmin() {
    if (forPos && billing === "token") return;
    if (billing !== "token" && !selected) return;
    setBusy("manual");
    setNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/notify", {
        method: "POST",
        body: billing === "token"
          ? { billing: "token" }
          : { plan_id: selected.id, months: billing === "yearly" ? 12 : quote.months, billing },
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
        body: billing === "token"
          ? { mpesa_code: code.trim(), billing: "token" }
          : { mpesa_code: code.trim(), plan_id: selected?.id, months: billing === "yearly" ? 12 : quote?.months, billing },
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
    if (plan) setPlanId(plan.id);
    setNotice("");
    setStep("checkout");
  }

  const recommendedIndex = visiblePlans.length >= 3 ? 2 : Math.max(0, visiblePlans.length - 1);
  const currency = selected?.currency || "KES";

  return (
    <div className="theme-page fixed inset-0 z-[80] overflow-y-auto">
      <button
        type="button"
        onClick={closeForLater}
        className="fixed right-4 top-4 z-[90] rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
      >
        Close
      </button>
      <div className="mx-auto min-h-full max-w-6xl px-4 pb-16 pt-16 sm:px-8">
        {step === "checkout" && ((billing === "token" && !forPos) || selected) ? (
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
            plans={visiblePlans}
            forPos={forPos}
            billing={billing}
            setBilling={(next) => {
              setBilling(next);
              setPlanId(null);
            }}
            mode={mode}
            tokenPack={tokenPack}
            tokenBalance={Number(organizationLicense?.token_balance) || 0}
            currentName={mode === "full" ? organizationLicense?.plan_name : ""}
            recommendedIndex={recommendedIndex}
            onPay={openCheckout}
          />
        )}
      </div>
    </div>
  );
}

function listedPrice(plan, billing) {
  const currency = plan.currency || "KES";
  if (billing === "yearly") {
    return { amount: Number(plan.yearly_price) || 0, suffix: "/ year", currency };
  }
  return { amount: Number(plan.monthly_price) || 0, suffix: "/ month", currency };
}

function PlansStep({ plans, billing, setBilling, mode, tokenPack, tokenBalance, currentName, recommendedIndex, onPay, forPos = false }) {
  const emptyCopy = billing === "yearly"
    ? "No yearly plans are published yet. A platform administrator sets those under Self-serve plans."
    : billing === "monthly"
      ? "No monthly plans are published yet. A platform administrator sets those under Self-serve plans."
      : "A platform administrator has not published a token pack yet.";
  return (
    <div>
      <h1 className="theme-heading text-center text-3xl font-semibold tracking-tight">Upgrade your plan</h1>
      <div className="mx-auto mt-6 flex w-fit rounded-full border border-[var(--theme-border)] bg-[var(--theme-surface-subtle)] p-1 text-sm">
        {(forPos ? ["monthly", "yearly"] : ["token", "monthly", "yearly"]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setBilling(option)}
            className={`rounded-full px-5 py-1.5 capitalize ${
              billing === option
                ? "bg-[var(--theme-primary)] text-[var(--theme-primary-fg)]"
                : "text-[var(--theme-text-muted)]"
            }`}
          >
            {option === "yearly" ? "Yearly" : option === "monthly" ? "Monthly" : "Token"}
          </button>
        ))}
      </div>
      {forPos ? (
        <p className="theme-subtext mx-auto mt-4 max-w-2xl text-center text-sm">
          External POS needs a monthly or yearly subscription. Token billing cannot run this till, because sales are taken offline and uploaded later.
        </p>
      ) : null}
      <p className="theme-subtext mx-auto mt-4 max-w-2xl text-center text-sm">
        {billing === "token"
          ? "Buy a token pack. Each completed sale uses tokens when the order is saved online."
          : mode === "expired"
            ? "This organisation’s paid period has ended. Choose a plan to open those features again."
            : "Choose the plan this organisation should use. Features left off a plan stay hidden."}
      </p>
      {billing === "token" ? (
        tokenPack && tokenPack.price > 0 ? (
          <div className="mt-8 flex flex-wrap justify-center gap-5">
            <article className="theme-panel flex w-full flex-col rounded-2xl border border-[var(--theme-primary)] bg-[var(--theme-primary-subtle)] p-5 sm:w-[calc((100%-3rem)/3)] sm:min-w-[20rem] sm:flex-none">
              <p className="theme-text-muted text-sm">Token pack</p>
              <h2 className="theme-heading mt-3 text-xl font-semibold">{tokenPack.tokens} tokens</h2>
              <p className="theme-heading mt-6 text-4xl font-semibold tracking-tight">
                {formatBillingMoney(tokenPack.price, "KES")}
              </p>
              <button type="button" onClick={() => onPay(null)} className="theme-primary-btn mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold">
                Pay now
              </button>
              <ul className="theme-text-muted mt-6 space-y-3 text-sm">
                <li className="flex gap-2"><span className="text-[var(--theme-primary)]">✓</span><span>{tokenBalance} tokens remaining</span></li>
                <li className="flex gap-2"><span className="text-[var(--theme-primary)]">✓</span><span>Each completed sale uses {tokenPack.saleTokens} token{tokenPack.saleTokens === 1 ? "" : "s"}</span></li>
                <li className="flex gap-2"><span className="text-[var(--theme-primary)]">✓</span><span>Reading stays free</span></li>
              </ul>
            </article>
          </div>
        ) : (
          <p className="theme-panel theme-text-muted mx-auto mt-8 max-w-lg rounded-2xl border p-4 text-center text-sm">{emptyCopy}</p>
        )
      ) : plans.length === 0 ? (
        <p className="theme-panel theme-text-muted mx-auto mt-8 max-w-lg rounded-2xl border p-4 text-center text-sm">
          {emptyCopy}
        </p>
      ) : (
        <div className="mt-8 flex flex-wrap justify-center gap-5">
          {plans.map((plan, index) => {
            const price = listedPrice(plan, billing);
            const current = currentName && plan.name === currentName;
            const recommended = index === recommendedIndex && !current;
            return (
              <article
                key={plan.id}
                className={`flex w-full flex-col rounded-2xl border p-5 sm:w-[calc((100%-3rem)/3)] sm:min-w-[20rem] sm:flex-none ${
                  recommended
                    ? "border-[var(--theme-primary)] bg-[var(--theme-primary-subtle)]"
                    : "theme-panel"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="theme-text-muted text-sm">{plan.name}</p>
                  {recommended ? (
                    <span className="rounded-full bg-[var(--theme-primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-primary-fg)]">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <h2 className="theme-heading mt-3 text-xl font-semibold">{plan.description || plan.name}</h2>
                <p className="theme-heading mt-6 text-4xl font-semibold tracking-tight">
                  {formatBillingMoney(price.amount, price.currency)}
                  <span className="theme-subtext text-base font-normal"> {price.suffix}</span>
                </p>
                <button
                  type="button"
                  disabled={current}
                  onClick={() => onPay(plan)}
                  className={`mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-default ${
                    recommended ? "theme-primary-btn" : "theme-secondary-btn"
                  }`}
                >
                  {current ? "Your current plan" : "Pay now"}
                </button>
                <ul className="theme-text-muted mt-6 space-y-3 text-sm">
                  {(plan.features ?? []).map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="mt-0.5 text-[var(--theme-primary)]">✓</span>
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
  const features = (selected?.features ?? []).slice(0, 5);
  const inputClass = "theme-input w-full rounded-xl border px-3 py-3 text-sm";
  const fieldClass = "theme-inset-panel rounded-xl border px-3 py-3";
  return (
    <div>
      <button type="button" onClick={onBack} className="theme-link text-sm font-medium">
        ‹ Configure your plan
      </button>
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <h2 className="theme-heading text-sm font-medium">Pay with</h2>
          <div className="theme-inset-panel mt-3 inline-flex rounded-xl border px-4 py-3 text-sm font-semibold">
            M-Pesa
          </div>
          <label className="mt-4 block text-sm">
            <span className="theme-subtext mb-1 block text-xs">M-Pesa phone</span>
            <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07…" />
          </label>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className={fieldClass}>
              <dt className="theme-subtext text-xs">Paybill</dt>
              <dd className="theme-heading mt-1 font-mono text-sm">{paybill?.short_code || "Ask your Centrix administrator"}</dd>
            </div>
            <div className={fieldClass}>
              <dt className="theme-subtext text-xs">Account</dt>
              <dd className="theme-heading mt-1 font-mono text-sm">{account || "Your organisation code"}</dd>
            </div>
          </dl>
          <label className="mt-4 block text-sm">
            <span className="theme-subtext mb-1 block text-xs">M-Pesa code, after you pay</span>
            <input
              className={`${inputClass} font-mono uppercase`}
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="QLK1ABC234"
            />
          </label>
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <button type="button" className="theme-link disabled:opacity-50" disabled={busy !== ""} onClick={onCheck}>
              {busy === "check" ? "Checking…" : "I have paid — check again"}
            </button>
            <button type="button" className="theme-link disabled:opacity-50" disabled={busy !== ""} onClick={onNotify}>
              {busy === "manual" ? "Notifying…" : "Notify admin on WhatsApp"}
            </button>
          </div>
          {notice ? <p className="theme-alert-error mt-4 rounded-lg px-3 py-2 text-sm">{notice}</p> : null}
        </section>
        <aside className="theme-panel rounded-3xl border p-6">
          <h2 className="theme-heading text-2xl font-semibold">{billing === "token" ? "Token pack" : selected?.name}</h2>
          <p className="theme-text-muted mt-4 text-sm font-medium">Top features</p>
          <ul className="theme-text-muted mt-3 space-y-2 text-sm">
            {features.map((feature) => (
              <li key={feature} className="flex gap-2">
                <span className="text-[var(--theme-primary)]">✦</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="theme-text-muted">{billing === "token" ? "Token pack" : billing === "yearly" ? "Yearly subscription" : "Monthly subscription"}</dt>
              <dd className="theme-heading">{formatBillingMoney(due, currency)}</dd>
            </div>
            {billing === "monthly" && quote?.discount > 0 ? (
              <div className="theme-text-muted flex justify-between gap-4">
                <dt>Discount</dt>
                <dd>−{formatBillingMoney(quote.discount, currency)}</dd>
              </div>
            ) : null}
            <div className="theme-heading flex justify-between gap-4 border-t border-[var(--theme-border)] pt-3 font-semibold">
              <dt>Due today</dt>
              <dd>{formatBillingMoney(due, currency)}</dd>
            </div>
          </dl>
          <button
            type="button"
            disabled={busy !== ""}
            onClick={onPay}
            className="theme-primary-btn mt-6 w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
          >
            {busy === "stk" ? "Sending prompt…" : "Subscribe"}
          </button>
          <p className="theme-subtext mt-4 text-xs leading-5">
            Pay {formatBillingMoney(due, currency)} to Paybill {paybill?.short_code || "—"} account {account || "your organisation code"}.
            The prompt goes to the M-Pesa phone above. This does not renew by itself.
          </p>
        </aside>
      </div>
    </div>
  );
}
