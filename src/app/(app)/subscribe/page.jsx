"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { apiRequest, ApiError } from "@/lib/api";
import { formatBillingMoney } from "@/lib/platform-billing";
import { dismissLicenseWarning, freePlanHome, isFreePlanPath, licenceNeedsPayment, licenseAccessMode, subscriptionRenewalOpen, takeLicenceReturnPath } from "@/lib/organization-license";
import { resolveHomePath } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { isTerminalWorkspace, workspaceHomePath } from "@/lib/workspaces";
import { recallWorkspaceTabLandingPath } from "@/lib/tab-workspace";
import { featureTitle, FreePlanCard, monthOffer, onceOffer, OneTimeQuoteCard, PlanGroup, prepaidOffer, TokenPackCard, YearlyBillingSwitch } from "@/components/platform/upgrade-plan-cards";

const EMPTY_PLANS = [];
const DEFAULT_DISCOUNT = { percent: 0, min_months: 3 };

function renewalCharge(license) {
  const yearly = license?.billing_cycle === "yearly";
  return {
    kind: "renew",
    billing: "renew",
    months: yearly ? 12 : 1,
    amount: Number(license?.renewal_amount) || 0,
    currency: license?.currency || "KES",
    plan: {
      id: license?.plan_id,
      name: license?.plan_name || (yearly ? "Yearly plan" : "Monthly plan"),
      features: [yearly ? "Another year on the current plan" : "Another month on the current plan"],
    },
  };
}

export default function SubscribePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forPos = searchParams.get("for") === "pos";
  const requestedPlanId = /^[1-9]\d*$/.test(searchParams.get("plan_id") || "")
    ? Number(searchParams.get("plan_id"))
    : null;
  const requestedBilling = ["monthly", "yearly", "prepaid"].includes(searchParams.get("billing"))
    ? searchParams.get("billing")
    : "monthly";
  const { organization, organizationLicense, capabilities, user, isSuperAdmin, isOrgAdmin, refreshCapabilities } = useAuth();
  const canPay = Boolean(isOrgAdmin?.());
  const plans = Array.isArray(organizationLicense?.plans) ? organizationLicense.plans : EMPTY_PLANS;
  const discount = organizationLicense?.duration_discount ?? DEFAULT_DISCOUNT;
  const renewOpen = canPay && subscriptionRenewalOpen(organizationLicense);
  const [charge, setCharge] = useState(() => (renewOpen ? renewalCharge(organizationLicense) : null));
  const [yearly, setYearly] = useState(false);
  const [quoteNotice, setQuoteNotice] = useState("");
  const [tokenPack, setTokenPack] = useState(null);
  const [tokensEnabled, setTokensEnabled] = useState(true);
  const [step, setStep] = useState(renewOpen ? "checkout" : "plans");
  const [phone, setPhone] = useState(user?.phone || organizationLicense?.paybill?.account_phone || "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [checkoutId, setCheckoutId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("mpesa_stk");
  const [paymentMethods, setPaymentMethods] = useState({});
  const [equityInstructions, setEquityInstructions] = useState(null);
  const [equityCheckout, setEquityCheckout] = useState(null);
  const [equityTransactionId, setEquityTransactionId] = useState("");
  const [equityNotified, setEquityNotified] = useState(false);
  const [manualPaybill, setManualPaybill] = useState(null);
  const [watching, setWatching] = useState(false);
  const purchaseIntentHandled = useRef(false);

  useEffect(() => {
    if (!requestedPlanId || purchaseIntentHandled.current || !canPay || plans.length === 0) return;

    const plan = plans.find((item) => Number(item.id) === requestedPlanId);
    if (!plan) {
      purchaseIntentHandled.current = true;
      setNotice("That plan is not available for this organisation. Choose a plan below.");
      return;
    }

    let offer = null;
    if (requestedBilling === "prepaid" && Number(plan.monthly_price) > 0) {
      offer = prepaidOffer(plan, discount);
    } else if (requestedBilling === "yearly" && Number(plan.yearly_price) > 0) {
      offer = onceOffer(plan);
    } else if (requestedBilling === "monthly" && Number(plan.monthly_price) > 0) {
      offer = monthOffer(plan);
    }

    purchaseIntentHandled.current = true;
    if (offer) {
      setCharge(offer);
      setStep("checkout");
    } else {
      setNotice("That billing option is no longer available for this plan. Choose another option below.");
    }
  }, [canPay, discount, plans, requestedBilling, requestedPlanId]);

  useEffect(() => {
    let cancelled = false;
    apiRequest("/erp/organization/billing")
      .then((res) => {
        if (cancelled) return;
        const policy = res.data?.policy ?? {};
        setTokensEnabled(policy.tokens_enabled !== false);
        const availableMethods = res.data?.payment_methods ?? {};
        setPaymentMethods(availableMethods);
        setEquityInstructions(res.data?.equity ?? null);
        setManualPaybill(res.data?.paybill ?? organizationLicense?.paybill ?? null);
        setPaymentMethod(
          availableMethods.mpesa_stk
            ? "mpesa_stk"
            : availableMethods.mpesa_manual
              ? "mpesa_manual"
              : availableMethods.equity
                ? "equity"
                : "",
        );
        setTokenPack({
          tokens: Number(policy.token_pack_tokens) || 0,
          price: Number(policy.token_pack_price_kes) || 0,
          saleTokens: Number(policy.sale_tokens) || 1,
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setNotice(err instanceof ApiError ? err.message : "Could not load payment options.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [organizationLicense?.paybill]);

  const due = Number(charge?.amount) || 0;
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
    const modeNow = licenseAccessMode(organizationLicense);
    const backAllowed = Boolean(back) && (
      !licenceNeedsPayment(organizationLicense)
      || isFreePlanPath(back, organizationLicense)
    );
    if (backAllowed) {
      router.replace(back);
      return;
    }
    if (licenceNeedsPayment(organizationLicense) || modeNow === "free") {
      router.replace(freePlanHome(organizationLicense));
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
    if (!canPay || !subscriptionRenewalOpen(organizationLicense)) {
      closeForLater();
      return;
    }
    setCharge(renewalCharge(organizationLicense));
    setStep("checkout");
  }, [canPay, closeForLater, organizationLicense]);

  useEffect(() => {
    function onKey(event) {
      if (event.key !== "Escape") return;
      if (step === "checkout") {
        if (charge?.kind === "renew") closeForLater();
        else setStep("plans");
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

  useEffect(() => {
    if (!watching || !checkoutId) return undefined;
    let stopped = false;

    async function poll() {
      try {
        const res = await apiRequest(`/erp/organization/licence/status?checkout_id=${checkoutId}`);
        if (stopped) return;
        if (res.status === "paid") {
          setWatching(false);
          if (await leaveIfPaid(res.license)) return;
          const next = await refreshCapabilities({ force: true });
          if (stopped) return;
          if (await leaveIfPaid(next?.license ?? next?.subscription)) return;
          setNotice(res.message || "M-Pesa payment confirmed.");
          return;
        }
        if (res.stk_failed) {
          setWatching(false);
          setNotice(res.message || "M-Pesa did not complete this payment.");
          return;
        }
        setNotice(res.message || "Waiting for M-Pesa to confirm this payment.");
      } catch {
        if (!stopped) setNotice("Still waiting for the M-Pesa confirmation.");
      }
    }

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [checkoutId, watching]);

  async function payNow() {
    if (!paymentMethods.mpesa_stk) {
      setNotice("M-Pesa STK is unavailable. Choose manual M-Pesa or Equity transfer.");
      return;
    }
    if (charge?.kind === "token" && (forPos || !tokensEnabled)) {
      setNotice(forPos
        ? "External POS needs a monthly or yearly subscription."
        : "Token billing is turned off. Choose a monthly or yearly plan.");
      return;
    }
    if (!charge || (charge.kind !== "token" && charge.kind !== "renew" && !charge.plan?.id)) {
      setNotice("Choose a plan.");
      return;
    }
    if (charge.kind === "renew" && !(Number(charge.amount) > 0)) {
      setNotice("A platform administrator has not set the renew amount for this organisation.");
      return;
    }
    setBusy("stk");
    setNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/stk", {
        method: "POST",
        body: charge.kind === "token"
          ? { billing: "token", phone }
          : charge.kind === "renew"
            ? { billing: "renew", phone }
            : { plan_id: charge.plan.id, months: charge.months, phone, billing: charge.billing },
      });
      if (res.checkout?.id) setCheckoutId(res.checkout.id);
      setWatching(Boolean(res.stk && res.checkout?.id));
      setNotice(res.message || "Check your phone for the M-Pesa prompt.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not start M-Pesa.");
    } finally {
      setBusy("");
    }
  }

  async function selectPaymentMethod(method) {
    setPaymentMethod(method);
    setNotice("");
    setCode("");
    setCheckoutId(null);
    setEquityCheckout(null);
    setEquityTransactionId("");
    setEquityNotified(false);

    if (method !== "mpesa_manual" || !charge || charge.kind === "token" || charge.kind === "renew") {
      return;
    }
    if (!paymentMethods.mpesa_manual) {
      setNotice("Manual M-Pesa payment is not configured. Contact Centrix support.");
      return;
    }

    setBusy("manual-checkout");
    try {
      const res = await apiRequest("/erp/organization/licence/checkout", {
        method: "POST",
        body: {
          plan_id: charge.plan.id,
          months: charge.months,
          billing: charge.billing === "yearly" ? "yearly" : "monthly",
        },
      });
      setCheckoutId(res.checkout?.id ?? null);
      setManualPaybill(res.paybill ?? manualPaybill);
      setNotice(res.message || "Use the Paybill details below to complete your transfer.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not prepare manual M-Pesa payment.");
    } finally {
      setBusy("");
    }
  }

  async function startEquity() {
    if (!charge?.plan?.id || charge.kind === "token" || charge.kind === "renew") return;
    setBusy("equity-start");
    setNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/equity/checkout", {
        method: "POST",
        body: {
          plan_id: charge.plan.id,
          months: charge.months,
          billing: charge.billing === "yearly" ? "yearly" : "monthly",
        },
      });
      setEquityCheckout(res.checkout ?? null);
      setCheckoutId(res.checkout?.id ?? null);
      setEquityInstructions(res.equity ?? equityInstructions);
      setEquityNotified(false);
      setNotice("Transfer the exact amount using your organisation code as the reference.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not prepare Equity payment.");
    } finally {
      setBusy("");
    }
  }

  async function verifyEquity() {
    if (!equityCheckout?.id || !equityTransactionId.trim()) return;
    setBusy("equity-check");
    setEquityNotified(false);
    setNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/equity/verify", {
        method: "POST",
        body: {
          checkout_id: equityCheckout.id,
          transaction_id: equityTransactionId.trim(),
        },
      });
      if (res.confirmed) {
        if (await leaveIfPaid(res.license)) return;
        const next = await refreshCapabilities({ force: true });
        if (await leaveIfPaid(next?.license ?? next?.subscription)) return;
      }
      setNotice(res.message || "Equity payment has not been confirmed yet.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not verify the Equity transfer.");
    } finally {
      setBusy("");
    }
  }

  async function notifyEquityAdmin() {
    if (!equityCheckout?.id || !equityTransactionId.trim()) return;
    setBusy("equity-notify");
    setNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/equity/notify", {
        method: "POST",
        body: {
          checkout_id: equityCheckout.id,
          transaction_id: equityTransactionId.trim(),
        },
      });
      setEquityNotified(Boolean(res.admin_notified));
      setNotice(res.message || "Your payment reference was sent to the platform administrator for review.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "Could not notify the platform administrator.");
    } finally {
      setBusy("");
    }
  }

  async function notifyAdmin() {
    if (charge?.kind === "token" && (forPos || !tokensEnabled)) return;
    if (!charge || (charge.kind !== "token" && charge.kind !== "renew" && !charge.plan?.id)) return;
    setBusy("manual");
    setNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/notify", {
        method: "POST",
        body: charge.kind === "token"
          ? { billing: "token" }
          : charge.kind === "renew"
            ? { billing: "renew" }
            : { plan_id: charge.plan.id, months: charge.months, billing: charge.billing },
      });
      if (res.checkout?.id) setCheckoutId(res.checkout.id);
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
      if (!code.trim() && checkoutId) {
        const status = await apiRequest(`/erp/organization/licence/status?checkout_id=${checkoutId}`);
        if (status.status === "paid") {
          if (await leaveIfPaid(status.license)) return;
      const next = await refreshCapabilities({ force: true });
          if (await leaveIfPaid(next?.license ?? next?.subscription)) return;
        }
        setNotice(status.message || "M-Pesa has not confirmed this payment yet.");
        return;
      }
      const res = await apiRequest("/erp/organization/licence/verify", {
        method: "POST",
        body: charge?.kind === "token"
          ? { mpesa_code: code.trim(), billing: "token", checkout_id: checkoutId || undefined }
          : charge?.kind === "renew"
            ? { mpesa_code: code.trim(), billing: "renew", checkout_id: checkoutId || undefined }
            : { mpesa_code: code.trim(), plan_id: charge?.plan?.id, months: charge?.months, billing: charge?.billing, checkout_id: checkoutId || undefined },
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

  function openCheckout(offer) {
    if (!offer) return;
    setCharge(offer);
    setNotice("");
    setStep("checkout");
  }

  async function requestQuote() {
    setBusy("quote");
    setQuoteNotice("");
    try {
      const res = await apiRequest("/erp/organization/licence/one-time-quote", { method: "POST", body: {} });
      setQuoteNotice(res.message || "Your quote request was emailed to the Centrix administrator.");
    } catch (err) {
      setQuoteNotice(err instanceof ApiError ? err.message : "Could not send the quote.");
    } finally {
      setBusy("");
    }
  }

  const currency = charge?.currency || "KES";

  return (
    <div className="theme-page fixed inset-0 z-[80] overflow-y-auto">
      <button
        type="button"
        onClick={closeForLater}
        className="fixed right-4 top-4 z-[90] rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
      >
        Close
      </button>
      <div className="mx-auto min-h-full max-w-[96rem] px-4 pb-16 pt-16 sm:px-8">
        {step === "checkout" && charge ? (
          <CheckoutStep
            charge={charge}
            due={due}
            currency={currency}
            paybill={paybill}
            account={account}
            manualPaybill={manualPaybill}
            equityInstructions={equityInstructions}
            paymentMethods={paymentMethods}
            paymentMethod={paymentMethod}
            checkoutId={checkoutId}
            setPaymentMethod={(method) => void selectPaymentMethod(method)}
            onStartManual={() => void selectPaymentMethod("mpesa_manual")}
            equityCheckout={equityCheckout}
            equityTransactionId={equityTransactionId}
            equityNotified={equityNotified}
            setEquityTransactionId={(value) => {
              setEquityTransactionId(value);
              setEquityNotified(false);
            }}
            phone={phone}
            setPhone={setPhone}
            code={code}
            setCode={setCode}
            busy={busy}
            notice={notice}
            watching={watching}
            onBack={charge.kind === "renew" ? closeForLater : () => setStep("plans")}
            backLabel={charge.kind === "renew" ? "Close" : "‹ Configure your plan"}
            onPay={() => void payNow()}
            onStartEquity={() => void startEquity()}
            onVerifyEquity={() => void verifyEquity()}
            onNotifyEquityAdmin={() => void notifyEquityAdmin()}
            onNotify={() => void notifyAdmin()}
            onCheck={() => void checkNow()}
          />
        ) : (
          <PlansStep
            plans={plans}
            discount={discount}
            forPos={forPos}
            tokensEnabled={tokensEnabled}
            yearly={yearly}
            setYearly={setYearly}
            mode={mode}
            tokenPack={tokenPack}
            tokenBalance={Number(organizationLicense?.token_balance) || 0}
            currentName={mode === "full" || mode === "trial" ? organizationLicense?.plan_name || "" : ""}
            currentPlanId={mode === "full" || mode === "trial" ? organizationLicense?.plan_id || null : null}
            canPay={canPay}
            packageCurrent={mode === "free" || mode === "expired"}
            tokenCurrent={mode === "token"}
            freeName={organizationLicense?.free_plan?.name || organizationLicense?.current_package || "Package 1"}
            freePages={(organizationLicense?.free_plan?.pages ?? []).map((page) => page?.label).filter(Boolean)}
            onPay={openCheckout}
            onQuote={() => void requestQuote()}
            quoteBusy={busy === "quote"}
            quoteNotice={quoteNotice}
          />
        )}
      </div>
    </div>
  );
}

function PlansStep({
  plans,
  discount,
  yearly = false,
  setYearly,
  mode,
  tokenPack,
  tokenBalance,
  currentName,
  currentPlanId = null,
  canPay = true,
  packageCurrent = false,
  tokenCurrent = false,
  freeName = "Package 1",
  freePages = [],
  onPay,
  onQuote,
  quoteBusy,
  quoteNotice,
  forPos = false,
  tokensEnabled = true,
}) {
  const monthlyPlans = plans.filter((plan) => plan.interval !== "yearly" && Number(plan.monthly_price) > 0);
  const yearlyPlans = plans.filter((plan) => plan.interval === "yearly" && Number(plan.yearly_price) > 0);
  const prepaid = monthlyPlans.map((plan) => prepaidOffer(plan, discount));
  const once = yearlyPlans.filter((plan) => plan.yearly_billing !== "subscription").map(onceOffer);
  const yearSubs = yearlyPlans.filter((plan) => plan.yearly_billing === "subscription").map((plan) => ({
    ...onceOffer(plan),
    kind: "year_sub",
  }));
  const monthly = monthlyPlans.map(monthOffer);
  const offers = yearly ? [...prepaid, ...yearSubs, ...once] : monthly;
  const saving = prepaid.some((offer) => offer.percent > 0);
  const showToken = !forPos && tokensEnabled && tokenPack && tokenPack.price > 0;
  const quoteCard = (
    <OneTimeQuoteCard busy={quoteBusy} canPay={canPay} onQuote={onQuote} notice={quoteNotice} />
  );
  const freeLabel = String(freeName || "Package 1").trim() || "Package 1";
  const freeCard = <FreePlanCard pages={freePages} name={freeLabel} current={packageCurrent} />;
  const tokenCard = showToken ? (
    <TokenPackCard
      tokens={tokenPack.tokens}
      price={tokenPack.price}
      saleTokens={tokenPack.saleTokens}
      balance={tokenBalance}
      current={tokenCurrent}
      canPay={canPay}
      onStart={() => {
        const saleTokens = Number(tokenPack?.saleTokens) || 1;
        onPay({
          kind: "token",
          billing: "token",
          months: 0,
          amount: Number(tokenPack?.price) || 0,
          currency: "KES",
          plan: {
            name: "Token pack",
            features: [
              `${Number(tokenPack?.tokens) || 0} tokens`,
              `Each completed sale uses ${saleTokens} token${saleTokens === 1 ? "" : "s"}`,
              "Reading stays free",
            ],
          },
        });
      }}
    />
  ) : null;
  const intro = mode === "expired"
    ? `Your trial or paid period has ended. This organisation is on ${freeLabel} until you choose a plan again.`
    : yearly
      ? (saving
        ? "Turn Yearly on to pay for a whole year now. Duration discount is taken off where it applies."
        : "Turn Yearly on to see the price for a whole year on each package.")
      : "Free sits first. Paid packages bill each month, or turn Yearly on to pay for the year.";

  return (
    <div>
      <h1 className="theme-heading text-center text-3xl font-semibold tracking-tight">Upgrade your plan</h1>
      <YearlyBillingSwitch yearly={yearly} onChange={setYearly} />
      {forPos ? (
        <p className="theme-subtext mx-auto mt-4 max-w-2xl text-center text-sm">
          External POS needs a monthly or yearly subscription. Token billing cannot run this till, because sales are taken offline and uploaded later.
        </p>
      ) : null}
      <p className="theme-subtext mx-auto mt-4 max-w-2xl text-center text-sm">{intro}</p>
      {packageCurrent || tokenCurrent || currentName ? (
        <p className="mx-auto mt-3 text-center text-sm font-semibold text-[var(--theme-primary)]">
          Current package: {packageCurrent ? freeLabel : tokenCurrent ? "Token pack" : currentName}
        </p>
      ) : null}
      {canPay ? null : (
        <p className="theme-subtext mx-auto mt-3 max-w-2xl text-center text-sm">An organisation admin pays for Centrix.</p>
      )}
      <div className="mt-8">
        {offers.length === 0 && !showToken ? (
          <div className="space-y-6">
            <PlanGroup
              leading={freeCard}
              offers={[]}
              trailing={quoteCard}
            />
            <p className="theme-panel theme-text-muted mx-auto max-w-lg rounded-2xl border p-4 text-center text-sm">
              {yearly
                ? "No yearly prices are published for this industry yet. A platform administrator sets the price under Self-serve plans."
                : "No monthly plans are published for this industry yet. A platform administrator sets the price under Self-serve plans."}
            </p>
          </div>
        ) : (
          <PlanGroup
            leading={freeCard}
            offers={offers}
            currentName={currentName}
            currentPlanId={currentPlanId}
            canPay={canPay}
            onPay={onPay}
            trailing={[tokenCard, quoteCard].filter(Boolean)}
          />
        )}
      </div>
    </div>
  );
}

function CheckoutStep({
  charge,
  due,
  currency,
  paybill,
  account,
  manualPaybill,
  equityInstructions,
  paymentMethods,
  paymentMethod,
  checkoutId,
  setPaymentMethod,
  onStartManual,
  equityCheckout,
  equityTransactionId,
  setEquityTransactionId,
  equityNotified,
  phone,
  setPhone,
  code,
  setCode,
  busy,
  notice,
  watching = false,
  onBack,
  backLabel = "‹ Configure your plan",
  onPay,
  onStartEquity,
  onVerifyEquity,
  onNotifyEquityAdmin,
  onNotify,
  onCheck,
}) {
  const token = charge?.kind === "token";
  const features = (charge?.plan?.features ?? []).slice(0, 5).map(featureTitle).filter(Boolean);
  const product = token
    ? "Token pack"
    : charge?.kind === "renew"
      ? `${charge.months === 12 ? "Yearly" : "Monthly"} renewal`
    : charge?.kind === "once"
      ? "Yearly subscription"
      : charge?.kind === "prepaid"
        ? "12 months paid in advance"
        : "Monthly subscription";
  const inputClass = "theme-input w-full rounded-xl border px-3 py-3 text-sm";
  const fieldClass = "theme-inset-panel rounded-xl border px-3 py-3";
  const canPayByEquity = Boolean(
    paymentMethods?.equity && equityInstructions && charge?.plan?.id && charge.kind !== "token" && charge.kind !== "renew",
  );
  const canPayByManual = Boolean(
    paymentMethods?.mpesa_manual && charge?.plan?.id && charge.kind !== "token" && charge.kind !== "renew",
  );

  return (
    <div>
      <button type="button" onClick={onBack} className="theme-link text-sm font-medium">
        {backLabel}
                </button>
      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <h2 className="theme-heading text-sm font-medium">Pay with</h2>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Payment method">
            {paymentMethods?.mpesa_stk ? (
              <button
                type="button"
                aria-pressed={paymentMethod === "mpesa_stk"}
                onClick={() => setPaymentMethod("mpesa_stk")}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${paymentMethod === "mpesa_stk" ? "theme-primary-btn" : "theme-inset-panel"}`}
              >
                M-Pesa STK
              </button>
            ) : null}
            {canPayByEquity ? (
              <button
                type="button"
                aria-pressed={paymentMethod === "equity"}
                onClick={() => setPaymentMethod("equity")}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${paymentMethod === "equity" ? "theme-primary-btn" : "theme-inset-panel"}`}
              >
                Equity
              </button>
            ) : null}
            {canPayByManual ? (
              <button
                type="button"
                aria-pressed={paymentMethod === "mpesa_manual"}
                onClick={() => setPaymentMethod("mpesa_manual")}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold ${paymentMethod === "mpesa_manual" ? "theme-primary-btn" : "theme-inset-panel"}`}
              >
                M-Pesa manual
              </button>
            ) : null}
          </div>
          {!paymentMethods?.mpesa_stk && !canPayByEquity && !canPayByManual ? (
            <p className="theme-alert-error mt-4 rounded-lg px-3 py-2 text-sm" role="alert">
              No online payment methods are configured. Contact the Centrix administrator.
            </p>
          ) : null}
          {paymentMethod === "mpesa_stk" && paymentMethods?.mpesa_stk ? (
            <>
              <label className="mt-4 block text-sm">
                <span className="theme-subtext mb-1 block text-xs">M-Pesa phone</span>
                <input className={inputClass} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07…" />
              </label>
              <p className="theme-subtext mt-3 text-sm">We’ll send a secure payment prompt to your phone.</p>
            </>
          ) : null}
          {paymentMethod === "mpesa_manual" && canPayByManual ? (
            <div className="mt-4 space-y-4">
              <p className="theme-subtext text-sm">
                Transfer the exact amount and use your organisation code as the payment reference.
              </p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className={fieldClass}>
                  <dt className="theme-subtext text-xs">Paybill / Till</dt>
                  <dd className="theme-heading mt-1 font-mono text-sm">{manualPaybill?.short_code}</dd>
                </div>
                <div className={fieldClass}>
                  <dt className="theme-subtext text-xs">Account / reference</dt>
                  <dd className="theme-heading mt-1 font-mono text-sm">{manualPaybill?.account_number || account}</dd>
                </div>
                {manualPaybill?.account_name ? (
                  <div className={fieldClass}>
                    <dt className="theme-subtext text-xs">Account name</dt>
                    <dd className="theme-heading mt-1 text-sm">{manualPaybill.account_name}</dd>
                  </div>
                ) : null}
              </dl>
              {manualPaybill?.instructions ? (
                <p className="theme-subtext text-sm">{manualPaybill.instructions}</p>
              ) : null}
              {!checkoutId ? (
                <button
                  type="button"
                  className="theme-primary-btn w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
                  disabled={busy !== ""}
                  onClick={onStartManual}
                >
                  {busy === "manual-checkout" ? "Preparing payment…" : "Prepare manual payment"}
                </button>
              ) : (
                <>
                  <label className="block text-sm">
                    <span className="theme-subtext mb-1 block text-xs">M-Pesa transaction code</span>
                    <input
                      className={`${inputClass} font-mono uppercase`}
                      value={code}
                      onChange={(event) => setCode(event.target.value.toUpperCase())}
                      placeholder="QLK1ABC234"
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="button"
                    className="theme-primary-btn w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
                    disabled={busy !== "" || !code.trim()}
                    onClick={onCheck}
                  >
                    {busy === "check" ? "Verifying payment…" : "Verify M-Pesa payment"}
                  </button>
                </>
              )}
            </div>
          ) : null}
          {paymentMethod === "equity" && canPayByEquity ? (
            <div className="mt-4 space-y-4">
              <p className="theme-subtext text-sm">Transfer the exact amount and use your organisation code as the payment reference.</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className={fieldClass}>
                  <dt className="theme-subtext text-xs">Equity account</dt>
                  <dd className="theme-heading mt-1 text-sm">{equityInstructions?.account_name}</dd>
                </div>
                <div className={fieldClass}>
                  <dt className="theme-subtext text-xs">Paybill / account</dt>
                  <dd className="theme-heading mt-1 font-mono text-sm">{equityInstructions?.paybill_number}</dd>
                </div>
                <div className={fieldClass}>
                  <dt className="theme-subtext text-xs">Reference</dt>
                  <dd className="theme-heading mt-1 font-mono text-sm">{equityInstructions?.reference}</dd>
                </div>
                <div className={fieldClass}>
                  <dt className="theme-subtext text-xs">Account number</dt>
                  <dd className="theme-heading mt-1 font-mono text-sm">{equityInstructions?.account_number}</dd>
                </div>
              </dl>
              {equityInstructions?.instructions ? (
                <p className="theme-subtext text-sm">{equityInstructions.instructions}</p>
              ) : null}
              {!equityCheckout ? (
                <button
                  type="button"
                  disabled={busy !== ""}
                  onClick={onStartEquity}
                  className="theme-primary-btn w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
                >
                  {busy === "equity-start" ? "Preparing payment…" : "Continue with Equity"}
                </button>
              ) : (
                <>
                  <label className="block text-sm">
                    <span className="theme-subtext mb-1 block text-xs">Equity transaction reference</span>
                    <input
                      className={`${inputClass} font-mono uppercase`}
                      value={equityTransactionId}
                      onChange={(event) => setEquityTransactionId(event.target.value.trim())}
                      autoComplete="off"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy !== "" || !equityTransactionId.trim()}
                    onClick={onVerifyEquity}
                    className="theme-primary-btn w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
                  >
                    {busy === "equity-check" ? "Verifying transfer…" : "Verify Equity payment"}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== "" || !equityTransactionId.trim() || equityNotified}
                    onClick={onNotifyEquityAdmin}
                    className="theme-inset-panel w-full rounded-lg border py-3 text-sm font-semibold disabled:opacity-60"
                  >
                    {busy === "equity-notify"
                      ? "Notifying platform admin…"
                      : equityNotified
                        ? "Payment sent for admin review"
                        : "I’ve paid — notify platform admin"}
                  </button>
                  <p className="theme-subtext text-xs leading-5">
                    For a manual transfer, submit its transaction reference. A platform administrator will verify it before activating your plan.
                  </p>
                </>
              )}
            </div>
          ) : null}
          {notice ? (
            <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${equityNotified ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : watching ? "theme-panel border" : "theme-alert-error"}`}>
              {notice}
            </p>
          ) : null}
        </section>
        <aside className="theme-panel rounded-3xl border p-6">
          <h2 className="theme-heading text-2xl font-semibold">{token ? "Token pack" : charge?.plan?.name}</h2>
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
              <dt className="theme-text-muted">{product}</dt>
              <dd className="theme-heading">{formatBillingMoney(due, currency)}</dd>
            </div>
            {Number(charge?.discount) > 0 ? (
              <div className="theme-text-muted flex justify-between gap-4">
                <dt>Discount</dt>
                <dd>−{formatBillingMoney(charge.discount, currency)}</dd>
              </div>
            ) : null}
            <div className="theme-heading flex justify-between gap-4 border-t border-[var(--theme-border)] pt-3 font-semibold">
              <dt>Due today</dt>
              <dd>{formatBillingMoney(due, currency)}</dd>
            </div>
          </dl>
          {paymentMethod === "mpesa_stk" && paymentMethods?.mpesa_stk ? (
            <>
              <button
                type="button"
                disabled={busy !== ""}
                onClick={onPay}
                className="theme-primary-btn mt-6 w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
              >
                {busy === "stk" ? "Sending prompt…" : "Send M-Pesa STK prompt"}
              </button>
              <p className="theme-subtext mt-4 text-xs leading-5">
                Pay {formatBillingMoney(due, currency)} to Paybill {paybill?.short_code || "—"} account {account || "your organisation code"}. This does not renew by itself.
              </p>
            </>
          ) : paymentMethod === "equity" ? (
            <p className="theme-subtext mt-6 text-xs leading-5">
              Transfer exactly {formatBillingMoney(due, currency)}. Your plan activates after the Equity payment is verified by a platform administrator.
            </p>
          ) : paymentMethod === "mpesa_manual" ? (
            <p className="theme-subtext mt-6 text-xs leading-5">
              Transfer exactly {formatBillingMoney(due, currency)}. Your plan activates after the M-Pesa transaction code is confirmed.
            </p>
          ) : (
            <p className="theme-subtext mt-6 text-xs leading-5">Choose a payment method to continue.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
